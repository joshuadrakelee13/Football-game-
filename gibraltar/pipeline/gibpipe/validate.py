"""Automated validation of a build against its source data.

    python -m gibpipe.validate

Writes data/build/validation.json and docs/VALIDATION.md. Every number in
the report is measured from the built .glb files or the source data, never
assumed. Thresholds marked FAIL are the ones a build must not break.
"""
import datetime as dt
import json
import math

import numpy as np
import rasterio
import shapely
from pyproj import Geod
from scipy import ndimage

from . import config, crs, glb, osm, roads as rmod, terrain as tmod

GEOD = Geod(ellps="WGS84")

# Official reference values (Government of Gibraltar GeoPortal "Geo Facts",
# https://www.geoportal.gov.gi/, read 2026-10-29).
OFFICIAL = {"max_height_m": 426.0, "planar_area_km2": 6.55, "roads_km_min": 48.0}

# Landmark pairs for scale checks: (label, OSM selector) matched by Wikidata id.
LANDMARKS = {
    "Q1376950": "Europa Point Lighthouse", "Q1123316": "Moorish Castle", "Q327587": "Grand Casemates Square",
    "Q1785391": "Gibraltar International Airport", "Q2405386": "Cathedral of St Mary the Crowned",
    "Q2296082": "Great Siege Tunnels", "Q1153549": "St. Michael's Cave", "Q5594384": "Grand Casemates Gates",
    "Q3329624": "Mosque of the Custodian of the Two Holy Mosques", "Q1517795": "The Convent",
}


def result(name, value, unit="", status="info", detail=""):
    return {"check": name, "value": value, "unit": unit, "status": status, "detail": detail}


def main():
    build = config.BUILD
    m = json.loads((build / "manifest.json").read_text())
    d = osm.load()
    T = tmod.Terrain(d)
    out = []

    # 1. Projection: round trip and scale --------------------------------------
    ids = np.array(list(d.node_ll.keys()))[:: max(1, len(d.node_ll) // 20000)]
    ll = np.array([d.node_ll[i] for i in ids])
    x, y = crs.lonlat_to_engine(ll[:, 0], ll[:, 1])
    lon2, lat2 = crs.engine_to_lonlat(x, y)
    _, _, err = GEOD.inv(ll[:, 0], ll[:, 1], lon2, lat2)
    out.append(result("Projection round trip (lon/lat -> GIB-LTM -> lon/lat), max error", float(np.max(err)) * 1000, "mm",
                      "pass" if np.max(err) < 0.001 else "FAIL", f"{len(ids)} OSM nodes"))
    rng = np.random.default_rng(1)
    a, b = rng.choice(len(ids), 2000), rng.choice(len(ids), 2000)
    eng = np.hypot(x[a] - x[b], y[a] - y[b])
    _, _, geo = GEOD.inv(ll[a, 0], ll[a, 1], ll[b, 0], ll[b, 1])
    ok = geo > 100
    rel = np.abs(eng[ok] - geo[ok]) / geo[ok]
    out.append(result("Engine distance vs WGS 84 geodesic distance, max relative error", float(rel.max()) * 1e6, "ppm",
                      "pass" if rel.max() < 1e-6 * 2 else "FAIL",
                      f"2000 random node pairs, {int(ok.sum())} longer than 100 m; ellipsoid-surface scale, heights ignored"))

    # Landmark table
    lm = {}
    for kind, elem, poly in osm.iter_areas(d, lambda t: t.get("wikidata") in LANDMARKS):
        p = poly.representative_point(); lm.setdefault(elem.tags["wikidata"], (p.x, p.y))
    for nid, t in d.node_tags.items():
        if t.get("wikidata") in LANDMARKS:
            lm.setdefault(t["wikidata"], d.node_xy[nid])
    pairs = []
    keys = sorted(lm)
    for i, k1 in enumerate(keys):
        for k2 in keys[i + 1:]:
            (x1, y1), (x2, y2) = lm[k1], lm[k2]
            lo, la = crs.engine_to_lonlat(np.array([x1, x2]), np.array([y1, y2]))
            g = GEOD.inv(lo[0], la[0], lo[1], la[1])[2]
            pairs.append({"a": LANDMARKS[k1], "b": LANDMARKS[k2], "engine_m": round(math.hypot(x2 - x1, y2 - y1), 3),
                          "geodesic_m": round(g, 3)})
    pairs.sort(key=lambda p: -p["geodesic_m"])

    # 2. Coastline and territory ------------------------------------------------
    gl = T.land.intersection(T.gibraltar)
    area_km2 = gl.area / 1e6
    out.append(result("Gibraltar land area (OSM coastline within OSM territory boundary)", round(area_km2, 3), "km²",
                      "pass" if abs(area_km2 - OFFICIAL["planar_area_km2"]) / OFFICIAL["planar_area_km2"] < 0.03 else "warn",
                      f"official planar area {OFFICIAL['planar_area_km2']} km² (GeoPortal); difference "
                      f"{100 * (area_km2 / OFFICIAL['planar_area_km2'] - 1):+.1f}% — reclamation since the official figure is a likely cause"))
    built_land = 0.0
    for t in m["tiles"]:
        if "terrain" in t["layers"]:
            for prim in glb.read_glb(build / t["layers"]["terrain"]["file"]):
                if prim["material"] != "M_Terrain":
                    continue
                p = prim["positions"]; tri = prim["indices"]
                v0, v1, v2 = p[tri[:, 0]], p[tri[:, 1]], p[tri[:, 2]]
                built_land += 0.5 * np.abs((v1[:, 0] - v0[:, 0]) * (v2[:, 1] - v0[:, 1]) -
                                           (v1[:, 1] - v0[:, 1]) * (v2[:, 0] - v0[:, 0])).sum()
    land_in_tiles = sum(t.get("land_area_m2", 0) for t in m["tiles"])
    out.append(result("Terrain mesh area vs land polygon area (all built tiles)", round(100 * (built_land / land_in_tiles - 1), 4), "%",
                      "pass" if abs(built_land / land_in_tiles - 1) < 1e-3 else "FAIL",
                      f"mesh {built_land / 1e6:.4f} km², land polygon {land_in_tiles / 1e6:.4f} km²"))

    # 3. Terrain heights --------------------------------------------------------
    peak = None
    spot = []
    for nid, t in d.node_tags.items():
        if "ele" in t and (t.get("natural") in ("peak", "hill") or t.get("man_made") == "survey_point"):
            try:
                e = float(t["ele"].replace("m", "").strip())
            except ValueError:
                continue
            x_, y_ = d.node_xy[nid]
            z = float(T.surface(x_, y_))
            # OSM peak nodes are placed by eye; also compare with the highest
            # terrain within 100 m, which is where the summit actually is.
            gx, gy = np.meshgrid(np.arange(-100, 101, 2.5), np.arange(-100, 101, 2.5))
            r_ = np.hypot(gx, gy).ravel() <= 100
            zz = T.surface(x_ + gx.ravel()[r_], y_ + gy.ravel()[r_])
            k = int(np.argmax(zz))
            spot.append({"id": f"osm:node/{nid}", "name": t.get("name"), "osm_ele_m": e, "terrain_at_node_m": round(z, 2),
                         "terrain_max_100m": round(float(zz[k]), 2),
                         "max_offset_m": round(float(np.hypot(gx.ravel()[r_][k], gy.ravel()[r_][k])), 1),
                         "diff_m": round(float(zz[k]) - e, 2)})
    for t in m["tiles"]:
        bmax = t["layers"].get("terrain", {}).get("bounds_m", [[0, 0, 0], [0, 0, -1e9]])[1][2]
        peak = bmax if peak is None else max(peak, bmax)
    out.append(result("Highest terrain point in build", round(peak, 2), "m",
                      "warn" if OFFICIAL["max_height_m"] - peak > 3 else "pass",
                      f"official summit {OFFICIAL['max_height_m']} m; 5 m grid under-samples the knife-edge ridge"))
    for s_ in spot:
        out.append(result(f"Peak height: {s_['name']} ({s_['id']})", s_["diff_m"], "m (terrain max within 100 m − OSM ele)",
                          "pass" if abs(s_["diff_m"]) < 5 else "warn",
                          f"OSM ele {s_['osm_ele_m']} m; terrain {s_['terrain_max_100m']} m at {s_['max_offset_m']} m from the "
                          f"OSM node ({s_['terrain_at_node_m']} m at the node itself)"))
    # Measured vs filled
    xs, ys = np.meshgrid(np.arange(*gl.bounds[0::2], 5.0), np.arange(*gl.bounds[1::2], 5.0))
    pts = shapely.points(xs.ravel(), ys.ravel())
    on = shapely.contains(gl, pts)
    meas = T.measured_fraction(xs.ravel()[on], ys.ravel()[on])
    out.append(result("Gibraltar land with a DTM measurement (not gap-filled)", round(100 * float(np.mean(meas > 0.5)), 2), "%",
                      "info", "the rest is land newer than the DTM survey (reclamations, new quays): filled from nearest land height"))
    # Copernicus cross-check (DSM, so a positive bias over buildings/trees is expected)
    cop = rasterio.open(config.RAW / "dem" / "copernicus_glo30_N36_W006.tif")
    lon, lat = crs.engine_to_lonlat(xs.ravel()[on], ys.ravel()[on])
    col, row = (~cop.transform) * (lon, lat)
    cz = ndimage.map_coordinates(cop.read(1).astype(float), [np.asarray(row) - 0.5, np.asarray(col) - 0.5], order=1)
    tz = T.surface(xs.ravel()[on], ys.ravel()[on])
    dlt = cz - tz
    out.append(result("Copernicus GLO-30 (30 m DSM) minus terrain, median absolute difference (Gibraltar land)",
                      round(float(np.median(np.abs(dlt))), 2), "m", "info",
                      f"p5 {np.percentile(dlt, 5):.1f} m, p50 {np.percentile(dlt, 50):.1f} m, p95 {np.percentile(dlt, 95):.1f} m. "
                      "Independent coarse cross-check only: the DSM includes buildings and trees, and its 30 m cells "
                      "smear the cliffs (large negative values on the ridge)"))

    # 4. Tile seams -------------------------------------------------------------
    edge = {}
    worst = 0.0
    for t in m["tiles"]:
        if "terrain" not in t["layers"]:
            continue
        ox, oy, _ = t["origin_m"]
        p = [q for q in glb.read_glb(build / t["layers"]["terrain"]["file"]) if q["material"] == "M_Terrain"][0]["positions"]
        for axis in (0, 1):
            for side in (0.0, config.TILE_SIZE):
                sel = np.abs(p[:, axis] - side) < 1e-3
                for v in p[sel]:
                    key = (round(v[0] + ox, 2), round(v[1] + oy, 2))
                    if key in edge:
                        worst = max(worst, abs(edge[key] - v[2]))
                    else:
                        edge[key] = v[2]
    out.append(result("Terrain tile seams, max height mismatch between neighbours", round(worst * 1000, 3), "mm",
                      "pass" if worst < 0.005 else "FAIL", f"{len(edge)} shared edge vertices compared"))

    # 5. Roads ------------------------------------------------------------------
    recs, shapes, tunnels, bridges = rmod.collect(d, T.gibraltar)
    merged = rmod.merge(shapes, T.land)
    allroad = shapely.union_all(list(merged.values())).buffer(0.01)
    shapely.prepare(allroad)
    land_pre = T.land
    tiles_area = shapely.union_all([shapely.box(t["origin_m"][0], t["origin_m"][1], t["origin_m"][0] + config.TILE_SIZE,
                                                t["origin_m"][1] + config.TILE_SIZE) for t in m["tiles"]])
    covered = total = 0
    for r in recs:
        if r["bridge"] or r["width_m"] is None:
            continue
        line = d.way_line(d.ways[int(r["id"].split("/")[1])])
        n = max(2, int(line.length / 5))
        pts = shapely.line_interpolate_point(line, np.linspace(0, line.length, n))
        pts = pts[shapely.contains(land_pre, pts) & shapely.contains(tiles_area, pts)]
        total += len(pts)
        covered += int(shapely.contains(allroad, pts).sum())
    out.append(result("Road/path centreline points lying on rendered surfaces", round(100 * covered / max(total, 1), 3), "%",
                      "pass" if covered / max(total, 1) > 0.995 else "FAIL", f"{total} sample points every 5 m on land"))
    gib_roads = [r for r in recs if r["in_gibraltar"] and r["class"] == "road" and not r["highway"].startswith("aeroway")]
    km = sum(r["length_m"] for r in gib_roads) / 1000
    out.append(result("Carriageway length in Gibraltar (OSM, excluding tunnels)", round(km, 1), "km", "info",
                      f"official: 'more than {OFFICIAL['roads_km_min']:.0f} km' of roads (GeoPortal)"))
    out.append(result("Tunnel ways recorded but not drawn on the surface", len(tunnels), "ways", "info",
                      f"{sum(t_['length_m'] for t_ in tunnels) / 1000:.1f} km; official tunnel total ~52 km (mostly military, unmapped)"))
    # connectivity: components of the drawn network vs the source network
    adj = {}
    for r in recs + tunnels:
        w = d.ways[int(r["id"].split("/")[1])]
        for a_, b_ in zip(w.nodes[:-1], w.nodes[1:]):
            adj.setdefault(a_, set()).add(b_); adj.setdefault(b_, set()).add(a_)
    seen, comps = set(), []
    for n0 in adj:
        if n0 in seen:
            continue
        stack, size = [n0], 0
        seen.add(n0)
        while stack:
            u = stack.pop(); size += 1
            for v in adj[u]:
                if v not in seen:
                    seen.add(v); stack.append(v)
        comps.append(size)
    comps.sort(reverse=True)
    out.append(result("Road network: largest connected component share of nodes", round(100 * comps[0] / sum(comps), 2), "%",
                      "info", f"{len(comps)} components in source OSM network (incl. tunnels); topology copied 1:1 from OSM"))

    # 6. Buildings --------------------------------------------------------------
    area_err, pos_err, n_b, geo_rel = [], [], 0, []
    conf = {"measured": 0, "derived": 0, "estimated": 0}
    for t in m["tiles"]:
        feats = json.loads((build / t["features"]).read_text())
        for b in feats["buildings"]:
            conf[b["confidence"]] += 1
        if "buildings" not in t["layers"]:
            continue
        ox, oy, _ = t["origin_m"]
        for prim in glb.read_glb(build / t["layers"]["buildings"]["file"]):
            if prim["material"] != "M_BuildingRoof":
                continue
            p, tri, fid = prim["positions"], prim["indices"], prim["feature_ids"]
            v0, v1, v2 = p[tri[:, 0]], p[tri[:, 1]], p[tri[:, 2]]
            up = ((v1[:, 0] - v0[:, 0]) * (v2[:, 1] - v0[:, 1]) - (v1[:, 1] - v0[:, 1]) * (v2[:, 0] - v0[:, 0])) > 0
            ar = 0.5 * np.abs((v1[:, 0] - v0[:, 0]) * (v2[:, 1] - v0[:, 1]) - (v1[:, 1] - v0[:, 1]) * (v2[:, 0] - v0[:, 0]))
            f = fid[tri[:, 0]].astype(int)
            sums = np.bincount(f[up], weights=ar[up], minlength=len(feats["buildings"]))
            cx = np.bincount(f[up], weights=(ar * (v0[:, 0] + v1[:, 0] + v2[:, 0]) / 3)[up], minlength=len(sums))
            cy = np.bincount(f[up], weights=(ar * (v0[:, 1] + v1[:, 1] + v2[:, 1]) / 3)[up], minlength=len(sums))
            for k, b in enumerate(feats["buildings"]):
                if k >= len(sums) or sums[k] == 0 or b["override"]:
                    continue
                n_b += 1
                area_err.append(abs(sums[k] - b["footprint_area_m2"]) / b["footprint_area_m2"])
                pos_err.append(math.hypot(cx[k] / sums[k] + ox - b["centroid_m"][0], cy[k] / sums[k] + oy - b["centroid_m"][1]))
    for kind, elem, poly in list(osm.iter_areas(d, lambda t: "building" in t))[:400]:
        if poly.geom_type != "Polygon":
            continue
        c = np.asarray(poly.exterior.coords)
        lo, la = crs.engine_to_lonlat(c[:, 0], c[:, 1])
        ga = abs(GEOD.polygon_area_perimeter(lo, la)[0])
        pa = shapely.Polygon(c).area
        if ga > 20:
            geo_rel.append(abs(pa - ga) / ga)
    out.append(result("Building roofs: rendered footprint area vs source, max relative error", round(100 * max(area_err), 4), "%",
                      "pass" if max(area_err) < 0.005 else "FAIL", f"{n_b} buildings read back from buildings.glb"))
    out.append(result("Building roofs: centroid offset vs source, max", round(max(pos_err) * 1000, 2), "mm",
                      "pass" if max(pos_err) < 0.05 else "FAIL", "float32 storage relative to tile origin"))
    out.append(result("Footprint area in GIB-LTM vs ellipsoidal (geodesic) area, max relative error", round(max(geo_rel) * 1e6, 3),
                      "ppm", "pass" if max(geo_rel) < 1e-5 else "FAIL", f"{len(geo_rel)} footprints"))
    out.append(result("Building heights by confidence", conf, "buildings", "info",
                      "measured = OSM height tag; derived = OSM building:levels × 3 m; estimated = type default"))

    # 7. Props: every mapped item inside the built tiles is present in a tile
    from . import props as pmod
    src_props = [p_ for p_ in pmod.collect(d, T) if shapely.contains_xy(tiles_area, *p_["position_m"][:2])]
    built_ids = set()
    for t in m["tiles"]:
        built_ids |= {p_["id"] for p_ in json.loads((build / t["features"]).read_text()).get("props", [])}
    missing = [p_["id"] for p_ in src_props if p_["id"] not in built_ids]
    out.append(result("Mapped props (trees, street furniture) missing from the build", len(missing), "items",
                      "pass" if not missing else "FAIL", f"{len(src_props)} OSM props inside the built tiles"))

    # 8. Façades: no procedural window below the ground in front of it
    low, n_win = 0, 0
    for t in m["tiles"]:
        if "facades" not in t["layers"]:
            continue
        ox, oy, _ = t["origin_m"]
        for prim in glb.read_glb(build / t["layers"]["facades"]["file"]):
            if prim["material"] != "M_Window":
                continue
            p = prim["positions"]          # welded vertices: check every corner
            n_win += len(prim["indices"]) // 2                  # one quad per window
            low += int(np.sum(p[:, 2] < T.surface(p[:, 0] + ox, p[:, 1] + oy) - 0.05))
    out.append(result("Window corners below the ground in front of them", low, "vertices",
                      "pass" if low == 0 else "FAIL", f"about {n_win} procedural windows checked"))

    # 9. Manifest bounds consistency --------------------------------------------
    bad = 0
    for t in m["tiles"]:
        for name, L in t["layers"].items():
            prims = glb.read_glb(build / L["file"])
            p = np.concatenate([q["positions"] for q in prims])
            if np.max(np.abs(p.min(0) - L["bounds_m"][0])) > 0.01 or np.max(np.abs(p.max(0) - L["bounds_m"][1])) > 0.01:
                bad += 1
    out.append(result("Layer files whose bounds disagree with manifest bounds_m", bad, "files", "pass" if bad == 0 else "FAIL"))

    report = {"generated_utc": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
              "manifest_generated_utc": m["generated_utc"], "checks": out, "landmark_distances": pairs, "spot_heights": spot}
    (build / "validation.json").write_text(json.dumps(report, indent=1, ensure_ascii=False))
    write_markdown(report)
    fails = [c for c in out if c["status"] == "FAIL"]
    for c in out:
        print(f"[{c['status']:>4}] {c['check']}: {c['value']} {c['unit']}")
    print(f"{len(fails)} failing checks")
    return 1 if fails else 0


def write_markdown(rep):
    L = ["# Validation report", "",
         f"Generated {rep['generated_utc']} by `python -m gibpipe.validate` from the build made at "
         f"{rep['manifest_generated_utc']}. Regenerate it after every build; do not edit by hand.", "",
         "| Status | Check | Value | Notes |", "|---|---|---|---|"]
    for c in rep["checks"]:
        v = c["value"]
        if isinstance(v, dict):
            v = ", ".join(f"{k}: {n}" for k, n in v.items())
        L.append(f"| {c['status']} | {c['check']} | {v} {c['unit']} | {c['detail']} |")
    L += ["", "## Distances between landmarks", "",
          "Engine distance is measured in the game's coordinate space; geodesic distance is measured on the WGS 84 "
          "ellipsoid between the same OSM positions. Agreement shows the world is at true scale. (It does not check "
          "OSM's own positional accuracy, which needs an independent survey source.)", "",
          "| From | To | Engine (m) | Geodesic (m) | Difference (mm) |", "|---|---|---|---|---|"]
    for p in rep["landmark_distances"][:20]:
        L.append(f"| {p['a']} | {p['b']} | {p['engine_m']:.3f} | {p['geodesic_m']:.3f} | {1000 * (p['engine_m'] - p['geodesic_m']):+.1f} |")
    (config.ROOT / "docs" / "VALIDATION.md").write_text("\n".join(L) + "\n")


if __name__ == "__main__":
    raise SystemExit(main())
