"""Roads, footpaths and steps from OSM `highway=*`.

Surfaces are built by buffering centrelines to their width, merging each
surface class, subtracting higher-priority classes (so surfaces never overlap),
then intersecting with the terrain's own triangles. Every road triangle is
therefore coplanar with the terrain triangle beneath it, lifted by OFFSET.

Tunnels are not drawn on the surface; they are listed in features.json.
"""
import numpy as np
import shapely
from shapely.geometry import box

from . import config, osm
from .terrain import CELL, _polys, _triangulate, srgb_to_linear
from .buildings import parse_length

OFFSET = 0.06   # metres above terrain

# highway value -> (surface class, default width m)
CLASSES = {
    "motorway": ("road", 10.0), "trunk": ("road", 8.0), "primary": ("road", 7.5),
    "secondary": ("road", 7.0), "tertiary": ("road", 6.5), "unclassified": ("road", 5.5),
    "residential": ("road", 5.5), "living_street": ("road", 4.5), "service": ("road", 4.0),
    "busway": ("road", 6.5), "road": ("road", 5.0),
    "motorway_link": ("road", 6.0), "trunk_link": ("road", 6.0), "primary_link": ("road", 6.0),
    "secondary_link": ("road", 5.5), "tertiary_link": ("road", 5.5),
    "pedestrian": ("path", 5.0), "footway": ("path", 2.0), "path": ("path", 1.5),
    "cycleway": ("path", 2.0), "bridleway": ("path", 2.0), "track": ("path", 3.0),
    "steps": ("steps", 2.0),
}
LANE_WIDTH = 3.2
PRIORITY = ["road", "steps", "path"]          # earlier wins where surfaces overlap
MATERIAL = {"road": "M_Road", "path": "M_Path", "steps": "M_Steps"}
COLOUR = {"road": (0.22, 0.22, 0.23), "path": (0.62, 0.60, 0.56), "steps": (0.70, 0.67, 0.60)}

# OSM `surface` -> surface group; colour per (class, group). "default" = untagged.
SURFACE_GROUPS = {
    "asphalt": "asphalt", "chipseal": "asphalt", "paved": "default",
    "paving_stones": "paving", "sett": "paving", "cobblestone": "paving", "unhewn_cobblestone": "paving",
    "bricks": "paving", "concrete:plates": "paving",
    "concrete": "concrete", "concrete:lanes": "concrete",
    "unpaved": "unpaved", "gravel": "unpaved", "fine_gravel": "unpaved", "ground": "unpaved", "dirt": "unpaved",
    "compacted": "unpaved", "rock": "unpaved", "earth": "unpaved", "grass": "unpaved", "sand": "unpaved",
    "wood": "wood", "metal": "wood",
}
SURFACE_ORDER = ["default", "asphalt", "concrete", "paving", "unpaved", "wood"]
SURFACE_COLOUR = {
    ("road", "default"): COLOUR["road"], ("road", "asphalt"): COLOUR["road"], ("road", "concrete"): (0.58, 0.57, 0.54),
    ("road", "paving"): (0.52, 0.48, 0.43), ("road", "unpaved"): (0.55, 0.48, 0.38), ("road", "wood"): (0.45, 0.34, 0.24),
    ("path", "default"): COLOUR["path"], ("path", "asphalt"): (0.30, 0.30, 0.31), ("path", "concrete"): (0.64, 0.63, 0.60),
    ("path", "paving"): (0.68, 0.61, 0.52), ("path", "unpaved"): (0.62, 0.53, 0.40), ("path", "wood"): (0.50, 0.38, 0.25),
}
MARKING_COLOUR = (0.92, 0.92, 0.90)
ZEBRA_TAGS = ("uncontrolled", "zebra", "marked")
AIRFIELD = {"runway": 45.0, "taxiway": 23.0}   # metres; Gibraltar runway is 45 m wide per AIP (default if untagged)


def width_for(tags, cls_default):
    w = parse_length(tags.get("width")) or parse_length(tags.get("est_width"))
    if w and 0.5 < w < 60:
        return w, "osm:width"
    lanes = tags.get("lanes")
    try:
        lanes = int(lanes) if lanes else None
    except ValueError:
        lanes = None
    if lanes and tags.get("highway") not in ("footway", "path", "steps", "pedestrian"):
        return lanes * LANE_WIDTH, "osm:lanes"
    return cls_default, f"default:{tags.get('highway')}"


def collect(d: osm.OsmData, gibraltar_poly):
    """Return (records, {class: [buffered polygons]}, tunnels)."""
    records, shapes, tunnels, bridges = [], {}, [], []
    for w in d.ways.values():
        t = w.tags
        hw = t.get("highway")
        aero = t.get("aeroway")
        if hw in CLASSES:
            cls, dw = CLASSES[hw]
        elif aero in AIRFIELD:
            cls, dw = "road", AIRFIELD[aero]
        else:
            continue
        if t.get("area") == "yes" or (w.nodes[0] == w.nodes[-1] and hw == "pedestrian" and t.get("area") != "no"
                                      and len(w.nodes) > 3):
            poly = d.way_polygon(w)
            if poly is None:
                continue
            geom, width, wsrc = poly, None, "area"
            length = poly.length / 2
        else:
            line = d.way_line(w)
            if line is None:
                continue
            width, wsrc = width_for(t, dw)
            # round caps and joins so junctions close without gaps
            geom = line.buffer(width / 2, cap_style="round", join_style="round", quad_segs=4)
            length = line.length
        ref = f"osm:way/{w.id}"
        rec = {"id": ref, "osm_version": w.version, "name": t.get("name"), "highway": hw or f"aeroway={aero}",
               "class": cls, "width_m": width, "width_source": wsrc, "length_m": round(length, 2),
               "tunnel": t.get("tunnel") not in (None, "no"), "bridge": t.get("bridge") not in (None, "no"),
               "layer": t.get("layer", "0"), "surface": t.get("surface"),
               "surface_group": SURFACE_GROUPS.get(t.get("surface"), "default"),
               "in_gibraltar": bool(gibraltar_poly is not None and gibraltar_poly.intersects(geom))}
        if t.get("tunnel") in ("yes", "culvert") or t.get("indoor") == "yes" or str(t.get("layer", "0")).startswith("-"):
            tunnels.append(rec)
            continue
        records.append(rec)
        if rec["bridge"] and width is not None:
            # The bare-earth DTM shows the ground under a bridge, so the deck
            # is drawn separately, interpolated between its two ends.
            bridges.append({"id": ref, "class": cls, "line": d.way_line(w), "width": width})
            continue
        key = (cls, "default" if cls == "steps" else rec["surface_group"])
        shapes.setdefault(key, []).append(geom)
    return records, shapes, tunnels, bridges


def bridge_mesh(bridges, terrain, ix, iy):
    """Bridge decks: a ribbon whose height varies linearly between the
    terrain heights at its two ends, 0.5 m thick. Assigned to the tile that
    contains the bridge's midpoint."""
    from .glb import Primitive
    ts = config.TILE_SIZE
    ox, oy = ix * ts, iy * ts
    P, N, I = [], [], []
    for b in bridges:
        line = b["line"]
        mid = line.interpolate(0.5, normalized=True)
        if not (ox <= mid.x < ox + ts and oy <= mid.y < oy + ts):
            continue
        c = np.asarray(line.coords)
        seg = np.hypot(*np.diff(c, axis=0).T)
        s = np.concatenate([[0], np.cumsum(seg)])
        if s[-1] < 1:
            continue
        z0, z1 = terrain.surface(c[[0, -1], 0], c[[0, -1], 1]) + OFFSET
        z = z0 + (z1 - z0) * s / s[-1]
        tang = np.gradient(c, axis=0)
        tang /= np.maximum(np.linalg.norm(tang, axis=1, keepdims=True), 1e-9)
        left = np.column_stack([-tang[:, 1], tang[:, 0]]) * b["width"] / 2
        L = np.column_stack([c + left, z]); R = np.column_stack([c - left, z])
        base = sum(len(p) for p in P)
        k = len(c)
        P.append(np.concatenate([L, R])); N.append(np.tile([0, 0, 1.0], (2 * k, 1)))
        a = np.arange(k - 1)
        I.append(np.concatenate([np.column_stack([base + k + a, base + k + a + 1, base + a + 1]),
                                 np.column_stack([base + k + a, base + a + 1, base + a])]))
    if not P:
        return []
    pos = np.concatenate(P); pos[:, 0] -= ox; pos[:, 1] -= oy
    idx = np.concatenate(I)
    # make faces point up regardless of travel direction
    a, b_, c_ = pos[idx[:, 0]], pos[idx[:, 1]], pos[idx[:, 2]]
    up = np.cross(b_ - a, c_ - a)[:, 2] < 0
    idx[up] = idx[up][:, [0, 2, 1]]
    col = np.tile(srgb_to_linear(COLOUR["road"]), (len(pos), 1))
    return [Primitive("M_Road", pos, np.concatenate(N), col, idx)]


def merge(shapes, land):
    """Union per (class, surface), subtract everything of higher priority,
    clip to land. Surfaces therefore never overlap."""
    merged, taken = {}, None
    keys = [(c, s) for c in PRIORITY for s in SURFACE_ORDER if (c, s) in shapes]
    for key in keys:
        u = shapely.union_all(shapes[key]).intersection(land)
        if taken is not None:
            u = u.difference(taken)
        merged[key] = u
        taken = u if taken is None else shapely.union_all([taken, u])
    return merged


def collect_crossings(d, merged):
    """Zebra stripes for marked/uncontrolled pedestrian crossings.

    A crossing way (footway=crossing) gives the walking direction directly;
    a crossing node on a road takes the road's direction. Stripes are 0.5 m
    bands 1 m apart, parallel to the traffic, clipped to the carriageway.
    Positions are OSM; stripe dimensions are the standard UK zebra layout."""
    road = shapely.union_all([g for (c, _), g in merged.items() if c == "road"])
    shapely.prepare(road)
    out, done = [], []

    def stripes(cx, cy, n, length):
        t = np.array([n[1], -n[0]])          # along the traffic
        polys = []
        for s in np.arange(-length / 2 + 0.25, length / 2 - 0.24, 1.0):
            c = np.array([cx, cy]) + n * s
            corners = [c + t * 1.25 + n * 0.25, c - t * 1.25 + n * 0.25, c - t * 1.25 - n * 0.25, c + t * 1.25 - n * 0.25]
            polys.append(shapely.Polygon(corners))
        return shapely.union_all(polys).intersection(road)

    for w in d.ways.values():
        t = w.tags
        if t.get("footway") != "crossing" or not (t.get("crossing") in ZEBRA_TAGS or t.get("crossing_ref") == "zebra"):
            continue
        line = d.way_line(w)
        if line is None or line.length < 1:
            continue
        c = np.asarray(line.coords)
        n = (c[-1] - c[0]) / np.hypot(*(c[-1] - c[0]))
        mid = line.interpolate(0.5, normalized=True)
        g = stripes(mid.x, mid.y, n, line.length + 2)
        if not g.is_empty:
            out.append({"id": f"osm:way/{w.id}", "kind": "zebra", "_geom": g})
            done.append((mid.x, mid.y))
    # node crossings: find the road way through the node for its direction
    node_ways = {}
    for w in d.ways.values():
        if w.tags.get("highway") in CLASSES and CLASSES[w.tags["highway"]][0] == "road":
            for k, nid in enumerate(w.nodes):
                node_ways.setdefault(nid, (w, k))
    for nid, t in d.node_tags.items():
        if t.get("highway") != "crossing" or not (t.get("crossing") in ZEBRA_TAGS or t.get("crossing_ref") == "zebra"):
            continue
        if nid not in node_ways:
            continue
        x, y = d.node_xy[nid]
        if any(abs(x - a) < 6 and abs(y - b) < 6 for a, b in done):
            continue
        w, k = node_ways[nid]
        a_, b_ = w.nodes[max(k - 1, 0)], w.nodes[min(k + 1, len(w.nodes) - 1)]
        tvec = np.array(d.node_xy[b_]) - np.array(d.node_xy[a_])
        if np.hypot(*tvec) < 0.1:
            continue
        tvec /= np.hypot(*tvec)
        n = np.array([-tvec[1], tvec[0]])
        width, _ = width_for(w.tags, CLASSES[w.tags["highway"]][1])
        g = stripes(x, y, n, width + 1)
        if not g.is_empty:
            out.append({"id": f"osm:node/{nid}", "kind": "zebra", "_geom": g})
    return out


def tile_mesh(merged, terrain, ix, iy, crossings=()):
    from .glb import Primitive
    ts = config.TILE_SIZE
    ox, oy = ix * ts, iy * ts
    tbox = box(ox, oy, ox + ts, oy + ts)
    prims = []
    marks = [c["_geom"] for c in crossings if c["_geom"].intersects(tbox)]
    layers = list(merged.items())
    if marks:
        layers.append((("marking", "zebra"), shapely.union_all(marks)))
    for (cls, sg), geom in layers:
        g = geom.intersection(tbox)
        if g.is_empty:
            continue
        P, I = drape(g)
        if not len(P):
            continue
        lift = OFFSET + (0.02 if cls == "marking" else 0.0)
        z = terrain.surface(P[:, 0], P[:, 1]) + lift
        nrm = terrain._surface_normals(P[:, 0], P[:, 1])
        pos = np.column_stack([P[:, 0] - ox, P[:, 1] - oy, z])
        colour = MARKING_COLOUR if cls == "marking" else SURFACE_COLOUR.get((cls, sg), COLOUR[cls])
        col = np.tile(srgb_to_linear(colour), (len(pos), 1))
        prims.append(Primitive("M_Road" if cls == "marking" else MATERIAL[cls], pos, nrm, col, I))
    return prims


def drape(g):
    """Split polygon(s) g along the terrain lattice triangles. Returns
    (points[N,2], triangles[M,3]); each output triangle lies inside a single
    terrain triangle, so giving its vertices terrain heights makes it
    coplanar with the ground."""
    P, I = [], []
    nverts = 0
    gx0, gy0, gx1, gy1 = g.bounds
    i0, j0 = int(np.floor(gx0 / CELL)), int(np.floor(gy0 / CELL))
    i1, j1 = int(np.ceil(gx1 / CELL)), int(np.ceil(gy1 / CELL))
    ii, jj = np.meshgrid(np.arange(i0, i1), np.arange(j0, j1))
    x0 = ii.ravel() * CELL; y0 = jj.ravel() * CELL
    cells = shapely.box(x0, y0, x0 + CELL, y0 + CELL)
    shapely.prepare(g)
    hit = shapely.intersects(g, cells)
    x0, y0 = x0[hit], y0[hit]
    tri_a = shapely.polygons(np.stack([np.column_stack([x0, y0]), np.column_stack([x0 + CELL, y0]),
                                       np.column_stack([x0 + CELL, y0 + CELL])], 1))
    tri_b = shapely.polygons(np.stack([np.column_stack([x0, y0]), np.column_stack([x0 + CELL, y0 + CELL]),
                                       np.column_stack([x0, y0 + CELL])], 1))
    for tris in (tri_a, tri_b):
        for piece in shapely.intersection(tris, g):
            for poly in _polys(piece):
                pts, t = _triangulate(poly)
                if len(t):
                    P.append(pts); I.append(t + nverts); nverts += len(pts)
    if not P:
        return np.zeros((0, 2)), np.zeros((0, 3), np.int64)
    return np.concatenate(P), np.concatenate(I)
