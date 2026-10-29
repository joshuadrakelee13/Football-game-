"""Build engine-ready tiles from the raw data.

    python -m gibpipe.build            # whole project area
    python -m gibpipe.build --tiles T_W1_N2,T_W1_N3

Output: data/build (see docs/MANIFEST.md).
"""
import argparse
import datetime as dt
import json
import multiprocessing as mp
import shutil
import time

import numpy as np
from shapely.geometry import box

from . import buildings, config, crs, glb, osm, roads, structures, terrain

G = {}      # shared state for worker processes (inherited via fork)


def _assign(items, key):
    out = {}
    for it in items:
        x, y = key(it)
        out.setdefault(crs.tile_index(x, y), []).append(it)
    return out


def prepare():
    t0 = time.time()
    d = osm.load()
    T = terrain.Terrain(d)
    overrides = json.loads(config.OVERRIDES.read_text()) if config.OVERRIDES.exists() else {}
    overrides = {k: v for k, v in overrides.items() if not k.startswith("_")}
    blds = buildings.collect(d, T, overrides)
    n_lidar = buildings.apply_lidar_heights(blds, T)
    road_recs, shapes, tunnels, bridges = roads.collect(d, T.gibraltar)
    merged = roads.merge(shapes, T.land)
    walls = structures.collect_walls(d, T.gibraltar)
    piers = structures.collect_piers(d, T.land, T.gibraltar)
    trees = structures.collect_trees(d, T)
    pois = structures.collect_pois(d, T)
    G.update(d=d, T=T, blds=_assign(blds, lambda r: r["centroid_m"]), merged=merged, bridges=bridges,
             roads=road_recs, tunnels=tunnels, walls=walls, piers=piers,
             trees=_assign(trees, lambda r: r["position_m"][:2]), pois=pois, overrides=overrides,
             all_blds=blds, n_lidar=n_lidar)
    print(f"prepared in {time.time() - t0:.1f}s: {len(blds)} buildings ({n_lidar} LiDAR heights), "
          f"{len(road_recs)} road ways, {len(tunnels)} tunnels, {len(bridges)} bridges, {len(walls)} walls, "
          f"{len(piers)} piers, {len(trees)} trees, {len(pois)} POIs")


def candidate_tiles():
    T = G["T"]
    area = T.land.buffer(config.PROJECT_MARGIN).intersection(T.clip_box)
    x0, y0, x1, y1 = area.bounds
    out = []
    for ix in range(int(np.floor(x0 / config.TILE_SIZE)), int(np.ceil(x1 / config.TILE_SIZE))):
        for iy in range(int(np.floor(y0 / config.TILE_SIZE)), int(np.ceil(y1 / config.TILE_SIZE))):
            tb = box(ix * config.TILE_SIZE, iy * config.TILE_SIZE, (ix + 1) * config.TILE_SIZE, (iy + 1) * config.TILE_SIZE)
            if tb.intersects(area):
                out.append((ix, iy))
    return out


def build_tile(ixy):
    ix, iy = ixy
    T = G["T"]
    tid = crs.tile_id(ix, iy)
    ox, oy = crs.tile_origin(ix, iy)
    tdir = config.BUILD / "tiles" / tid
    tdir.mkdir(parents=True, exist_ok=True)
    tbox = box(ox, oy, ox + config.TILE_SIZE, oy + config.TILE_SIZE)
    layers = {}

    def put(name, prims):
        info = glb.write_glb(tdir / f"{name}.glb", f"{tid}_{name}", prims)
        if info:
            info["file"] = f"tiles/{tid}/{name}.glb"
            layers[name] = info

    # terrain
    tm = T.tile_mesh(ix, iy)
    if tm:
        (pos, nor, col, ind), skirt = tm
        prims = [glb.Primitive("M_Terrain", pos - [ox, oy, 0], nor, col, ind)]
        if skirt:
            sp, sn, sc, si = skirt
            prims.append(glb.Primitive("M_Cliff", sp - [ox, oy, 0], sn, sc, si))
        put("terrain", prims)

    # buildings
    blds = G["blds"].get((ix, iy), [])
    bidx = {b["id"]: k for k, b in enumerate(blds)}
    put("buildings", buildings.mesh(blds, (ox, oy), bidx))

    # roads
    put("roads", roads.tile_mesh(G["merged"], T, ix, iy) + roads.bridge_mesh(G["bridges"], T, ix, iy))

    # walls and piers
    walls = [w for w in G["walls"] if w["_line"].intersects(tbox)]
    piers = [p for p in G["piers"] if p["_poly"].intersects(tbox)]
    widx = {w["id"]: k for k, w in enumerate(walls + piers)}
    put("walls", structures.walls_mesh(walls, piers, T, ix, iy, widx))

    def strip(r):
        return {k: v for k, v in r.items() if not k.startswith("_")}

    road_recs = [r for r in G["roads"] if _touches(r, tbox)]
    features = {
        "tile": tid,
        "buildings": [strip(b) for b in blds],
        "roads": road_recs,
        "walls": [strip(w) for w in walls + piers],
        "trees": G["trees"].get((ix, iy), []),
        "tunnels": [r for r in G["tunnels"] if _touches(r, tbox)],
    }
    if not layers and not features["buildings"]:
        shutil.rmtree(tdir, ignore_errors=True)
        return None
    (tdir / "features.json").write_text(json.dumps(features, ensure_ascii=False, separators=(",", ":")))
    return {
        "id": tid, "ix": ix, "iy": iy, "origin_m": [ox, oy, 0.0], "layers": layers,
        "features": f"tiles/{tid}/features.json",
        "counts": {"buildings": len(blds), "roads": len(road_recs), "walls": len(walls), "piers": len(piers),
                   "trees": len(features["trees"])},
        "land_area_m2": round(T.land.intersection(tbox).area, 1),
    }


def _touches(rec, tbox):
    w = G["d"].ways.get(int(rec["id"].split("/")[1]))
    line = G["d"].way_line(w) if w else None
    return line is not None and line.intersects(tbox)


def find_spawn(d, T):
    # Grand Casemates Square, matched by its Wikidata id (robust to name typos in OSM)
    for kind, elem, poly in osm.iter_areas(d, lambda t: t.get("wikidata") == "Q327587"):
        p = poly.representative_point()
        return {"name": "Grand Casemates Square",
                "position_m": [round(p.x, 3), round(p.y, 3), round(float(T.surface(p.x, p.y)), 3)],
                "heading_deg": 180.0, "source": osm.osm_ref(kind, elem)}
    x, y = crs.lonlat_to_engine(-5.3537, 36.1440)
    return {"name": "Casemates Square (approximate)", "position_m": [float(x), float(y), float(T.surface(x, y))],
            "heading_deg": 180.0, "source": "fallback coordinate"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tiles", help="comma-separated tile ids to build (default: all)")
    ap.add_argument("--jobs", type=int, default=mp.cpu_count())
    args = ap.parse_args()
    prepare()
    tiles = candidate_tiles()
    if args.tiles:
        want = set(args.tiles.split(","))
        tiles = [t for t in tiles if crs.tile_id(*t) in want]
    else:
        shutil.rmtree(config.BUILD / "tiles", ignore_errors=True)
    config.BUILD.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    ctx = mp.get_context("fork")
    with ctx.Pool(args.jobs) as pool:
        results = [r for r in pool.imap_unordered(build_tile, tiles) if r]
    results.sort(key=lambda r: (r["iy"], r["ix"]))
    print(f"built {len(results)} tiles in {time.time() - t0:.1f}s")

    T, d = G["T"], G["d"]
    # Keep entries for tiles not rebuilt this run.
    mpath = config.BUILD / "manifest.json"
    if args.tiles and mpath.exists():
        old = {t["id"]: t for t in json.loads(mpath.read_text())["tiles"]}
        old.update({r["id"]: r for r in results})
        results = sorted(old.values(), key=lambda r: (r["iy"], r["ix"]))
    cat = json.loads((config.RAW / "catalogue.json").read_text())
    shutil.copy(config.RAW / "catalogue.json", config.BUILD / "catalogue.json")
    attributions = sorted({f["attribution"] for f in cat["files"].values() if f["source"] != "copernicus_glo30"})
    xs = [r["ix"] for r in results]; ys = [r["iy"] for r in results]
    gl = T.land.intersection(T.gibraltar) if T.gibraltar is not None else T.land
    manifest = {
        "schema": 1, "pipeline_version": config.PIPELINE_VERSION,
        "generated_utc": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "crs": {"engine_proj": config.ENGINE_PROJ, "engine_name": config.ENGINE_NAME,
                "interchange": f"EPSG:{config.INTERCHANGE_EPSG}", "origin_lonlat": [config.ORIGIN_LON, config.ORIGIN_LAT],
                "vertical": config.VERTICAL_DATUM},
        "tile_size_m": config.TILE_SIZE, "terrain_cell_m": config.TERRAIN_CELL, "sea_level_m": config.SEA_LEVEL,
        "project_bounds_m": [min(xs) * config.TILE_SIZE, min(ys) * config.TILE_SIZE,
                             (max(xs) + 1) * config.TILE_SIZE, (max(ys) + 1) * config.TILE_SIZE],
        "land_bounds_m": [round(v, 2) for v in gl.bounds],
        "gibraltar_land_area_m2": round(gl.area, 1),
        "spawn": find_spawn(d, T),
        "pois": G["pois"],
        "attribution": attributions,
        "stats": {
            "buildings": len(G["all_blds"]),
            "buildings_by_confidence": {c: sum(1 for b in G["all_blds"] if b["confidence"] == c)
                                        for c in ("measured", "derived", "estimated")},
            "road_ways": len(G["roads"]), "tunnels": len(G["tunnels"]), "walls": len(G["walls"]),
            "piers": len(G["piers"]), "pois": len(G["pois"]),
        },
        "tiles": results,
    }
    mpath.write_text(json.dumps(manifest, indent=1, ensure_ascii=False))
    size = sum(p.stat().st_size for p in (config.BUILD / "tiles").rglob("*") if p.is_file())
    print(f"manifest: {len(results)} tiles, {size / 1e6:.1f} MB -> {mpath}")


if __name__ == "__main__":
    main()
