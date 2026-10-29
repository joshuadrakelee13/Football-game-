"""Building masses from OSM footprints.

Height rules, in order of preference (recorded per building as height_source
and confidence):

1. measured  - `height` tag (OSM: from the lowest ground contact to the top);
               or a LiDAR nDSM raster if data/raw/dem/ign_mds_25830.tif exists.
2. derived   - `building:levels` (+ `roof:levels`) x LEVEL_HEIGHT.
3. estimated - a documented default per building type (DEFAULT_LEVELS).

Every building's base is sunk SINK metres below the lowest ground under its
footprint so there is never a gap on slopes; its top is ground_min + height.
Roofs are flat for now; `roof:shape` is recorded for later.
"""
import re

import numpy as np
import shapely

from . import config, osm
from .terrain import _polys, _triangulate, srgb_to_linear

LEVEL_HEIGHT = 3.0
SINK = 1.0

# Estimated storeys when nothing is tagged. Chosen from Gibraltar's typical
# building stock; every use is flagged "estimated".
DEFAULT_LEVELS = {
    "house": 2, "detached": 2, "semidetached_house": 2, "terrace": 3, "residential": 4,
    "apartments": 6, "commercial": 4, "office": 5, "retail": 2, "hotel": 6, "school": 3,
    "university": 3, "hospital": 5, "public": 3, "civic": 3, "government": 3, "church": 4,
    "chapel": 2, "cathedral": 6, "mosque": 3, "synagogue": 3, "industrial": 3, "warehouse": 3,
    "garage": 1, "garages": 1, "shed": 1, "hut": 1, "kiosk": 1, "service": 1, "bunker": 1,
    "ruins": 1, "military": 2, "hangar": 4, "parking": 4, "transportation": 2, "train_station": 2,
    "yes": 3, "construction": 2, "barracks": 3, "fort": 2, "castle": 4, "tower": 5,
    "greenhouse": 1, "toilets": 1, "stadium": 4, "grandstand": 3, "boathouse": 1,
}
ROOF_ONLY = {"roof", "carport"}
WALL_COLOURS = {
    "residential": (0.86, 0.80, 0.68), "apartments": (0.88, 0.84, 0.76), "house": (0.90, 0.84, 0.70),
    "commercial": (0.80, 0.80, 0.78), "office": (0.75, 0.77, 0.80), "retail": (0.85, 0.80, 0.72),
    "industrial": (0.68, 0.68, 0.66), "warehouse": (0.66, 0.66, 0.64), "church": (0.86, 0.82, 0.70),
    "bunker": (0.60, 0.60, 0.56), "ruins": (0.70, 0.66, 0.58), "military": (0.72, 0.70, 0.62),
}
DEFAULT_WALL = (0.84, 0.80, 0.72)
ROOF_COLOUR = (0.48, 0.47, 0.46)


def parse_length(v):
    """'12', '12 m', '12.5m', "40'", "40 ft" -> metres, else None."""
    if not v:
        return None
    s = v.strip().lower().replace(",", ".")
    m = re.match(r"^([0-9]*\.?[0-9]+)\s*(m|metres|meters)?$", s)
    if m:
        return float(m.group(1))
    m = re.match(r"^([0-9]*\.?[0-9]+)\s*('|ft|feet)$", s)
    if m:
        return float(m.group(1)) * 0.3048
    return None


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def height_for(tags):
    h = parse_length(tags.get("height"))
    if h and 0.5 < h < 300:
        return h, "osm:height", "measured"
    lv = _num(tags.get("building:levels"))
    if lv is not None and 0 < lv < 80:
        rl = _num(tags.get("roof:levels")) or 0
        return (lv + rl) * LEVEL_HEIGHT, "osm:building:levels", "derived"
    btype = tags.get("building") or tags.get("building:part") or "yes"
    lv = DEFAULT_LEVELS.get(btype, DEFAULT_LEVELS["yes"])
    return lv * LEVEL_HEIGHT, f"default:{btype}", "estimated"


def min_height_for(tags):
    h = parse_length(tags.get("min_height"))
    if h is not None:
        return h
    lv = _num(tags.get("building:min_level"))
    return lv * LEVEL_HEIGHT if lv is not None else 0.0


def collect(d: osm.OsmData, terrain, overrides):
    """Return a list of building records with their footprint polygons."""
    records = []
    parts_polys = []
    for kind, elem, poly in osm.iter_areas(d, lambda t: "building:part" in t and t.get("building:part") != "no"):
        parts_polys.append(poly)
        records.append(_record(kind, elem, poly, terrain, overrides, is_part=True))
    parts_union = shapely.union_all(parts_polys) if parts_polys else None

    def is_building(t):
        b = t.get("building")
        return b is not None and b != "no" and t.get("location") != "underground" \
            and not str(t.get("layer", "0")).startswith("-")
    for kind, elem, poly in osm.iter_areas(d, is_building):
        # OSM 3D convention: when building:parts cover the outline, the parts
        # are the 3D model and the outline is not drawn.
        if parts_union is not None and poly.intersects(parts_union) and \
                poly.intersection(parts_union).area > 0.5 * poly.area:
            continue
        records.append(_record(kind, elem, poly, terrain, overrides, is_part=False))
    return [r for r in records if r is not None]


def _record(kind, elem, poly, terrain, overrides, is_part):
    if poly.area < 2.0:
        return None
    ref = osm.osm_ref(kind, elem)
    t = elem.tags
    h, hsrc, conf = height_for(t)
    mh = min_height_for(t)
    bt = t.get("building") or t.get("building:part") or "yes"
    roof_only = bt in ROOF_ONLY
    if roof_only and mh == 0.0:
        mh = max(h - 0.3, 2.4)   # canopy: assume clearance under it
    # sample ground at footprint vertices and an interior point
    ring = np.asarray(poly.exterior.coords) if poly.geom_type == "Polygon" else \
        np.concatenate([np.asarray(p.exterior.coords) for p in poly.geoms])
    rp = poly.representative_point()
    sx = np.append(ring[:, 0], rp.x); sy = np.append(ring[:, 1], rp.y)
    g = terrain.surface(sx, sy)
    c = poly.centroid
    return {
        "id": ref, "osm_version": elem.version, "name": t.get("name"), "building": bt,
        "part": is_part, "centroid_m": [round(c.x, 3), round(c.y, 3)],
        "footprint_area_m2": round(poly.area, 2),
        "ground_min_m": round(float(g.min()), 2), "ground_max_m": round(float(g.max()), 2),
        "height_m": round(h, 2), "min_height_m": round(mh, 2),
        "height_source": hsrc, "confidence": conf,
        "levels": _num(t.get("building:levels")), "roof_shape": t.get("roof:shape"),
        "in_gibraltar": bool(terrain.gibraltar is not None and terrain.gibraltar.contains(c)),
        "override": overrides.get(ref),
        "_poly": poly, "_roof_only": roof_only,
    }


def apply_lidar_heights(records, terrain):
    """If a LiDAR surface model has been added to data/raw/dem, replace
    non-measured heights with the 90th percentile of (surface - terrain)
    inside each footprint."""
    path = config.RAW / "dem" / "ign_mds_25830.tif"
    if not path.exists():
        return 0
    import rasterio
    from . import crs
    src = rasterio.open(path)
    mds = src.read(1).astype(float)
    n = 0
    for r in records:
        if r["confidence"] == "measured":
            continue
        poly = r["_poly"]
        b = poly.buffer(-0.75)
        if b.is_empty:
            continue
        xs, ys = np.meshgrid(np.arange(b.bounds[0], b.bounds[2], 1.0), np.arange(b.bounds[1], b.bounds[3], 1.0))
        pts = shapely.points(xs.ravel(), ys.ravel())
        inside = shapely.contains(b, pts)
        if inside.sum() < 4:
            continue
        x, y = xs.ravel()[inside], ys.ravel()[inside]
        e, nn = crs.engine_to_utm(x, y)
        col, row = (~src.transform) * (e, nn)
        vals = mds[np.clip(row.astype(int), 0, mds.shape[0] - 1), np.clip(col.astype(int), 0, mds.shape[1] - 1)]
        top = np.percentile(vals, 90)
        h = top - r["ground_min_m"]
        if 2.0 < h < 200:
            r.update(height_m=round(float(h), 2), height_source="lidar:ign_mds", confidence="measured")
            n += 1
    return n


def mesh(records, origin, feature_index):
    """Merged wall and roof primitives for a tile. Positions are relative to
    `origin` (x, y). feature_index maps building id -> index in features.json."""
    from .glb import Primitive
    ox, oy = origin
    wp, wn, wc, wi, wf = [], [], [], [], []
    rp, rn, rc, ri, rf = [], [], [], [], []
    for r in records:
        if r["override"]:
            continue
        fid = feature_index[r["id"]]
        base = r["ground_min_m"] + r["min_height_m"] - (SINK if r["min_height_m"] == 0 else 0)
        top = r["ground_min_m"] + r["height_m"]
        if top <= base + 0.2:
            continue
        colour = srgb_to_linear(WALL_COLOURS.get(r["building"], DEFAULT_WALL))
        for poly in _polys(r["_poly"]):
            poly = shapely.geometry.polygon.orient(poly, 1.0)    # CCW exterior, CW holes
            # walls: one quad per ring edge, outward normals, flat shaded
            if not r["_roof_only"]:
                for ring in [poly.exterior, *poly.interiors]:
                    c = np.asarray(ring.coords)
                    p0, p1 = c[:-1], c[1:]
                    d = p1 - p0
                    L = np.hypot(d[:, 0], d[:, 1])
                    keep = L > 1e-3
                    p0, p1, d, L = p0[keep], p1[keep], d[keep], L[keep]
                    out = np.column_stack([d[:, 1], -d[:, 0]]) / L[:, None]   # right of travel
                    k = len(p0)
                    b = sum(len(x) for x in wp)
                    quad = np.empty((k, 4, 3))
                    quad[:, 0, :2] = p0; quad[:, 0, 2] = base
                    quad[:, 1, :2] = p1; quad[:, 1, 2] = base
                    quad[:, 2, :2] = p1; quad[:, 2, 2] = top
                    quad[:, 3, :2] = p0; quad[:, 3, 2] = top
                    quad[:, :, 0] -= ox; quad[:, :, 1] -= oy
                    wp.append(quad.reshape(-1, 3))
                    wn.append(np.repeat(np.column_stack([out, np.zeros(k)]), 4, axis=0))
                    wc.append(np.tile(colour, (4 * k, 1)))
                    wf.append(np.full(4 * k, fid))
                    q = b + np.arange(k)[:, None] * 4
                    # ring traversed CCW (exterior) => outward is right of travel;
                    # (0,1,2) faces right for a vertical quad built this way
                    wi.append(np.concatenate([q + [0, 1, 2], q + [0, 2, 3]], axis=0))
            pts, tris = _triangulate(poly)
            if len(tris) == 0:
                continue
            b = sum(len(x) for x in rp)
            n = len(pts)
            top_v = np.column_stack([pts[:, 0] - ox, pts[:, 1] - oy, np.full(n, top)])
            rp.append(top_v); rn.append(np.tile([0, 0, 1.0], (n, 1)))
            rc.append(np.tile(srgb_to_linear(ROOF_COLOUR), (n, 1))); rf.append(np.full(n, fid))
            ri.append(tris + b)
            if r["_roof_only"]:   # underside of canopies
                b2 = b + n
                under = top_v.copy(); under[:, 2] = base
                rp.append(under); rn.append(np.tile([0, 0, -1.0], (n, 1)))
                rc.append(np.tile(srgb_to_linear(ROOF_COLOUR), (n, 1))); rf.append(np.full(n, fid))
                ri.append(tris[:, [0, 2, 1]] + b2)
    prims = []
    if wp:
        prims.append(Primitive("M_BuildingWall", np.concatenate(wp), np.concatenate(wn), np.concatenate(wc),
                               np.concatenate(wi), np.concatenate(wf)))
    if rp:
        prims.append(Primitive("M_BuildingRoof", np.concatenate(rp), np.concatenate(rn), np.concatenate(rc),
                               np.concatenate(ri), np.concatenate(rf)))
    return prims


def public_record(r):
    return {k: v for k, v in r.items() if not k.startswith("_")}
