"""Doors and windows on building façades.

Doors: at OpenStreetMap `entrance=*` / `door=*` nodes on a building's outline
(mapped). A building with none gets one procedural door on the outside wall
nearest a street.

Windows: there's no open dataset of window positions for Gibraltar, so
windows are procedural: rows on 3 m storeys counted from the building's
lowest ground, evenly spaced along each wall. Walls that touch a
neighbouring building (party walls) get no windows or doors. Buildings outside
Gibraltar (the La Línea context strip) get none. Every building
record says which of its doors are mapped and which are procedural, and that
its windows are procedural.
"""
import numpy as np
import shapely

from .buildings import LEVEL_HEIGHT, roof_z
from .terrain import _polys, srgb_to_linear

RULE = "procedural v1: 3 m storeys from lowest ground; 1.2 x 1.5 m windows, sill 0.9 m, ~3 m apart"
NO_OPENINGS = {"garage", "garages", "shed", "bunker", "ruins", "roof", "carport", "storage_tank", "service",
               "silo", "transformer_tower", "water_tower", "bridge", "construction", "container", "tank"}
NO_DOOR = NO_OPENINGS | {"greenhouse"}
SPARSE = {"industrial", "warehouse", "hangar", "manufacture", "parking", "transportation", "stadium"}
CHURCH = {"church", "chapel", "cathedral", "mosque", "synagogue", "temple", "religious"}
SHOPFRONT = {"retail", "commercial", "kiosk", "supermarket"}

FRAME, GLASS, DOOR = (0.86, 0.85, 0.80), (0.10, 0.14, 0.19), (0.28, 0.19, 0.12)
OFF_FRAME, OFF_GLASS = 0.03, 0.05     # metres in front of the wall plane


def attach(records, d, terrain, road_recs):
    """Find mapped entrances, party walls and procedural door positions."""
    entrance_nodes = {nid: t for nid, t in d.node_tags.items() if "entrance" in t or "door" in t}
    polys = [r["_poly"] for r in records]
    tree = shapely.STRtree(polys)
    road_lines = [d.way_line(d.ways[int(r["id"].split("/")[1])]) for r in road_recs
                  if not r["tunnel"] and r["width_m"] is not None]
    road_lines = [ln for ln in road_lines if ln is not None]
    road_tree = shapely.STRtree(road_lines)
    for k, r in enumerate(records):
        if not r["in_gibraltar"]:
            # The Spanish context strip gets no openings (keeps the build small).
            r["facade"] = {"doors_mapped": 0, "doors_procedural": 0, "windows": 0,
                           "windows_source": "none (outside Gibraltar)", "doors": []}
            continue
        r["_neighbours"] = [polys[j] for j in tree.query(r["_poly"].buffer(1.0)) if j != k]
        kind, num = r["id"].split(":")[1].split("/")
        if kind == "way":
            nodes = d.ways[int(num)].nodes
        else:
            rel = d.relations[int(num)]
            nodes = [n for t, ref, _ in rel.members if t == "way" and ref in d.ways for n in d.ways[ref].nodes]
        doors = []
        for nid in dict.fromkeys(nodes):
            t = entrance_nodes.get(nid)
            if t is None or t.get("entrance") == "no":
                continue
            x, y = d.node_xy[nid]
            main = t.get("entrance") == "main"
            doors.append({"position_m": [round(x, 3), round(y, 3)], "width_m": 1.6 if main else 1.1,
                          "source": f"osm:node/{nid} entrance={t.get('entrance', t.get('door'))}"})
        if not doors and r["building"] not in NO_DOOR and not r["_roof_only"] and len(road_lines):
            p = _street_door(r, road_lines, road_tree)
            if p is not None:
                doors.append({"position_m": [round(p[0], 3), round(p[1], 3)], "width_m": 1.1,
                              "source": "procedural: wall nearest a street"})
        r["_doors"] = doors
        r["facade"] = {"doors_mapped": sum(1 for x in doors if x["source"].startswith("osm")),
                       "doors_procedural": sum(1 for x in doors if x["source"].startswith("procedural")),
                       "windows": 0, "windows_source": "none" if r["building"] in NO_OPENINGS else RULE,
                       "doors": doors}


def _is_party(r, mid, out):
    """True if just outside this wall lies another building."""
    p = shapely.Point(*(mid + out * 0.6))
    return any(nb.contains(p) for nb in r["_neighbours"])


def _edges(poly):
    """(p0, p1, along-unit, outward-unit, length) for every wall of a polygon."""
    poly = shapely.geometry.polygon.orient(poly, 1.0)
    for ring in [poly.exterior, *poly.interiors]:
        c = np.asarray(ring.coords)[:, :2]
        for a in range(len(c) - 1):
            d = c[a + 1] - c[a]
            L = float(np.hypot(*d))
            if L < 1e-3:
                continue
            t = d / L
            yield c[a], c[a + 1], t, np.array([t[1], -t[0]]), L


def _street_door(r, road_lines, road_tree):
    best, best_d = None, np.inf
    for poly in _polys(r["_poly"]):
        for p0, p1, t, out, L in _edges(poly):
            if L < 2.0:
                continue
            mid = 0.5 * (p0 + p1)
            if _is_party(r, mid, out):
                continue
            pt = shapely.Point(*(mid + out * 1.0))
            j = road_tree.nearest(pt)
            dist = road_lines[j].distance(pt)
            if dist < best_d:
                best, best_d = mid, dist
    return best


def mesh(records, origin, feature_index, terrain):
    from .glb import Primitive
    ox, oy = origin
    bufs = {"M_Window": ([], [], [], [], []), "M_Door": ([], [], [], [], [])}
    count = {"M_Window": 0, "M_Door": 0}     # vertices so far (O(1), not a re-count)

    def quad(mat, centre, t, out, w, z0, z1, off, colour, fid):
        P, N, C, I, F = bufs[mat]
        b = count[mat]
        count[mat] += 4
        base = centre + out * off
        a, c = base - t * w / 2, base + t * w / 2
        P.append(np.array([[a[0] - ox, a[1] - oy, z0], [c[0] - ox, c[1] - oy, z0],
                           [c[0] - ox, c[1] - oy, z1], [a[0] - ox, a[1] - oy, z1]]))
        N.append(np.tile([out[0], out[1], 0.0], (4, 1)))
        C.append(np.tile(srgb_to_linear(colour), (4, 1)))
        F.append(np.full(4, fid))
        I.append(np.array([[b, b + 1, b + 2], [b, b + 2, b + 3]]))   # faces `out` (see buildings.mesh)

    for r in records:
        if r["override"] or r["_roof_only"] or "_doors" not in r:
            continue
        fid = feature_index[r["id"]]
        m = r["roof"]
        g0 = r["ground_min_m"] + r["min_height_m"]
        bt = r["building"]
        door_pts = []
        # doors: snap each to its nearest wall
        for door in r["_doors"]:
            p = np.array(door["position_m"])
            best = None
            for poly in _polys(r["_poly"]):
                for p0, p1, t, out, L in _edges(poly):
                    s = np.clip((p - p0) @ t, 0, L)
                    dist = np.hypot(*(p0 + t * s - p))
                    if best is None or dist < best[0]:
                        best = (dist, p0 + t * np.clip(s, min(door["width_m"] / 2 + 0.1, L / 2), max(L - door["width_m"] / 2 - 0.1, L / 2)), t, out)
            if best is None:
                continue
            _, c, t, out = best
            z0 = float(terrain.surface(*(c + out * 0.5)))
            z0 = max(z0, r["ground_min_m"])
            w = door["width_m"]
            quad("M_Door", c, t, out, w + 0.2, z0, z0 + 2.4, OFF_FRAME, FRAME, fid)
            quad("M_Door", c, t, out, w, z0, z0 + 2.2, OFF_GLASS, DOOR, fid)
            door_pts.append(c)
        if bt in NO_OPENINGS:
            continue
        # windows
        if bt in CHURCH:
            spacing, ww, wh, sill = 5.0, 1.2, 3.0, 2.5
        elif bt in SPARSE:
            spacing, ww, wh, sill = 6.0, 1.8, 1.2, 1.6
        else:
            spacing, ww, wh, sill = 3.0, 1.2, 1.5, 0.9
        n_win = 0
        for poly in _polys(r["_poly"]):
            for p0, p1, t, out, L in _edges(poly):
                if L < 2.5 or _is_party(r, 0.5 * (p0 + p1), out):
                    continue
                n = max(1, int((L - 1.2) // spacing) + 1)
                ss = (np.arange(n) + 0.5) * (L / n)
                centres = p0 + np.outer(ss, t)
                # highest ground in front of either bottom corner of the widest
                # window used on this wall (shopfronts are 2.6 m)
                half = 1.4
                gl = terrain.surface(*(centres - t * half + out * 0.1).T)
                gr = terrain.surface(*(centres + t * half + out * 0.1).T)
                gc = terrain.surface(*(centres + out * 0.1).T)
                ground = np.maximum(np.maximum(gl, gr), gc)
                top = roof_z(m, centres) - 0.4
                floors = range(int((np.max(top) - g0) // LEVEL_HEIGHT) + 1) if bt not in CHURCH else [0]
                for k in floors:
                    for c, gz, tz in zip(centres, ground, top):
                        shop = k == 0 and bt in SHOPFRONT
                        w_, h_, s_ = (min(2.6, spacing * 0.85), 2.4, 0.4) if shop else (ww, wh, sill)
                        z0 = g0 + k * LEVEL_HEIGHT + s_
                        if z0 < gz + 0.3 or z0 + h_ > tz:
                            continue        # below ground on a slope, or above the eaves
                        if k == 0 and any(np.hypot(*(c - dp)) < 1.6 for dp in door_pts):
                            continue
                        quad("M_Window", c, t, out, w_, z0, z0 + h_, OFF_GLASS, GLASS, fid)
                        n_win += 1
        r["facade"]["windows"] = n_win
    prims = []
    for mat, (P, N, C, I, F) in bufs.items():
        if P:
            prims.append(Primitive(mat, np.concatenate(P), np.concatenate(N), np.concatenate(C),
                                   np.concatenate(I), np.concatenate(F)))
    return prims
