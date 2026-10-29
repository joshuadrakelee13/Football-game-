"""
Gibraltar - build the Unreal level from the GIS pipeline output.

Run it either
  * from Scripts/BuildWorld.bat (recommended), or
  * headless:  UnrealEditor-Cmd.exe <path>/Gibraltar.uproject -run=pythonscript -script=<path>/Scripts/import_gibraltar.py
  * in the editor GUI:  UnrealEditor.exe <path>/Gibraltar.uproject -ExecutePythonScript=<path>/Scripts/import_gibraltar.py
    or Tools > Execute Python Script... with the level closed.

Input (see gibraltar/docs/MANIFEST.md and COORDINATES.md):
  <build>/manifest.json, <build>/tiles/<tile_id>/{terrain,roads,buildings,walls}.glb,
  <build>/tiles/<tile_id>/features.json, <build>/../audio/*.wav

Environment variables:
  GIBRALTAR_BUILD_DIR    pipeline output folder (default: <project>/../../data/build)
  GIBRALTAR_AUDIO_DIR    folder with the ambience .wav files (default: <build>/../audio)
  GIBRALTAR_ONLY_TILES   comma-separated tile ids to import (for quick tests), e.g. "T_E0_N0,T_W1_N0"
  GIBRALTAR_SEA_MARGIN_M sea plane margin around project_bounds_m in metres (default 3000)

Output:
  /Game/Gibraltar/Materials   master vertex-colour material + one instance per glTF material, M_Sea
  /Game/Gibraltar/Tiles/<id>  SM_<id>_<layer> static meshes (Nanite for terrain/buildings/walls,
                              complex-as-simple collision)
  /Game/Gibraltar/Audio       looping ambience sound waves
  /Game/Gibraltar/Maps/L_Gibraltar  World Partition level with tiles, sea, sky, landmarks, PlayerStart
  <project>/Saved/GibraltarImport/report.json and status.txt ("OK" or "FAILED")

The script is idempotent: re-running it re-imports meshes in place and rebuilds the level.
"""

import itertools
import json
import os
import re
import shutil
import time
import traceback

import unreal

# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

GAME_ROOT = "/Game/Gibraltar"
MAP_PATH = GAME_ROOT + "/Maps/L_Gibraltar"
MAT_DIR = GAME_ROOT + "/Materials"
TILES_DIR = GAME_ROOT + "/Tiles"
AUDIO_DIR = GAME_ROOT + "/Audio"

MASTER_MATERIAL = "M_GibVertexColour"
SEA_MATERIAL = "M_Sea"

# glTF material name -> (roughness, specular) for the instance of the master material.
MATERIAL_PARAMS = {
    "M_Terrain": (0.92, 0.35),
    "M_Cliff": (0.95, 0.30),
    "M_Road": (0.80, 0.40),
    "M_Path": (0.85, 0.40),
    "M_Steps": (0.80, 0.40),
    "M_BuildingWall": (0.85, 0.45),
    "M_BuildingRoof": (0.70, 0.45),
    "M_Wall": (0.92, 0.35),
    "M_Prop": (0.70, 0.40),       # street furniture at OSM positions (generic models)
    "M_Foliage": (0.90, 0.25),    # tree crowns and hedges
    "M_Window": (0.08, 0.90),     # window glass (procedural positions)
    "M_Door": (0.60, 0.40),       # doors and door frames (mapped OSM entrances, else procedural)
}
FALLBACK_MATERIAL = "M_Terrain"

LAYERS = ["terrain", "roads", "buildings", "walls", "props", "facades"]
NANITE_LAYERS = {"terrain", "buildings", "walls", "props", "facades"}
# Doors and windows are thin quads a few centimetres in front of the walls; the
# walls already block the player, so these get no collision.
NO_COLLISION_LAYERS = {"facades"}
# Terrain is small (~100 tiles x ~20k triangles) and must be visible from far away: never stream it out.
ALWAYS_LOADED_LAYERS = {"terrain"}

# World Partition runtime grid: 500 m cells (= the tile grid), 1.25 km loading range.
WP_CELL_SIZE_CM = 50000
WP_LOADING_RANGE_CM = 125000.0

# Bounds verification tolerance (MANIFEST.md: 1 cm) plus a little slack for float/normal rounding.
BOUNDS_TOLERANCE_CM = 1.0 + 0.5

# The invisible floor under the sea: lets you paddle along the shore but never fall into the void.
SEA_SAFETY_FLOOR_DEPTH_CM = 60.0

TAG_IMPORT = "GibraltarImport"

# ---------------------------------------------------------------------------
# Logging / bookkeeping
# ---------------------------------------------------------------------------

REPORT = {
    "started_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    "warnings": [],
    "errors": [],
    "tiles": {},
}
_seen_warnings = set()


def info(msg):
    unreal.log("[Gibraltar] " + msg)


def warn(msg, once_key=None):
    if once_key is not None:
        if once_key in _seen_warnings:
            return
        _seen_warnings.add(once_key)
    REPORT["warnings"].append(msg)
    unreal.log_warning("[Gibraltar] WARNING: " + msg)


def error(msg):
    REPORT["errors"].append(msg)
    unreal.log_error("[Gibraltar] ERROR: " + msg)


def try_set(obj, prop, value, context=""):
    """set_editor_property that never throws; reports unknown properties once."""
    if obj is None:
        return False
    try:
        obj.set_editor_property(prop, value)
        return True
    except Exception as exc:  # noqa: BLE001 - API differs between engine versions
        warn("could not set %s.%s (%s): %s" % (type(obj).__name__, prop, context, exc),
             once_key="set:%s.%s" % (type(obj).__name__, prop))
        return False


def try_get(obj, prop, default=None):
    if obj is None:
        return default
    try:
        return obj.get_editor_property(prop)
    except Exception:  # noqa: BLE001
        return default


# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

def project_dir():
    return os.path.abspath(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir()))


def content_dir():
    return os.path.join(project_dir(), "Content")


def build_dir():
    env = os.environ.get("GIBRALTAR_BUILD_DIR")
    if env:
        return os.path.abspath(env)
    return os.path.abspath(os.path.join(project_dir(), "..", "..", "data", "build"))


def audio_dir():
    env = os.environ.get("GIBRALTAR_AUDIO_DIR")
    if env:
        return os.path.abspath(env)
    return os.path.abspath(os.path.join(build_dir(), "..", "audio"))


def report_dir():
    path = os.path.join(project_dir(), "Saved", "GibraltarImport")
    os.makedirs(path, exist_ok=True)
    return path


# ---------------------------------------------------------------------------
# Engine handles
# ---------------------------------------------------------------------------

EAL = unreal.EditorAssetLibrary
MEL = unreal.MaterialEditingLibrary
ASSET_TOOLS = unreal.AssetToolsHelpers.get_asset_tools()


def actor_subsystem():
    return unreal.get_editor_subsystem(unreal.EditorActorSubsystem)


def level_subsystem():
    return unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)


def editor_world():
    try:
        return unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()
    except Exception:  # noqa: BLE001
        return unreal.EditorLevelLibrary.get_editor_world()


def ensure_directory(path):
    if not EAL.does_directory_exist(path):
        EAL.make_directory(path)


def load_if_exists(path):
    if EAL.does_asset_exist(path):
        return EAL.load_asset(path)
    return None


def save_asset(asset):
    try:
        EAL.save_loaded_asset(asset, False)
    except Exception as exc:  # noqa: BLE001
        warn("could not save %s: %s" % (asset.get_path_name(), exc))


def package_path(obj):
    return obj.get_path_name().split(".")[0]


def sanitize(text):
    return re.sub(r"[^A-Za-z0-9_]+", "_", text or "").strip("_") or "unnamed"


# ---------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------

def create_or_reset_material(name):
    path = "%s/%s" % (MAT_DIR, name)
    mat = load_if_exists(path)
    if mat is not None and not isinstance(mat, unreal.Material):
        error("%s exists but is not a Material; delete it and re-run." % path)
        return None
    if mat is None:
        mat = ASSET_TOOLS.create_asset(name, MAT_DIR, unreal.Material, unreal.MaterialFactoryNew())
    else:
        MEL.delete_all_material_expressions(mat)
    return mat


def scalar_param(mat, name, value, x, y):
    node = MEL.create_material_expression(mat, unreal.MaterialExpressionScalarParameter, x, y)
    node.set_editor_property("parameter_name", name)
    node.set_editor_property("default_value", value)
    return node


def build_master_material():
    mat = create_or_reset_material(MASTER_MATERIAL)
    if mat is None:
        return None

    vertex_colour = MEL.create_material_expression(mat, unreal.MaterialExpressionVertexColor, -700, -100)
    tint = MEL.create_material_expression(mat, unreal.MaterialExpressionVectorParameter, -700, 100)
    tint.set_editor_property("parameter_name", "Tint")
    tint.set_editor_property("default_value", unreal.LinearColor(1.0, 1.0, 1.0, 1.0))
    multiply = MEL.create_material_expression(mat, unreal.MaterialExpressionMultiply, -400, 0)
    MEL.connect_material_expressions(vertex_colour, "", multiply, "A")
    MEL.connect_material_expressions(tint, "", multiply, "B")
    MEL.connect_material_property(multiply, "", unreal.MaterialProperty.MP_BASE_COLOR)

    roughness = scalar_param(mat, "Roughness", 0.85, -400, 200)
    MEL.connect_material_property(roughness, "", unreal.MaterialProperty.MP_ROUGHNESS)
    specular = scalar_param(mat, "Specular", 0.4, -400, 320)
    MEL.connect_material_property(specular, "", unreal.MaterialProperty.MP_SPECULAR)

    try_set(mat, "two_sided", False, "master material")
    try_set(mat, "used_with_nanite", True, "master material")
    MEL.recompile_material(mat)
    save_asset(mat)
    info("Material %s/%s ready." % (MAT_DIR, MASTER_MATERIAL))
    return mat


def build_sea_material():
    mat = create_or_reset_material(SEA_MATERIAL)
    if mat is None:
        return None
    colour = MEL.create_material_expression(mat, unreal.MaterialExpressionConstant3Vector, -400, 0)
    colour.set_editor_property("constant", unreal.LinearColor(0.012, 0.055, 0.085, 1.0))
    MEL.connect_material_property(colour, "", unreal.MaterialProperty.MP_BASE_COLOR)
    roughness = scalar_param(mat, "Roughness", 0.05, -400, 150)
    MEL.connect_material_property(roughness, "", unreal.MaterialProperty.MP_ROUGHNESS)
    specular = scalar_param(mat, "Specular", 0.5, -400, 260)
    MEL.connect_material_property(specular, "", unreal.MaterialProperty.MP_SPECULAR)
    try_set(mat, "two_sided", False, "sea material")
    MEL.recompile_material(mat)
    save_asset(mat)
    info("Material %s/%s ready." % (MAT_DIR, SEA_MATERIAL))
    return mat


def build_material_instances(master):
    instances = {}
    for name, (roughness, specular) in MATERIAL_PARAMS.items():
        path = "%s/%s" % (MAT_DIR, name)
        mi = load_if_exists(path)
        if mi is not None and not isinstance(mi, unreal.MaterialInstanceConstant):
            error("%s exists but is not a material instance; delete it and re-run." % path)
            continue
        if mi is None:
            mi = ASSET_TOOLS.create_asset(name, MAT_DIR, unreal.MaterialInstanceConstant,
                                          unreal.MaterialInstanceConstantFactoryNew())
        MEL.set_material_instance_parent(mi, master)
        MEL.set_material_instance_scalar_parameter_value(mi, "Roughness", roughness)
        MEL.set_material_instance_scalar_parameter_value(mi, "Specular", specular)
        MEL.update_material_instance(mi)
        save_asset(mi)
        instances[name] = mi
    info("Material instances ready: %s" % ", ".join(sorted(instances)))
    return instances


def _norm(text):
    return re.sub(r"[^a-z0-9]", "", (text or "").lower())


def match_material(slot_name):
    """Map an imported slot name ('M_BuildingWall', 'M_BuildingWall_1', 'BuildingWall'...) to our key."""
    norm = _norm(slot_name)
    if not norm:
        return None
    keys = sorted(MATERIAL_PARAMS, key=len, reverse=True)
    for key in keys:  # exact, ignoring trailing digits
        if re.sub(r"\d+$", "", norm) == _norm(key):
            return key
    for key in keys:  # substring with prefix
        if _norm(key) in norm:
            return key
    for key in keys:  # substring without the "M_" prefix
        if _norm(key)[1:] in norm:
            return key
    return None


# ---------------------------------------------------------------------------
# Import
# ---------------------------------------------------------------------------

def set_cvar(command):
    try:
        unreal.SystemLibrary.execute_console_command(None, command)
    except Exception as exc:  # noqa: BLE001
        warn("console command '%s' failed: %s" % (command, exc), once_key="cvar:" + command)


def make_interchange_pipeline(layer, asset_name):
    if not hasattr(unreal, "InterchangeGenericAssetsPipeline"):
        warn("unreal.InterchangeGenericAssetsPipeline is not available; using importer defaults.",
             once_key="no-interchange")
        return None

    pipe = unreal.InterchangeGenericAssetsPipeline()
    try_set(pipe, "use_source_name_for_asset", False, "pipeline")
    try_set(pipe, "asset_name", asset_name, "pipeline")

    common = try_get(pipe, "common_meshes_properties")
    if common is not None:
        if hasattr(unreal, "InterchangeForceMeshType"):
            try_set(common, "force_all_mesh_as_type", unreal.InterchangeForceMeshType.IFMT_STATIC_MESH, "common meshes")
        if hasattr(unreal, "InterchangeVertexColorImportOption"):
            try_set(common, "vertex_color_import_option",
                    unreal.InterchangeVertexColorImportOption.IVCIO_REPLACE, "common meshes")
        try_set(common, "recompute_normals", False, "common meshes")
        try_set(common, "remove_degenerates", False, "common meshes")
        try_set(common, "import_lods", False, "common meshes")
        try_set(common, "bake_meshes", True, "common meshes")
    else:
        warn("pipeline has no common_meshes_properties; vertex colours rely on importer defaults.",
             once_key="no-common")

    mesh = try_get(pipe, "mesh_pipeline")
    if mesh is not None:
        try_set(mesh, "import_static_meshes", True, "mesh pipeline")
        try_set(mesh, "import_skeletal_meshes", False, "mesh pipeline")
        try_set(mesh, "combine_static_meshes", True, "mesh pipeline")
        try_set(mesh, "build_nanite", layer in NANITE_LAYERS, "mesh pipeline")
        try_set(mesh, "generate_lightmap_u_vs", False, "mesh pipeline")
        try_set(mesh, "import_collision_according_to_mesh_name", False, "mesh pipeline")
    else:
        warn("pipeline has no mesh_pipeline.", once_key="no-mesh-pipeline")

    materials = try_get(pipe, "material_pipeline")
    if materials is not None:
        # Our own material instances are assigned per slot after import.
        try_set(materials, "import_materials", False, "material pipeline")
        textures = try_get(materials, "texture_pipeline")
        if textures is not None:
            try_set(textures, "import_textures", False, "texture pipeline")

    animation = try_get(pipe, "animation_pipeline")
    if animation is not None:
        try_set(animation, "import_animations", False, "animation pipeline")
    return pipe


def run_import_task(filename, destination_path, destination_name, options):
    task = unreal.AssetImportTask()
    task.set_editor_property("filename", filename)
    task.set_editor_property("destination_path", destination_path)
    task.set_editor_property("destination_name", destination_name)
    task.set_editor_property("automated", True)
    task.set_editor_property("replace_existing", True)
    try_set(task, "replace_existing_settings", True, "import task")
    task.set_editor_property("save", True)
    if options is not None:
        task.set_editor_property("options", options)
    ASSET_TOOLS.import_asset_tasks([task])
    try:
        paths = list(task.get_editor_property("imported_object_paths") or [])
    except Exception:  # noqa: BLE001
        paths = []
    return [str(p) for p in paths]


def import_layer(tile_id, layer, glb_path):
    """Import one .glb and return the list of resulting static meshes (normally exactly one)."""
    dest_dir = "%s/%s" % (TILES_DIR, tile_id)
    dest_name = "SM_%s_%s" % (tile_id, layer)
    canonical = "%s/%s" % (dest_dir, dest_name)
    ensure_directory(dest_dir)

    paths = run_import_task(glb_path, dest_dir, dest_name, make_interchange_pipeline(layer, dest_name))

    meshes, others = [], []
    for path in paths:
        asset = unreal.load_asset(path)
        if isinstance(asset, unreal.StaticMesh):
            meshes.append(asset)
        elif asset is not None:
            others.append(asset)

    if not meshes:
        # Some engine versions don't report imported paths; look for the asset ourselves.
        candidate = load_if_exists(canonical)
        if isinstance(candidate, unreal.StaticMesh):
            meshes.append(candidate)
        else:
            for path in EAL.list_assets(dest_dir, False, False):
                asset = EAL.load_asset(path)
                if isinstance(asset, unreal.StaticMesh) and layer in asset.get_name().lower() \
                        and asset.get_name() != dest_name:
                    meshes.append(asset)

    # Normalise the asset name so re-runs replace the same asset.
    if len(meshes) == 1 and package_path(meshes[0]) != canonical:
        old_path = package_path(meshes[0])
        if EAL.does_asset_exist(canonical):
            EAL.delete_asset(canonical)
        if EAL.rename_asset(old_path, canonical):
            meshes = [EAL.load_asset(canonical)]
            info("renamed %s -> %s" % (old_path, canonical))
        else:
            warn("could not rename %s to %s" % (old_path, canonical))

    if len(meshes) > 1:
        warn("%s/%s: importer produced %d static meshes (expected 1, 'combine meshes' not applied); "
             "all are placed." % (tile_id, layer, len(meshes)))

    # Drop any materials/textures the importer created anyway (our instances are used instead).
    for asset in others:
        if isinstance(asset, (unreal.MaterialInterface, unreal.Texture)):
            try:
                EAL.delete_asset(package_path(asset))
            except Exception:  # noqa: BLE001
                pass
    return meshes


def configure_mesh(mesh, layer, instances, master):
    """Materials by slot name, Nanite, complex-as-simple collision. Returns list of unmatched slots."""
    unmatched = []
    static_materials = try_get(mesh, "static_materials", []) or []
    for index, slot in enumerate(static_materials):
        slot_name = str(try_get(slot, "material_slot_name", ""))
        imported_name = str(try_get(slot, "imported_material_slot_name", ""))
        key = match_material(slot_name) or match_material(imported_name)
        if key is None:
            current = try_get(slot, "material_interface")
            key = match_material(current.get_name()) if current is not None else None
        if key is None or key not in instances:
            unmatched.append(slot_name or imported_name or str(index))
            mesh.set_material(index, instances.get(FALLBACK_MATERIAL, master))
        else:
            mesh.set_material(index, instances[key])

    # Nanite: full-resolution fallback mesh so collision (built from it) stays exact on stairs.
    enable_nanite = layer in NANITE_LAYERS
    nanite = try_get(mesh, "nanite_settings")
    if nanite is not None:
        try_set(nanite, "enabled", enable_nanite, "nanite settings")
        if enable_nanite:
            if hasattr(unreal, "NaniteFallbackTarget"):
                try_set(nanite, "fallback_target", unreal.NaniteFallbackTarget.PERCENT_TRIANGLES, "nanite settings")
            try_set(nanite, "fallback_percent_triangles", 1.0, "nanite settings")
        try_set(mesh, "nanite_settings", nanite, "static mesh")
    else:
        warn("static meshes have no nanite_settings property in this engine version.", once_key="no-nanite")

    # Collision: use the render triangles as the collision shape.
    if layer in NO_COLLISION_LAYERS:
        save_asset(mesh)
        return unmatched
    body = try_get(mesh, "body_setup")
    if body is None and hasattr(unreal, "StaticMeshEditorSubsystem"):
        try:
            sme = unreal.get_editor_subsystem(unreal.StaticMeshEditorSubsystem)
            sme.add_simple_collisions(mesh, unreal.ScriptCollisionShapeType.BOX)
            body = try_get(mesh, "body_setup")
        except Exception as exc:  # noqa: BLE001
            warn("could not create a body setup for %s: %s" % (mesh.get_name(), exc))
    if body is not None:
        try_set(body, "collision_trace_flag", unreal.CollisionTraceFlag.CTF_USE_COMPLEX_AS_SIMPLE, "body setup")
    else:
        error("%s has no collision body; the player would fall through it." % mesh.get_path_name())

    save_asset(mesh)
    return unmatched


def triangle_count(mesh):
    for name in ("get_num_triangles",):
        fn = getattr(mesh, name, None)
        if fn is not None:
            try:
                return int(fn(0))
            except Exception:  # noqa: BLE001
                pass
    return None


# ---------------------------------------------------------------------------
# Axis / bounds verification
# ---------------------------------------------------------------------------

def expected_ue_bounds(bounds_m):
    (minx, miny, minz), (maxx, maxy, maxz) = bounds_m
    return ((minx * 100.0, -maxy * 100.0, minz * 100.0),
            (maxx * 100.0, -miny * 100.0, maxz * 100.0))


def mesh_bounds(meshes):
    lo = [float("inf")] * 3
    hi = [float("-inf")] * 3
    for mesh in meshes:
        box = mesh.get_bounding_box()
        for i, comp in enumerate(("x", "y", "z")):
            lo[i] = min(lo[i], getattr(box.min, comp))
            hi[i] = max(hi[i], getattr(box.max, comp))
    return lo, hi


def _build_candidates():
    """Signed axis permutations x scale: imported[i] = sign[i] * scale * expected[perm[i]]."""
    out = []
    for scale in (1.0, 100.0, 0.01):
        for perm in itertools.permutations(range(3)):
            for signs in itertools.product((1, -1), repeat=3):
                out.append((perm, signs, scale))
    identity = ((0, 1, 2), (1, 1, 1), 1.0)
    out.remove(identity)
    return [identity] + out


CANDIDATES = _build_candidates()


def describe_candidate(cand):
    perm, signs, scale = cand
    axes = "XYZ"
    parts = ["%s=%s%s" % (axes[i], "+" if signs[i] > 0 else "-", axes[perm[i]]) for i in range(3)]
    text = "imported " + ", ".join(parts) + " of expected"
    if scale != 1.0:
        text += ", scaled x%g" % scale
    return text


def candidate_matches(cand, exp_lo, exp_hi, act_lo, act_hi):
    perm, signs, scale = cand
    tolerance = BOUNDS_TOLERANCE_CM * scale
    for i in range(3):
        a = exp_lo[perm[i]] * signs[i] * scale
        b = exp_hi[perm[i]] * signs[i] * scale
        if abs(act_lo[i] - min(a, b)) > tolerance or abs(act_hi[i] - max(a, b)) > tolerance:
            return False
    return True


def correction_transform(cand):
    """Rotation + scale that maps imported mesh coordinates back to the expected Unreal frame."""
    perm, signs, scale = cand
    # expected = (1/scale) * Q * imported, with Q[perm[i]][i] = signs[i]
    q = [[0.0] * 3 for _ in range(3)]
    for i in range(3):
        q[perm[i]][i] = float(signs[i])
    det = (q[0][0] * (q[1][1] * q[2][2] - q[1][2] * q[2][1])
           - q[0][1] * (q[1][0] * q[2][2] - q[1][2] * q[2][0])
           + q[0][2] * (q[1][0] * q[2][1] - q[1][1] * q[2][0]))
    mirror_z = -1.0 if det < 0 else 1.0
    # R = Q * diag(1, 1, mirror_z); its columns are the images of the local X, Y, Z axes.
    forward = unreal.Vector(q[0][0], q[1][0], q[2][0])
    right = unreal.Vector(q[0][1], q[1][1], q[2][1])
    up = unreal.Vector(q[0][2] * mirror_z, q[1][2] * mirror_z, q[2][2] * mirror_z)
    rotation = unreal.MathLibrary.make_rotation_from_axes(forward, right, up)
    inv = 1.0 / scale
    return rotation, unreal.Vector(inv, inv, inv * mirror_z)


# ---------------------------------------------------------------------------
# Level
# ---------------------------------------------------------------------------

def unload_and_delete_level():
    try:
        unreal.EditorLoadingAndSavingUtils.new_blank_map(False)
    except Exception as exc:  # noqa: BLE001
        warn("could not switch to a blank map: %s" % exc)

    if EAL.does_asset_exist(MAP_PATH):
        info("Deleting the previous %s ..." % MAP_PATH)
        if not EAL.delete_asset(MAP_PATH):
            warn("could not delete %s; the new level may fail to be created." % MAP_PATH)

    # World Partition keeps one package per actor next to the map.
    relative = MAP_PATH[len("/Game/"):]
    for root in ("__ExternalActors__", "__ExternalObjects__"):
        game_dir = "/Game/%s/%s" % (root, relative)
        try:
            if EAL.does_directory_exist(game_dir):
                EAL.delete_directory(game_dir)
        except Exception as exc:  # noqa: BLE001
            warn("could not delete %s: %s" % (game_dir, exc))
        disk_dir = os.path.join(content_dir(), root, *relative.split("/"))
        if os.path.isdir(disk_dir):
            shutil.rmtree(disk_dir, ignore_errors=True)


def create_level():
    les = level_subsystem()
    created = False
    partitioned = False
    try:
        created = bool(les.new_level(MAP_PATH, True))
        partitioned = created
    except TypeError:
        warn("LevelEditorSubsystem.new_level() has no is_partitioned_world argument in this engine version; "
             "creating a normal (non-World-Partition) level. Convert it with Tools > Convert Level if needed.")
        created = bool(les.new_level(MAP_PATH))
    except Exception as exc:  # noqa: BLE001
        warn("new_level failed: %s" % exc)

    if not created:
        try:
            created = bool(unreal.EditorLevelLibrary.new_level(MAP_PATH))
            if created:
                warn("created %s with EditorLevelLibrary.new_level (not World Partition)." % MAP_PATH)
        except Exception as exc:  # noqa: BLE001
            error("could not create %s: %s" % (MAP_PATH, exc))
    if created:
        info("Created level %s (World Partition: %s)." % (MAP_PATH, "yes" if partitioned else "no"))
    return created, partitioned


def configure_world_partition(world):
    """Set the runtime streaming grid. Engine versions expose this differently, so try several ways."""
    world_path = world.get_path_name()
    changed = False

    if hasattr(unreal, "WorldPartitionRuntimeSpatialHash") and hasattr(unreal, "ObjectIterator"):
        try:
            for spatial_hash in unreal.ObjectIterator(unreal.WorldPartitionRuntimeSpatialHash):
                if not spatial_hash.get_path_name().startswith(world_path):
                    continue
                grids = spatial_hash.get_editor_property("grids")
                if not grids:
                    continue
                grid = grids[0]
                grid.set_editor_property("cell_size", WP_CELL_SIZE_CM)
                grid.set_editor_property("loading_range", WP_LOADING_RANGE_CM)
                grids[0] = grid
                spatial_hash.set_editor_property("grids", grids)
                spatial_hash.modify()
                changed = True
        except Exception as exc:  # noqa: BLE001
            warn("could not edit the World Partition spatial hash grid: %s" % exc)

    if not changed and hasattr(unreal, "WorldPartitionRuntimePartitionLHGrid") and hasattr(unreal, "ObjectIterator"):
        try:
            for partition in unreal.ObjectIterator(unreal.WorldPartitionRuntimePartitionLHGrid):
                if not partition.get_path_name().startswith(world_path):
                    continue
                ok_cell = try_set(partition, "cell_size", WP_CELL_SIZE_CM, "runtime partition")
                ok_range = try_set(partition, "loading_range", WP_LOADING_RANGE_CM, "runtime partition")
                changed = changed or ok_cell or ok_range
        except Exception as exc:  # noqa: BLE001
            warn("could not edit the World Partition runtime partition: %s" % exc)

    if changed:
        info("World Partition runtime grid: cell %d m, loading range %d m."
             % (WP_CELL_SIZE_CM // 100, int(WP_LOADING_RANGE_CM // 100)))
    else:
        warn("could not set the World Partition grid from Python. Do it by hand once: World Settings > "
             "World Partition Setup > Runtime Hash > Grids > MainGrid: Cell Size %d, Loading Range %d."
             % (WP_CELL_SIZE_CM, int(WP_LOADING_RANGE_CM)))


def spawn(actor_class, location, rotation=None, label=None, folder=None, spatially_loaded=None):
    actor = actor_subsystem().spawn_actor_from_class(actor_class, location, rotation or unreal.Rotator())
    if actor is None:
        error("could not spawn %s" % actor_class)
        return None
    if label:
        actor.set_actor_label(label)
    if folder:
        actor.set_folder_path(folder)
    if spatially_loaded is not None:
        try_set(actor, "is_spatially_loaded", spatially_loaded, "actor")
    tags = list(try_get(actor, "tags", []) or [])
    tags.append(unreal.Name(TAG_IMPORT))
    try_set(actor, "tags", tags, "actor")
    return actor


def add_tag(actor, tag):
    tags = list(try_get(actor, "tags", []) or [])
    tags.append(unreal.Name(tag))
    try_set(actor, "tags", tags, "actor")


def to_ue(position_m):
    x, y = position_m[0], position_m[1]
    z = position_m[2] if len(position_m) > 2 else 0.0
    return unreal.Vector(x * 100.0, -y * 100.0, z * 100.0)


def heading_to_rotator(heading_deg):
    # Compass heading (0 = north, 90 = east) -> Unreal yaw (0 = +X = east, 90 = +Y = south).
    return unreal.Rotator(pitch=0.0, yaw=float(heading_deg) - 90.0, roll=0.0)


def static_mesh_component(actor):
    comp = try_get(actor, "static_mesh_component")
    if comp is None:
        comp = actor.get_component_by_class(unreal.StaticMeshComponent)
    return comp


def spawn_tile_actor(tile, layer, meshes, rotation, scale):
    tile_id = tile["id"]
    origin = tile.get("origin_m", [tile["ix"] * 500.0, tile["iy"] * 500.0, 0.0])
    location = to_ue(origin)
    actors = []
    for index, mesh in enumerate(meshes):
        label = "%s_%s" % (tile_id, layer) if len(meshes) == 1 else "%s_%s_%d" % (tile_id, layer, index)
        actor = spawn(unreal.StaticMeshActor, location, rotation, label, "Tiles/%s" % layer,
                      spatially_loaded=(layer not in ALWAYS_LOADED_LAYERS))
        if actor is None:
            continue
        comp = static_mesh_component(actor)
        comp.set_mobility(unreal.ComponentMobility.STATIC)
        comp.set_static_mesh(mesh)
        if layer in NO_COLLISION_LAYERS:
            comp.set_collision_enabled(unreal.CollisionEnabled.NO_COLLISION)
        else:
            comp.set_collision_profile_name("BlockAll")
        actor.set_actor_scale3d(scale)
        add_tag(actor, "Tile_%s" % tile_id)
        add_tag(actor, "Layer_%s" % layer)
        actors.append(actor)
    return actors


def spawn_sea(manifest, sea_material):
    bounds = manifest.get("project_bounds_m")
    if not bounds or len(bounds) != 4:
        warn("manifest has no project_bounds_m; sea plane not placed.")
        return
    margin = float(os.environ.get("GIBRALTAR_SEA_MARGIN_M", "3000"))
    xmin, ymin, xmax, ymax = [float(v) for v in bounds]
    sea_level_cm = float(manifest.get("sea_level_m", 0.0)) * 100.0
    size_x = (xmax - xmin) + 2.0 * margin    # metres; the engine plane is 1 m x 1 m
    size_y = (ymax - ymin) + 2.0 * margin
    centre = unreal.Vector((xmin + xmax) * 50.0, -(ymin + ymax) * 50.0, sea_level_cm - 2.0)

    plane = EAL.load_asset("/Engine/BasicShapes/Plane")
    sea = spawn(unreal.StaticMeshActor, centre, None, "Sea", "Environment", spatially_loaded=False)
    if sea is not None:
        comp = static_mesh_component(sea)
        comp.set_mobility(unreal.ComponentMobility.STATIC)
        comp.set_static_mesh(plane)
        if sea_material is not None:
            comp.set_material(0, sea_material)
        comp.set_collision_enabled(unreal.CollisionEnabled.NO_COLLISION)
        try_set(comp, "cast_shadow", False, "sea")
        sea.set_actor_scale3d(unreal.Vector(size_x, size_y, 1.0))

    # Invisible floor 60 cm below the surface (see README "The sea").
    cube = EAL.load_asset("/Engine/BasicShapes/Cube")
    floor_top = sea_level_cm - SEA_SAFETY_FLOOR_DEPTH_CM
    floor = spawn(unreal.StaticMeshActor, unreal.Vector(centre.x, centre.y, floor_top - 50.0), None,
                  "SeaSafetyFloor", "Environment", spatially_loaded=False)
    if floor is not None:
        comp = static_mesh_component(floor)
        comp.set_mobility(unreal.ComponentMobility.STATIC)
        comp.set_static_mesh(cube)
        comp.set_collision_profile_name("InvisibleWall")
        comp.set_visibility(False)
        try_set(comp, "cast_shadow", False, "sea floor")
        floor.set_actor_hidden_in_game(True)
        floor.set_actor_scale3d(unreal.Vector(size_x, size_y, 1.0))
    info("Sea plane %.1f x %.1f km at z=%.2f m, safety floor at z=%.2f m."
         % (size_x / 1000.0, size_y / 1000.0, (sea_level_cm - 2.0) / 100.0, floor_top / 100.0))


def spawn_player_start(manifest):
    spawn_info = manifest.get("spawn") or {}
    position = spawn_info.get("position_m")
    if not position:
        warn("manifest has no spawn.position_m; PlayerStart placed at the origin.")
        position = [0.0, 0.0, 0.0]
    location = to_ue(position)
    location = unreal.Vector(location.x, location.y, location.z + 100.0)
    start = spawn(unreal.PlayerStart, location, heading_to_rotator(spawn_info.get("heading_deg", 0.0)),
                  "PlayerStart_%s" % sanitize(spawn_info.get("name", "Spawn")), "Gameplay")
    info("PlayerStart at %s (%s)." % (position, spawn_info.get("name", "")))
    return start


def spawn_sky():
    def light(label, tag, index, intensity):
        actor = spawn(unreal.DirectionalLight, unreal.Vector(0, 0, 50000), None, label, "Sky", spatially_loaded=False)
        if actor is None:
            return None
        add_tag(actor, tag)
        comp = try_get(actor, "light_component") or try_get(actor, "directional_light_component")
        if comp is not None:
            comp.set_mobility(unreal.ComponentMobility.MOVABLE)
            try_set(comp, "atmosphere_sun_light", True, "directional light")
            try_set(comp, "atmosphere_sun_light_index", index, "directional light")
            try:
                comp.set_intensity(intensity)
            except Exception:  # noqa: BLE001
                try_set(comp, "intensity", intensity, "directional light")
        return actor

    light("Sun", "GibSun", 0, 100000.0)
    light("Moon", "GibMoon", 1, 0.0)

    spawn(unreal.SkyAtmosphere, unreal.Vector(0, 0, 0), None, "SkyAtmosphere", "Sky", spatially_loaded=False)

    sky_light = spawn(unreal.SkyLight, unreal.Vector(0, 0, 50000), None, "SkyLight", "Sky", spatially_loaded=False)
    if sky_light is not None:
        comp = try_get(sky_light, "light_component")
        if comp is not None:
            comp.set_mobility(unreal.ComponentMobility.MOVABLE)
            try_set(comp, "real_time_capture", True, "sky light")

    spawn(unreal.ExponentialHeightFog, unreal.Vector(0, 0, 0), None, "HeightFog", "Sky", spatially_loaded=False)
    spawn(unreal.VolumetricCloud, unreal.Vector(0, 0, 0), None, "VolumetricCloud", "Sky", spatially_loaded=False)

    controller_class = getattr(unreal, "GibraltarSkyController", None)
    if controller_class is None:
        error("unreal.GibraltarSkyController not found: build the C++ module (GibraltarEditor) before running this script.")
        return
    controller = spawn(controller_class, unreal.Vector(0, 0, 1000), None, "GibraltarSkyController", "Sky",
                       spatially_loaded=False)
    if controller is not None:
        try:
            controller.apply_time_of_day_now()
        except Exception as exc:  # noqa: BLE001
            warn("could not preview the time of day in the editor: %s" % exc)


def spawn_ambience():
    cls = getattr(unreal, "GibraltarAmbienceManager", None)
    if cls is None:
        error("unreal.GibraltarAmbienceManager not found: build the C++ module first.")
        return
    spawn(cls, unreal.Vector(0, 0, 1000), None, "GibraltarAmbience", "Sky", spatially_loaded=False)


def spawn_landmarks(manifest):
    cls = getattr(unreal, "GibraltarLandmark", None)
    if cls is None:
        error("unreal.GibraltarLandmark not found: build the C++ module first.")
        return 0
    count = 0
    for poi in manifest.get("pois", []) or []:
        position = poi.get("position_m")
        if not position:
            warn("POI %s has no position_m; skipped." % poi.get("id"))
            continue
        name = poi.get("name") or poi.get("id") or "Landmark"
        actor = spawn(cls, to_ue(position), None, "POI_%s" % sanitize(name), "Landmarks")
        if actor is None:
            continue
        try_set(actor, "landmark_name", str(name), "landmark")
        try_set(actor, "kind", str(poi.get("kind") or ""), "landmark")
        try_set(actor, "description", str(poi.get("description") or ""), "landmark")
        try_set(actor, "source", str(poi.get("source") or ""), "landmark")
        try_set(actor, "poi_id", str(poi.get("id") or ""), "landmark")
        count += 1
    info("Placed %d landmarks." % count)
    return count


def spawn_georeferencing(manifest):
    cls = getattr(unreal, "GeoReferencingSystem", None)
    if cls is None:
        warn("GeoReferencing plugin classes not available; AGeoReferencingSystem not placed.")
        return
    crs = manifest.get("crs", {}) or {}
    projected = crs.get("engine_proj") or \
        "+proj=tmerc +lat_0=36.13 +lon_0=-5.35 +k=1 +x_0=0 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs"
    actor = spawn(cls, unreal.Vector(0, 0, 0), None, "GeoReferencingSystem", "Gameplay", spatially_loaded=False)
    if actor is None:
        return
    if hasattr(unreal, "PlanetShape"):
        try_set(actor, "planet_shape", unreal.PlanetShape.FLAT_PLANET, "georeferencing")
    try_set(actor, "projected_crs", projected, "georeferencing")
    try_set(actor, "geographic_crs", "EPSG:4326", "georeferencing")
    try_set(actor, "origin_at_planet_center", False, "georeferencing")
    try_set(actor, "origin_location_in_projected_crs", True, "georeferencing")
    try_set(actor, "origin_projected_coordinates_easting", 0.0, "georeferencing")
    try_set(actor, "origin_projected_coordinates_northing", 0.0, "georeferencing")
    try_set(actor, "origin_projected_coordinates_up", 0.0, "georeferencing")
    info("GeoReferencingSystem: flat planet, projected CRS = GIB-LTM, geographic CRS = EPSG:4326, origin (0,0,0).")


def place_overrides(tiles):
    placed, missing = 0, 0
    for tile in tiles:
        features_rel = tile.get("features")
        if not features_rel:
            continue
        features_path = os.path.join(build_dir(), *features_rel.split("/"))
        if not os.path.isfile(features_path):
            continue
        try:
            with open(features_path, "r", encoding="utf-8") as handle:
                features = json.load(handle)
        except Exception as exc:  # noqa: BLE001
            warn("could not read %s: %s" % (features_path, exc))
            continue
        for building in features.get("buildings", []) or []:
            override = building.get("override")
            if not override or not override.get("unreal_asset"):
                continue
            asset_path = override["unreal_asset"].split(".")[0]
            asset = load_if_exists(asset_path)
            if asset is None:
                warn("override asset %s for %s does not exist yet." % (asset_path, building.get("id")))
                missing += 1
                continue
            cx, cy = building.get("centroid_m", [0.0, 0.0])[:2]
            location = unreal.Vector(cx * 100.0, -cy * 100.0, float(building.get("ground_min_m", 0.0)) * 100.0)
            label = "Override_%s" % sanitize(building.get("id", "building"))
            if isinstance(asset, unreal.StaticMesh):
                actor = spawn(unreal.StaticMeshActor, location, None, label, "Overrides")
                if actor is not None:
                    comp = static_mesh_component(actor)
                    comp.set_mobility(unreal.ComponentMobility.STATIC)
                    comp.set_static_mesh(asset)
            else:
                actor = actor_subsystem().spawn_actor_from_object(asset, location, unreal.Rotator())
                if actor is not None:
                    actor.set_actor_label(label)
                    actor.set_folder_path("Overrides")
                    add_tag(actor, TAG_IMPORT)
            if actor is not None:
                placed += 1
    if placed or missing:
        info("Overrides: %d placed, %d missing." % (placed, missing))
    return placed


# ---------------------------------------------------------------------------
# Audio
# ---------------------------------------------------------------------------

def import_audio():
    folder = audio_dir()
    if not os.path.isdir(folder):
        warn("audio folder %s not found; the game runs silently until the WAV files exist." % folder)
        return 0
    ensure_directory(AUDIO_DIR)
    count = 0
    for name in sorted(os.listdir(folder)):
        if not name.lower().endswith(".wav"):
            continue
        stem = os.path.splitext(name)[0]
        run_import_task(os.path.join(folder, name), AUDIO_DIR, stem, None)
        wave = load_if_exists("%s/%s" % (AUDIO_DIR, stem))
        if isinstance(wave, unreal.SoundWave):
            try_set(wave, "looping", True, "sound wave")
            save_asset(wave)
            count += 1
        else:
            warn("audio %s did not import as a SoundWave." % name)
    for expected in ("sea_waves", "wind", "birds_day", "crickets_night"):
        if not EAL.does_asset_exist("%s/%s" % (AUDIO_DIR, expected)):
            warn("ambience sound %s.wav is missing in %s." % (expected, folder))
    info("Imported %d audio files." % count)
    return count


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def load_manifest():
    path = os.path.join(build_dir(), "manifest.json")
    if not os.path.isfile(path):
        error("manifest not found: %s. Run the GIS pipeline first (it writes gibraltar/data/build), "
              "or set GIBRALTAR_BUILD_DIR." % path)
        return None
    with open(path, "r", encoding="utf-8") as handle:
        manifest = json.load(handle)
    if manifest.get("schema") != 1:
        warn("manifest schema is %r; this script was written for schema 1." % manifest.get("schema"))
    if float(manifest.get("tile_size_m", 500)) != 500.0:
        error("tile_size_m is %s but COORDINATES.md fixes it at 500 m." % manifest.get("tile_size_m"))
    info("Manifest: %s (pipeline %s, generated %s), %d tiles, %d POIs."
         % (path, manifest.get("pipeline_version"), manifest.get("generated_utc"),
            len(manifest.get("tiles", [])), len(manifest.get("pois", []) or [])))
    return manifest


def write_report(ok):
    REPORT["finished_utc"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    REPORT["status"] = "OK" if ok else "FAILED"
    folder = report_dir()
    with open(os.path.join(folder, "report.json"), "w", encoding="utf-8") as handle:
        json.dump(REPORT, handle, indent=2, default=str)
    with open(os.path.join(folder, "status.txt"), "w", encoding="utf-8") as handle:
        handle.write(REPORT["status"] + "\n")


def main():
    info("Project: %s" % project_dir())
    info("Build data: %s" % build_dir())

    manifest = load_manifest()
    if manifest is None:
        write_report(False)
        return False

    only = {t.strip() for t in os.environ.get("GIBRALTAR_ONLY_TILES", "").split(",") if t.strip()}
    tiles = [t for t in manifest.get("tiles", []) if not only or t.get("id") in only]
    if only:
        info("GIBRALTAR_ONLY_TILES: importing %d of %d tiles." % (len(tiles), len(manifest.get("tiles", []))))

    set_cvar("Interchange.FeatureFlags.Import.GLTF 1")

    # 1) Close the level so its actors don't hold on to the meshes we re-import.
    try:
        unreal.EditorLoadingAndSavingUtils.new_blank_map(False)
    except Exception as exc:  # noqa: BLE001
        warn("could not switch to a blank map: %s" % exc)

    # 2) Materials and audio.
    for folder in (GAME_ROOT, MAT_DIR, TILES_DIR, AUDIO_DIR, GAME_ROOT + "/Maps"):
        ensure_directory(folder)
    master = build_master_material()
    instances = build_material_instances(master) if master else {}
    sea_material = build_sea_material()
    import_audio()

    # 3) Import every tile layer.
    imported = []   # (tile, layer, meshes, expected_lo, expected_hi, actual_lo, actual_hi)
    total_layers = sum(len(t.get("layers", {})) for t in tiles)
    manifest_triangles = 0
    engine_triangles = 0
    with unreal.ScopedSlowTask(max(total_layers, 1), "Importing Gibraltar tiles") as slow:
        slow.make_dialog(True)
        for tile in tiles:
            tile_id = tile["id"]
            tile_report = REPORT["tiles"].setdefault(tile_id, {})
            for layer in LAYERS:
                layer_info = (tile.get("layers") or {}).get(layer)
                if not layer_info:
                    continue
                if slow.should_cancel():
                    error("import cancelled by the user.")
                    write_report(False)
                    return False
                slow.enter_progress_frame(1, "%s %s" % (tile_id, layer))

                glb = os.path.join(build_dir(), *layer_info["file"].split("/"))
                manifest_triangles += int(layer_info.get("triangles", 0) or 0)
                if not os.path.isfile(glb):
                    error("%s/%s: file not found: %s" % (tile_id, layer, glb))
                    tile_report[layer] = "missing file"
                    continue
                try:
                    meshes = import_layer(tile_id, layer, glb)
                except Exception as exc:  # noqa: BLE001
                    error("%s/%s: import failed: %s" % (tile_id, layer, exc))
                    tile_report[layer] = "import failed"
                    continue
                if not meshes:
                    error("%s/%s: no static mesh was produced from %s" % (tile_id, layer, glb))
                    tile_report[layer] = "no mesh"
                    continue

                unmatched = []
                for mesh in meshes:
                    unmatched += configure_mesh(mesh, layer, instances, master)
                    tris = triangle_count(mesh)
                    if tris:
                        engine_triangles += tris
                if unmatched:
                    warn("%s/%s: material slots without a match (using %s): %s"
                         % (tile_id, layer, FALLBACK_MATERIAL, ", ".join(sorted(set(unmatched)))))

                exp_lo, exp_hi = expected_ue_bounds(layer_info["bounds_m"])
                act_lo, act_hi = mesh_bounds(meshes)
                imported.append((tile, layer, meshes, exp_lo, exp_hi, act_lo, act_hi))
                tile_report[layer] = "imported"

    # 4) Verify the import axes against manifest bounds and pick the convention the importer used.
    votes = [0] * len(CANDIDATES)
    matches_per_item = []
    for (_, _, _, exp_lo, exp_hi, act_lo, act_hi) in imported:
        matching = [i for i, cand in enumerate(CANDIDATES) if candidate_matches(cand, exp_lo, exp_hi, act_lo, act_hi)]
        matches_per_item.append(matching)
        for i in matching:
            votes[i] += 1
    best = 0
    if imported and votes[0] < max(votes):
        best = max(range(len(CANDIDATES)), key=lambda i: (votes[i], -i))
    chosen = CANDIDATES[best]
    rotation, scale = correction_transform(chosen)
    if imported:
        if best == 0:
            info("Axis check: importer matches COORDINATES.md (glTF (E,Up,S) -> Unreal (E,S,Up), m -> cm) "
                 "for %d of %d meshes." % (votes[0], len(imported)))
        else:
            warn("Axis check: the importer did NOT use the expected convention. Detected: %s "
                 "(%d of %d meshes). Correcting with actor rotation %s and scale %s."
                 % (describe_candidate(chosen), votes[best], len(imported), rotation, scale))
        REPORT["axis_convention"] = describe_candidate(chosen) if best else "as specified"

    failures = 0
    for item, matching in zip(imported, matches_per_item):
        tile, layer, meshes, exp_lo, exp_hi, act_lo, act_hi = item
        if best not in matching:
            failures += 1
            others = ", ".join(describe_candidate(CANDIDATES[i]) for i in matching[:3]) or "none"
            error("%s/%s: bounds mismatch. expected min %s max %s, imported min %s max %s (cm). Other matching "
                  "conventions: %s" % (tile["id"], layer,
                                       ["%.1f" % v for v in exp_lo], ["%.1f" % v for v in exp_hi],
                                       ["%.1f" % v for v in act_lo], ["%.1f" % v for v in act_hi], others))
            REPORT["tiles"][tile["id"]][layer] = "bounds mismatch"

    # 5) Build the level.
    unload_and_delete_level()
    created, partitioned = create_level()
    if not created:
        write_report(False)
        return False
    world = editor_world()
    if partitioned and world is not None:
        configure_world_partition(world)

    actor_count = 0
    for (tile, layer, meshes, _, _, _, _) in imported:
        actor_count += len(spawn_tile_actor(tile, layer, meshes, rotation, scale))

    spawn_sea(manifest, sea_material)
    spawn_player_start(manifest)
    spawn_sky()
    spawn_ambience()
    landmarks = spawn_landmarks(manifest)
    spawn_georeferencing(manifest)
    overrides = place_overrides(tiles)

    try:
        level_subsystem().save_current_level()
    except Exception as exc:  # noqa: BLE001
        warn("save_current_level failed: %s" % exc)
    try:
        unreal.EditorLoadingAndSavingUtils.save_dirty_packages(True, True)
    except Exception as exc:  # noqa: BLE001
        error("saving packages failed: %s" % exc)

    # 6) Summary.
    tiles_ok = sum(1 for t in tiles if any(v == "imported" for v in REPORT["tiles"].get(t["id"], {}).values()))
    mesh_count = sum(len(item[2]) for item in imported)
    REPORT["summary"] = {
        "tiles_in_manifest": len(manifest.get("tiles", [])),
        "tiles_imported": tiles_ok,
        "layers_imported": len(imported),
        "static_meshes": mesh_count,
        "tile_actors": actor_count,
        "landmarks": landmarks,
        "overrides": overrides,
        "bounds_failures": failures,
        "errors": len(REPORT["errors"]),
        "warnings": len(REPORT["warnings"]),
        "triangles_manifest": manifest_triangles,
        "triangles_engine": engine_triangles or None,
        "world_partition": partitioned,
    }
    ok = not REPORT["errors"]
    lines = [
        "=" * 72,
        "Gibraltar import summary",
        "  tiles imported      : %d / %d" % (tiles_ok, len(tiles)),
        "  layer files         : %d" % len(imported),
        "  static meshes       : %d" % mesh_count,
        "  tile actors         : %d" % actor_count,
        "  landmarks           : %d" % landmarks,
        "  overrides placed    : %d" % overrides,
        "  triangles (manifest): %d" % manifest_triangles,
        "  triangles (engine)  : %s" % (engine_triangles or "n/a"),
        "  bounds failures     : %d" % failures,
        "  warnings            : %d" % len(REPORT["warnings"]),
        "  errors              : %d" % len(REPORT["errors"]),
        "  level               : %s (World Partition: %s)" % (MAP_PATH, "yes" if partitioned else "NO"),
        "  report              : %s" % os.path.join(report_dir(), "report.json"),
        "=" * 72,
    ]
    for line in lines:
        info(line)
    if not ok:
        unreal.log_error("[Gibraltar] ERROR SUMMARY: %d error(s):" % len(REPORT["errors"]))
        for message in REPORT["errors"][:50]:
            unreal.log_error("[Gibraltar]   - " + message)
        if len(REPORT["errors"]) > 50:
            unreal.log_error("[Gibraltar]   ... and %d more (see report.json)" % (len(REPORT["errors"]) - 50))
    write_report(ok)
    return ok


def _run():
    try:
        ok = main()
    except Exception:  # noqa: BLE001
        error("unexpected failure:\n" + traceback.format_exc())
        try:
            write_report(False)
        except Exception:  # noqa: BLE001
            pass
        ok = False
    info("Finished: %s" % ("OK" if ok else "FAILED"))
    return ok


_run()
