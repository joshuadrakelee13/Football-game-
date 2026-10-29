"""Walls, fortifications, fences, hedges, barriers, piers and breakwaters,
plus points of interest."""
import numpy as np
import shapely
from shapely.geometry import box

from . import config, osm
from .buildings import MATERIAL_COLOURS, parse_colour, parse_length
from .roads import drape
from .terrain import _polys, _triangulate, srgb_to_linear

# kind -> (height m, thickness m) defaults; every use is flagged "estimated"
WALL_DEFAULTS = {
    "barrier=wall": (2.0, 0.4), "barrier=city_wall": (6.0, 2.5), "historic=citywalls": (6.0, 2.5),
    "historic=city_walls": (6.0, 2.5), "barrier=retaining_wall": (1.0, 0.5),
    "barrier=fence": (1.2, 0.06), "barrier=hedge": (1.5, 0.8), "barrier=jersey_barrier": (0.8, 0.6),
    "barrier=guard_rail": (0.75, 0.12), "barrier=handrail": (1.0, 0.06),
}
WALL_COLOUR = (0.78, 0.74, 0.64)
KIND_COLOURS = {"barrier=fence": (0.30, 0.31, 0.32), "barrier=hedge": (0.20, 0.34, 0.16),
                "barrier=jersey_barrier": (0.80, 0.79, 0.76), "barrier=guard_rail": (0.62, 0.64, 0.66),
                "barrier=handrail": (0.35, 0.36, 0.38)}


def wall_colour(r):
    t = r["_tags"]
    c = parse_colour(t.get("colour"))
    if c is None:
        c = MATERIAL_COLOURS.get(t.get("material") or t.get("wall:material") or t.get("fence_type"))
    return c or KIND_COLOURS.get(r["kind"], WALL_COLOUR)
DECK_COLOUR = (0.55, 0.52, 0.47)


def wall_kind(t):
    for k in ("historic", "barrier"):
        key = f"{k}={t.get(k)}"
        if key in WALL_DEFAULTS:
            return key
    return None


def collect_walls(d, gib):
    recs = []
    for w in d.ways.values():
        kind = wall_kind(w.tags)
        if not kind:
            continue
        line = d.way_line(w)
        if line is None or line.length < 0.5:
            continue
        h0, th0 = WALL_DEFAULTS[kind]
        h = parse_length(w.tags.get("height"))
        th = parse_length(w.tags.get("width")) or parse_length(w.tags.get("wall:width"))
        recs.append({
            "id": f"osm:way/{w.id}", "osm_version": w.version, "kind": kind, "name": w.tags.get("name"),
            "height_m": h or h0, "height_source": "osm:height" if h else f"default:{kind}",
            "thickness_m": th or th0, "confidence": "measured" if h else "estimated",
            "length_m": round(line.length, 2),
            "in_gibraltar": bool(gib is not None and gib.intersects(line)),
            "_line": line, "_tags": w.tags,
        })
    return recs


def collect_piers(d, land, gib):
    recs = []
    for w in d.ways.values():
        t = w.tags
        if t.get("man_made") not in ("pier", "breakwater", "quay"):
            continue
        if w.nodes[0] == w.nodes[-1] and len(w.nodes) > 3:
            poly = d.way_polygon(w)
            wsrc = "area"
        else:
            line = d.way_line(w)
            if line is None:
                continue
            width = parse_length(t.get("width")) or (2.5 if t.get("man_made") == "pier" else 6.0)
            wsrc = "osm:width" if parse_length(t.get("width")) else f"default:{t.get('man_made')}"
            poly = line.buffer(width / 2, cap_style="flat")
        if poly is None or poly.is_empty:
            continue
        over_water = poly.difference(land)
        if over_water.area < 1.0:
            continue           # already part of the land surface
        floating = t.get("floating") == "yes"
        deck = 0.8 if floating else (3.0 if t.get("man_made") == "breakwater" else 2.0)
        recs.append({
            "id": f"osm:way/{w.id}", "osm_version": w.version, "kind": f"man_made={t.get('man_made')}",
            "name": t.get("name"), "deck_height_m": deck,
            "height_source": "default:floating" if floating else f"default:{t.get('man_made')}",
            "width_source": wsrc, "confidence": "estimated",
            "in_gibraltar": bool(gib is not None and gib.intersects(poly)),
            "_poly": over_water,
        })
    return recs


def walls_mesh(walls, piers, terrain, ix, iy, feature_index):
    """Walls follow the terrain (top = ground + height); piers are flat decks
    with sides down below sea level."""
    from .glb import Primitive
    ts = config.TILE_SIZE
    ox, oy = ix * ts, iy * ts
    tbox = box(ox, oy, ox + ts, oy + ts)
    groups = {}       # material -> (P, N, C, I, F)

    def lists(mat):
        return groups.setdefault(mat, ([], [], [], [], []))

    def add_prism(mat, colour, poly, zbot_fn, ztop_fn, fid, follow_ground):
        P, N, C, I, F = lists(mat)
        n0 = sum(len(p) for p in P)
        for dens in _polys(shapely.segmentize(poly, 2.5)):
            prism(P, N, I, F, shapely.geometry.polygon.orient(dens, 1.0), zbot_fn, ztop_fn, fid, follow_ground)
        C.append(np.tile(srgb_to_linear(colour), (sum(len(p) for p in P) - n0, 1)))

    def prism(P, N, I, F, dens, zbot_fn, ztop_fn, fid, follow_ground):
        # A top that follows the ground is split along the terrain triangles
        # (as roads are) so it never cuts through the terrain; a flat deck is
        # a plain triangulation.
        pts, tris = drape(dens) if follow_ground else _triangulate(dens)
        if len(tris) == 0:
            return
        b = sum(len(p) for p in P)
        P.append(np.column_stack([pts, ztop_fn(pts)])); N.append(np.tile([0, 0, 1.0], (len(pts), 1)))
        I.append(tris + b); F.append(np.full(len(pts), fid))
        for ring in [dens.exterior, *dens.interiors]:
            c = np.asarray(ring.coords)
            zt, zb = ztop_fn(c), zbot_fn(c)
            for a in range(len(c) - 1):
                d = c[a + 1] - c[a]; L = np.hypot(*d)
                if L < 1e-3:
                    continue
                out = np.array([d[1], -d[0], 0]) / L
                b = sum(len(p) for p in P)
                P.append(np.array([[*c[a], zb[a]], [*c[a + 1], zb[a + 1]], [*c[a + 1], zt[a + 1]], [*c[a], zt[a]]]))
                N.append(np.tile(out, (4, 1))); F.append(np.full(4, fid))
                I.append(np.array([[b, b + 1, b + 2], [b, b + 2, b + 3]]))

    for r in walls:
        line = r["_line"]
        if not line.intersects(tbox):
            continue
        poly = line.buffer(r["thickness_m"] / 2, cap_style="flat", join_style="mitre").intersection(tbox)
        fid = feature_index.get(r["id"], -1)
        h = r["height_m"]
        mat = "M_Foliage" if r["kind"] == "barrier=hedge" else "M_Wall"
        for p in _polys(poly):
            add_prism(mat, wall_colour(r), p, lambda c: terrain.surface(c[:, 0], c[:, 1]) - 0.5,
                      lambda c, h=h: terrain.surface(c[:, 0], c[:, 1]) + h, fid, True)
    for r in piers:
        poly = r["_poly"].intersection(tbox)
        fid = feature_index.get(r["id"], -1)
        h = r["deck_height_m"]
        for p in _polys(poly):
            add_prism("M_Path", DECK_COLOUR, p, lambda c: np.full(len(c), config.SKIRT_DEPTH),
                      lambda c, h=h: np.full(len(c), h), fid, False)
    prims = []
    for mat, (P, N, C, I, F) in sorted(groups.items()):
        if P:
            pos = np.concatenate(P); pos[:, 0] -= ox; pos[:, 1] -= oy
            prims.append(Primitive(mat, pos, np.concatenate(N), np.concatenate(C), np.concatenate(I), np.concatenate(F)))
    return prims


POI_KEYS = [("tourism", ("attraction", "viewpoint", "museum", "artwork", "gallery", "information")),
            ("historic", None), ("man_made", ("lighthouse", "tower")), ("natural", ("peak", "cave_entrance", "beach")),
            ("amenity", ("place_of_worship", "townhall", "university", "library", "theatre")),
            ("aeroway", ("aerodrome", "terminal")), ("leisure", ("park", "stadium", "marina")),
            ("place", ("square", "neighbourhood", "quarter")), ("building", ("cathedral", "church", "mosque", "synagogue"))]


def poi_kind(t):
    for k, vals in POI_KEYS:
        v = t.get(k)
        if v and (vals is None or v in vals):
            if k == "tourism" and v == "information" and t.get("information") not in ("board",):
                continue
            return f"{k}={v}"
    return None


def describe(t):
    parts = []
    for k in ("description", "inscription", "note:en"):
        if t.get(k):
            parts.append(t[k])
    if t.get("start_date"):
        parts.append(f"Built: {t['start_date']}.")
    if t.get("heritage"):
        parts.append("Listed heritage site.")
    if t.get("ele"):
        parts.append(f"Elevation (OSM): {t['ele']} m.")
    if t.get("wikipedia"):
        parts.append(f"Wikipedia: {t['wikipedia']}")
    return " ".join(parts)


def collect_pois(d, terrain):
    out = []
    for nid, t in d.node_tags.items():
        kind = poi_kind(t)
        if kind and t.get("name"):
            x, y = d.node_xy[nid]
            out.append((f"osm:node/{nid}", t, x, y, kind))
    for kind_, elem, poly in osm.iter_areas(d, lambda t: poi_kind(t) is not None and t.get("name")):
        p = poly.representative_point()
        out.append((osm.osm_ref(kind_, elem), elem.tags, p.x, p.y, poi_kind(elem.tags)))
    seen, res = set(), []
    for ref, t, x, y, kind in out:
        key = (t.get("name"), round(x / 30), round(y / 30))
        if key in seen:
            continue
        seen.add(key)
        z = float(terrain.surface(x, y))
        res.append({"id": ref, "name": t.get("name:en") or t.get("name"), "kind": kind,
                    "position_m": [round(x, 3), round(y, 3), round(z, 3)], "description": describe(t),
                    "source": "OpenStreetMap", "in_gibraltar": bool(terrain.gibraltar is not None and
                                                                    terrain.gibraltar.contains(shapely.Point(x, y)))})
    return res
