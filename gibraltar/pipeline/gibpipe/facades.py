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

Balconies and shutters: no open data records them either. They follow
documented Gibraltar style rules (STYLE_RULES), unless an entry in
data/facade_overrides.json records what the real building has:
  * old town (config.OLD_TOWN_POLYGON) houses and mixed buildings: painted
    louvred shutters on upper-floor windows; small wrought-iron balconies on
    walls facing a street (every first-floor window, about half above) where there is head room above the street;
  * residential blocks (apartments/residential, 12 m+, outside the old
    town: post-war estates and modern towers): concrete balconies with solid parapets on every other window of
    the block's two longest outside walls;
  * houses elsewhere: shutters, no balconies;
  * everything else (offices, public, industrial, military, churches, ...): none.
"""
import json
import zlib

import numpy as np
import shapely

from . import config
from .buildings import LEVEL_HEIGHT, parse_colour, roof_z
from .props import MeshBuf
from .terrain import _polys, srgb_to_linear

RULE = "procedural v1: 3 m storeys from lowest ground; 1.2 x 1.5 m windows, sill 0.9 m, ~3 m apart"
NO_OPENINGS = {"garage", "garages", "shed", "bunker", "ruins", "roof", "carport", "storage_tank", "service",
               "silo", "transformer_tower", "water_tower", "bridge", "construction", "container", "tank"}
NO_DOOR = NO_OPENINGS | {"greenhouse"}
SPARSE = {"industrial", "warehouse", "hangar", "manufacture", "parking", "transportation", "stadium"}
CHURCH = {"church", "chapel", "cathedral", "mosque", "synagogue", "temple", "religious"}
SHOPFRONT = {"retail", "commercial", "kiosk", "supermarket"}

FRAME, GLASS, DOOR = (0.86, 0.85, 0.80), (0.10, 0.14, 0.19), (0.28, 0.19, 0.12)

STYLE_RULES = "Gibraltar style rules v1 (see facades.py docstring)"
OLD_TOWN_TYPES = {"residential", "apartments", "house", "terrace", "yes", "commercial", "retail",
                  "semidetached_house", "detached", "hotel"}
HOUSE_TYPES = {"house", "detached", "semidetached_house", "terrace"}
# Painted shutter colours seen in the old town; picked per building by a hash
# of its id (deterministic), with these approximate shares.
SHUTTER_PALETTE = [("green", (0.16, 0.30, 0.20), 0.60), ("brown", (0.36, 0.23, 0.14), 0.25),
                   ("white", (0.88, 0.87, 0.82), 0.15)]
SHUTTER_NAMED = {name: c for name, c, _ in SHUTTER_PALETTE}
IRON, BALCONY_STONE, CONCRETE = (0.07, 0.07, 0.08), (0.80, 0.77, 0.70), (0.76, 0.75, 0.71)

_CTX = {}     # road lines/tree, old-town polygon, overrides (set by attach; inherited by workers)


def _hash(*parts):
    return zlib.crc32("|".join(map(str, parts)).encode()) / 2 ** 32


def style_for(r):
    """{shutters: colour name|None, balconies: ironwork|concrete|None, detail_source}"""
    ov = _CTX["overrides"].get(r["id"])
    if ov:
        sh = ov.get("shutters", "none")
        return {"shutters": None if sh in (None, "none") else sh,
                "balconies": None if ov.get("balconies", "none") in (None, "none") else ov["balconies"],
                "detail_source": "recorded: " + ov.get("source", "unspecified")}
    bt = r["building"]
    c = shapely.Point(*r["centroid_m"])
    if bt in NO_OPENINGS or bt in CHURCH or bt in SPARSE:
        return {"shutters": None, "balconies": None, "detail_source": "rule: none for this building type"}
    h = _hash(r["id"], "shutter")
    acc, colour = 0.0, SHUTTER_PALETTE[-1][0]
    for name, _, share in SHUTTER_PALETTE:
        acc += share
        if h < acc:
            colour = name
            break
    if _CTX["old_town"].contains(c) and bt in OLD_TOWN_TYPES:
        return {"shutters": colour, "balconies": "ironwork", "detail_source": "rule: old town"}
    if bt in ("apartments", "residential") and r["height_m"] >= 12:
        return {"shutters": None, "balconies": "concrete", "detail_source": "rule: residential block (12 m+)"}
    if bt in HOUSE_TYPES:
        return {"shutters": colour, "balconies": None, "detail_source": "rule: house"}
    return {"shutters": None, "balconies": None, "detail_source": "rule: none for this building type"}


def _street_facing(mid, out):
    pt = shapely.Point(*(mid + out * 4.0))
    return len(_CTX["road_tree"].query(pt, predicate="dwithin", distance=10.0)) > 0
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
    ov = json.loads(config.FACADE_OVERRIDES.read_text()) if config.FACADE_OVERRIDES.exists() else {}
    _CTX.update(road_tree=road_tree, old_town=shapely.prepared.prep(shapely.Polygon(config.OLD_TOWN_POLYGON)),
                overrides={k: v for k, v in ov.items() if not k.startswith("_")})
    for k, r in enumerate(records):
        if not r["in_gibraltar"]:
            # The Spanish context strip gets no openings (keeps the build small).
            r["facade"] = {"doors_mapped": 0, "doors_procedural": 0, "windows": 0,
                           "windows_source": "none (outside Gibraltar)", "doors": [], "shutters": None,
                           "balconies": None, "detail_source": "none (outside Gibraltar)",
                           "balcony_count": 0, "shuttered_windows": 0}
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
                       "doors": doors, **style_for(r), "balcony_count": 0, "shuttered_windows": 0}


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
    balcony_buf = MeshBuf()
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
        n_win = n_bal = n_shut = 0
        fa = r["facade"]
        sh = fa.get("shutters")
        sh_col = None if sh is None else (SHUTTER_NAMED.get(sh) or parse_colour(sh) or SHUTTER_PALETTE[0][1])
        bal = fa.get("balconies")
        # concrete balconies go on the two longest outside walls (estates
        # typically have balcony façades on their long sides)
        lens = sorted((L for poly in _polys(r["_poly"]) for p0, p1, t, out, L in _edges(poly)
                       if L >= 2.5 and not _is_party(r, 0.5 * (p0 + p1), out)), reverse=True)
        longest_two = lens[1] if len(lens) > 1 else (lens[0] if lens else np.inf)
        for poly in _polys(r["_poly"]):
            for p0, p1, t, out, L in _edges(poly):
                if L < 2.5 or _is_party(r, 0.5 * (p0 + p1), out):
                    continue
                street = bal == "ironwork" and _street_facing(0.5 * (p0 + p1), out)
                concrete_wall = bal == "concrete" and L >= longest_two
                yaw = float(np.arctan2(t[1], t[0]))
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
                    for i_w, (c, gz, tz) in enumerate(zip(centres, ground, top)):
                        shop = k == 0 and bt in SHOPFRONT
                        w_, h_, s_ = (min(2.6, spacing * 0.85), 2.4, 0.4) if shop else (ww, wh, sill)
                        z0 = g0 + k * LEVEL_HEIGHT + s_
                        if z0 < gz + 0.3 or z0 + h_ > tz:
                            continue        # below ground on a slope, or above the eaves
                        if k == 0 and any(np.hypot(*(c - dp)) < 1.6 for dp in door_pts):
                            continue
                        floor_z = g0 + k * LEVEL_HEIGHT
                        balcony = None
                        # a balcony needs head room above the street outside it
                        if k >= 1 and not shop and floor_z - 0.2 >= gz + 2.2:
                            if street and (k == 1 or _hash(r["id"], round(c[0], 1), round(c[1], 1), k) < 0.5):
                                balcony = "ironwork"
                            elif concrete_wall and L >= 6 and i_w % 2 == 0:
                                balcony = "concrete"
                        if balcony:
                            # the window becomes a balcony door down to the floor
                            quad("M_Window", c, t, out, w_, floor_z + 0.05, z0 + h_, OFF_GLASS, GLASS, fid)
                            _balcony(balcony_buf, balcony, c, out, yaw, w_, floor_z, fid)
                            n_bal += 1
                        else:
                            quad("M_Window", c, t, out, w_, z0, z0 + h_, OFF_GLASS, GLASS, fid)
                        if sh_col is not None and k >= 1 and not shop:
                            zb = floor_z + 0.05 if balcony else z0
                            for side in (-1, 1):   # two leaves folded open against the wall
                                quad("M_Door", c + t * side * (w_ * 0.75 + 0.03), t, out, w_ / 2, zb, z0 + h_,
                                     0.04, sh_col, fid)
                            n_shut += 1
                        n_win += 1
        fa["windows"], fa["balcony_count"], fa["shuttered_windows"] = n_win, n_bal, n_shut
    prims = []
    for mat, (P, N, C, I, F) in bufs.items():
        if P:
            prims.append(Primitive(mat, np.concatenate(P), np.concatenate(N), np.concatenate(C),
                                   np.concatenate(I), np.concatenate(F)))
    if balcony_buf.P:
        pos = np.concatenate(balcony_buf.P); pos[:, 0] -= ox; pos[:, 1] -= oy
        prims.append(Primitive("M_Prop", pos, np.concatenate(balcony_buf.N), np.concatenate(balcony_buf.C),
                               np.concatenate(balcony_buf.I), np.concatenate(balcony_buf.F)))
    return prims


def _face(buf, corners, normal, colour, fid):
    """One quad, wound so it faces `normal`."""
    q = np.asarray(corners, float)
    n = np.asarray(normal, float)
    if np.cross(q[1] - q[0], q[2] - q[0]) @ n < 0:
        q = q[::-1]
    buf.add(q, np.tile(n, (4, 1)), colour, [(0, 1, 2), (0, 2, 3)], fid)


def _balcony(buf, kind, c, out, yaw, w, floor_z, fid):
    """Slab plus railing projecting from the wall at window position c, built
    from as few faces as possible to keep the façade layer light."""
    if kind == "ironwork":
        W, D, S, H, slab_c, rail_c = w + 0.5, 0.55, 0.12, 0.95, BALCONY_STONE, IRON
    else:
        W, D, S, H, slab_c, rail_c = w + 1.2, 1.2, 0.18, 1.0, CONCRETE, CONCRETE
    t = np.array([np.cos(yaw), np.sin(yaw)])
    o = np.asarray(out, float)

    def P(a, b, z):        # a along the wall, b out from it
        xy = c + t * a + o * b
        return (xy[0], xy[1], z)
    up, down = (0, 0, 1), (0, 0, -1)
    ot, oo = (o[0], o[1], 0), (t[0], t[1], 0)
    neg = lambda v: tuple(-x for x in v)
    z0, z1 = floor_z - S, floor_z
    h = W / 2
    # slab: top, bottom, front, two ends
    _face(buf, [P(-h, 0, z1), P(h, 0, z1), P(h, D, z1), P(-h, D, z1)], up, slab_c, fid)
    _face(buf, [P(-h, 0, z0), P(h, 0, z0), P(h, D, z0), P(-h, D, z0)], down, slab_c, fid)
    _face(buf, [P(-h, D, z0), P(h, D, z0), P(h, D, z1), P(-h, D, z1)], ot, slab_c, fid)
    for s_ in (-1, 1):
        _face(buf, [P(s_ * h, 0, z0), P(s_ * h, D, z0), P(s_ * h, D, z1), P(s_ * h, 0, z1)],
              oo if s_ > 0 else neg(oo), slab_c, fid)
    # railing / parapet: front and both ends, outer faces only (nobody can
    # stand on a balcony, so their inner faces are hardly ever seen)
    r1 = z1 + H
    if kind == "concrete":                 # solid parapet
        _face(buf, [P(-h, D, z1), P(h, D, z1), P(h, D, r1), P(-h, D, r1)], ot, rail_c, fid)
        for s_ in (-1, 1):
            _face(buf, [P(s_ * h, 0, z1), P(s_ * h, D, z1), P(s_ * h, D, r1), P(s_ * h, 0, r1)],
                  oo if s_ > 0 else neg(oo), rail_c, fid)
        return
    # wrought iron: an open railing you can see through. A 5 cm top rail on
    # the front and both ends, and 2.5 cm uprights about every 30 cm.
    rt, bw = 0.05, 0.025
    _face(buf, [P(-h, D, r1 - rt), P(h, D, r1 - rt), P(h, D, r1), P(-h, D, r1)], ot, rail_c, fid)
    _face(buf, [P(-h, D - 0.03, r1), P(h, D - 0.03, r1), P(h, D, r1), P(-h, D, r1)], up, rail_c, fid)
    for s_ in (-1, 1):
        _face(buf, [P(s_ * h, 0, r1 - rt), P(s_ * h, D, r1 - rt), P(s_ * h, D, r1), P(s_ * h, 0, r1)],
              oo if s_ > 0 else neg(oo), rail_c, fid)
    n = max(2, int(round(W / 0.3)))
    for a_ in np.linspace(-h + bw, h - bw, n):
        _face(buf, [P(a_ - bw / 2, D, z1), P(a_ + bw / 2, D, z1), P(a_ + bw / 2, D, r1), P(a_ - bw / 2, D, r1)],
              ot, rail_c, fid)
    for s_ in (-1, 1):
        for b_ in np.linspace(0.15, D - bw, 2):
            _face(buf, [P(s_ * h, b_ - bw / 2, z1), P(s_ * h, b_ + bw / 2, z1), P(s_ * h, b_ + bw / 2, r1),
                        P(s_ * h, b_ - bw / 2, r1)], oo if s_ > 0 else neg(oo), rail_c, fid)
