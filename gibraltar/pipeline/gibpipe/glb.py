"""Minimal binary glTF 2.0 writer.

Input meshes are in GIB-LTM axes (x east, y north, z up), metres, already
relative to the tile origin. Output uses glTF axes (x east, y up, z south):
    glTF (gx, gy, gz) = (x, z, -y)
That mapping is a proper rotation, so triangle winding is preserved.
"""
import json
import struct

import numpy as np

MATERIALS = {
    # name: (roughness, metallic)
    "M_Terrain": (0.95, 0.0), "M_Cliff": (0.9, 0.0), "M_Road": (0.85, 0.0),
    "M_Path": (0.85, 0.0), "M_Steps": (0.8, 0.0), "M_BuildingWall": (0.85, 0.0),
    "M_BuildingRoof": (0.9, 0.0), "M_Wall": (0.9, 0.0),
}


class Primitive:
    def __init__(self, material, positions, normals, colours, indices, feature_ids=None):
        self.material = material
        self.positions = np.asarray(positions, np.float64)
        self.normals = np.asarray(normals, np.float32)
        self.colours = np.asarray(colours, np.float32)
        self.indices = np.asarray(indices, np.uint32).reshape(-1)
        self.feature_ids = (np.full(len(self.positions), -1, np.float32) if feature_ids is None
                            else np.asarray(feature_ids, np.float32))


def weld(p):
    """Merge vertices that are identical in position (to 0.1 mm), normal,
    colour and feature id. Clipped road and terrain pieces share many."""
    key = np.column_stack([np.round(p.positions * 1e4), np.round(p.normals * 1e3),
                           np.round(p.colours * 255), p.feature_ids])
    _, first, inverse = np.unique(key, axis=0, return_index=True, return_inverse=True)
    p.positions, p.normals = p.positions[first], p.normals[first]
    p.colours, p.feature_ids = p.colours[first], p.feature_ids[first]
    p.indices = inverse.reshape(-1)[p.indices].astype(np.uint32)
    tri = p.indices.reshape(-1, 3)
    ok = (tri[:, 0] != tri[:, 1]) & (tri[:, 1] != tri[:, 2]) & (tri[:, 0] != tri[:, 2])
    p.indices = tri[ok].reshape(-1)
    return p


def to_gltf_axes(p):
    p = np.asarray(p)
    return np.column_stack([p[:, 0], p[:, 2], -p[:, 1]])


def write_glb(path, node_name, primitives):
    prims = [weld(p) for p in primitives if p is not None and len(p.indices)]
    if not prims:
        return None
    blob = bytearray()
    buffer_views, accessors = [], []

    def add(arr, target, comp, typ, minmax=False):
        arr = np.ascontiguousarray(arr)
        while len(blob) % 4:
            blob.append(0)
        off = len(blob)
        blob.extend(arr.tobytes())
        buffer_views.append({"buffer": 0, "byteOffset": off, "byteLength": arr.nbytes, "target": target})
        acc = {"bufferView": len(buffer_views) - 1, "componentType": comp,
               "count": int(arr.shape[0]), "type": typ}
        if minmax:
            acc["min"] = arr.min(0).tolist(); acc["max"] = arr.max(0).tolist()
        if comp == 5121:
            acc["normalized"] = True
        accessors.append(acc)
        return len(accessors) - 1

    mat_names = sorted({p.material for p in prims})
    materials = []
    for m in mat_names:
        rough, metal = MATERIALS.get(m, (0.9, 0.0))
        materials.append({"name": m, "pbrMetallicRoughness": {
            "baseColorFactor": [1, 1, 1, 1], "metallicFactor": metal, "roughnessFactor": rough}})
    gl_prims = []
    lo = np.array([np.inf] * 3); hi = -lo
    for p in prims:
        pos = to_gltf_axes(p.positions).astype(np.float32)
        nor = to_gltf_axes(p.normals).astype(np.float32)
        nor /= np.maximum(np.linalg.norm(nor, axis=1, keepdims=True), 1e-9)
        lo = np.minimum(lo, p.positions.min(0)); hi = np.maximum(hi, p.positions.max(0))
        attrs = {
            "POSITION": add(pos, 34962, 5126, "VEC3", True),
            "NORMAL": add(nor, 34962, 5126, "VEC3"),
            "COLOR_0": add(np.column_stack([np.round(np.clip(p.colours, 0, 1) * 255), np.full(len(p.colours), 255)])
                           .astype(np.uint8), 34962, 5121, "VEC4"),
            "_FEATURE_ID": add(p.feature_ids.reshape(-1, 1).astype(np.float32).ravel(), 34962, 5126, "SCALAR"),
        }
        if len(pos) < 65536:      # 16-bit indices where they fit: half the index bytes
            ind = add(p.indices.astype(np.uint16), 34963, 5123, "SCALAR")
        else:
            ind = add(p.indices.astype(np.uint32), 34963, 5125, "SCALAR")
        gl_prims.append({"attributes": attrs, "indices": ind, "material": mat_names.index(p.material), "mode": 4})
    while len(blob) % 4:
        blob.append(0)
    doc = {
        "asset": {"version": "2.0", "generator": "gibpipe"},
        "scene": 0, "scenes": [{"nodes": [0]}],
        "nodes": [{"name": node_name, "mesh": 0}],
        "meshes": [{"name": node_name, "primitives": gl_prims}],
        "materials": materials,
        "buffers": [{"byteLength": len(blob)}],
        "bufferViews": buffer_views, "accessors": accessors,
    }
    js = json.dumps(doc, separators=(",", ":")).encode()
    js += b" " * ((4 - len(js) % 4) % 4)
    total = 12 + 8 + len(js) + 8 + len(blob)
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, total))
        f.write(struct.pack("<II", len(js), 0x4E4F534A)); f.write(js)
        f.write(struct.pack("<II", len(blob), 0x004E4942)); f.write(blob)
    tris = sum(len(p.indices) // 3 for p in prims)
    return {"bounds_m": [lo.round(4).tolist(), hi.round(4).tolist()], "triangles": int(tris)}


def read_glb(path):
    """Read back a GLB written by write_glb (used by validation)."""
    data = open(path, "rb").read()
    jlen = struct.unpack_from("<I", data, 12)[0]
    doc = json.loads(data[20:20 + jlen])
    bin_off = 20 + jlen + 8
    out = []
    for prim in doc["meshes"][0]["primitives"]:
        def acc(i):
            a = doc["accessors"][i]; bv = doc["bufferViews"][a["bufferView"]]
            dt = {5126: np.float32, 5125: np.uint32, 5123: np.uint16}[a["componentType"]]
            n = {"SCALAR": 1, "VEC3": 3}[a["type"]]
            arr = np.frombuffer(data, dt, a["count"] * n, bin_off + bv["byteOffset"])
            return arr.reshape(-1, n) if n > 1 else arr
        pos = acc(prim["attributes"]["POSITION"]).astype(np.float64)
        out.append({
            "material": doc["materials"][prim["material"]]["name"],
            "positions": np.column_stack([pos[:, 0], -pos[:, 2], pos[:, 1]]),   # back to x,y,z
            "indices": acc(prim["indices"]).reshape(-1, 3),
            "feature_ids": acc(prim["attributes"]["_FEATURE_ID"]),
        })
    return out
