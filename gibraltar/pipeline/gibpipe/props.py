"""Street furniture, trees and small structures at their OpenStreetMap positions.

Each prop's position and kind are mapped data. The model is a simple generic
one of standard real-world size; tagged dimensions (height, crown diameter,
direction) are used when present. Every record states which is which.
"""
import math

import numpy as np
import shapely

from .buildings import parse_length
from .terrain import srgb_to_linear

# ---- tiny mesh builders (GIB-LTM axes, metres) -----------------------------------


class MeshBuf:
    def __init__(self):
        self.P, self.N, self.C, self.I, self.F = [], [], [], [], []
        self.n = 0

    def add(self, pos, nor, col, tris, fid):
        pos = np.asarray(pos, float)
        self.P.append(pos); self.N.append(np.asarray(nor, float))
        self.C.append(np.tile(srgb_to_linear(col), (len(pos), 1)))
        self.I.append(np.asarray(tris) + self.n); self.F.append(np.full(len(pos), fid))
        self.n += len(pos)

    def box(self, cx, cy, z0, sx, sy, sz, yaw, col, fid):
        """Axis-aligned box rotated by yaw (radians, anticlockwise from east)."""
        c, s = math.cos(yaw), math.sin(yaw)
        R = np.array([[c, -s], [s, c]])
        faces = [((1, 0, 0), [(1, -1, 0), (1, 1, 0), (1, 1, 1), (1, -1, 1)]),
                 ((-1, 0, 0), [(-1, 1, 0), (-1, -1, 0), (-1, -1, 1), (-1, 1, 1)]),
                 ((0, 1, 0), [(1, 1, 0), (-1, 1, 0), (-1, 1, 1), (1, 1, 1)]),
                 ((0, -1, 0), [(-1, -1, 0), (1, -1, 0), (1, -1, 1), (-1, -1, 1)]),
                 ((0, 0, 1), [(-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)]),
                 ((0, 0, -1), [(-1, 1, 0), (1, 1, 0), (1, -1, 0), (-1, -1, 0)])]
        for nrm, quad in faces:
            q = np.array(quad, float)
            xy = (q[:, :2] * [sx / 2, sy / 2]) @ R.T + [cx, cy]
            pos = np.column_stack([xy, z0 + q[:, 2] * sz])
            n2 = np.array(nrm[:2], float) @ R.T
            self.add(pos, np.tile([n2[0], n2[1], nrm[2]], (4, 1)), col, [(0, 1, 2), (0, 2, 3)], fid)

    def cylinder(self, cx, cy, z0, r, h, col, fid, sides=8, cap=True):
        a = np.linspace(0, 2 * np.pi, sides + 1)[:-1]
        ring = np.column_stack([np.cos(a), np.sin(a)])
        pos, nor, tri = [], [], []
        for k in range(sides):
            k2 = (k + 1) % sides
            b = len(pos)
            for (u, zz) in ((k, 0), (k2, 0), (k2, h), (k, h)):
                pos.append((cx + r * ring[u, 0], cy + r * ring[u, 1], z0 + zz)); nor.append((ring[u, 0], ring[u, 1], 0))
            tri += [(b, b + 1, b + 2), (b, b + 2, b + 3)]
        if cap:
            b = len(pos)
            pos += [(cx + r * ring[k, 0], cy + r * ring[k, 1], z0 + h) for k in range(sides)]
            nor += [(0, 0, 1)] * sides
            tri += [(b, b + k, b + k + 1) for k in range(1, sides - 1)]
        self.add(pos, nor, col, tri, fid)

    def blob(self, cx, cy, zc, rx, rz, col, fid):
        """Low-poly ellipsoid (octahedron subdivided once): tree crowns."""
        v = np.array([[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]], float)
        f = [(0, 2, 4), (2, 1, 4), (1, 3, 4), (3, 0, 4), (2, 0, 5), (1, 2, 5), (3, 1, 5), (0, 3, 5)]
        verts = list(v); faces = []
        cache = {}

        def mid(a, b):
            key = (min(a, b), max(a, b))
            if key not in cache:
                m = (verts[a] + verts[b]); verts.append(m / np.linalg.norm(m)); cache[key] = len(verts) - 1
            return cache[key]
        for a, b, c in f:
            ab, bc, ca = mid(a, b), mid(b, c), mid(c, a)
            faces += [(a, ab, ca), (b, bc, ab), (c, ca, bc), (ab, bc, ca)]
        V = np.array(verts)
        pos = np.column_stack([cx + V[:, 0] * rx, cy + V[:, 1] * rx, zc + V[:, 2] * rz])
        self.add(pos, V, col, faces, fid)

    def cone(self, cx, cy, z0, r, h, col, fid, sides=8):
        a = np.linspace(0, 2 * np.pi, sides + 1)[:-1]
        pos = [(cx + r * math.cos(t), cy + r * math.sin(t), z0) for t in a] + [(cx, cy, z0 + h)]
        nor = [(math.cos(t), math.sin(t), r / h) for t in a] + [(0, 0, 1)]
        tri = [(k, (k + 1) % sides, sides) for k in range(sides)]
        self.add(pos, nor, col, tri, fid)


# ---- prop kinds -----------------------------------------------------------------

def prop_kind(t):
    if t.get("natural") == "tree":
        return "tree"
    if t.get("amenity") == "bench" or t.get("leisure") == "picnic_table":
        return "picnic_table" if t.get("leisure") == "picnic_table" else "bench"
    for key, val, kind in (("barrier", "bollard", "bollard"), ("amenity", "post_box", "post_box"),
                           ("amenity", "telephone", "telephone"), ("highway", "street_lamp", "street_lamp"),
                           ("historic", "cannon", "cannon"), ("emergency", "fire_hydrant", "fire_hydrant"),
                           ("man_made", "flagpole", "flagpole"), ("highway", "bus_stop", "bus_stop"),
                           ("amenity", "waste_basket", "waste_basket"), ("amenity", "recycling", "recycling"),
                           ("man_made", "mast", "mast"), ("amenity", "fountain", "fountain"),
                           ("amenity", "drinking_water", "drinking_water")):
        if t.get(key) == val:
            return kind
    if t.get("historic") in ("memorial", "monument") and t.get("memorial") not in ("plaque", "blue_plaque", "stolperstein"):
        return "memorial"
    if t.get("tourism") == "information" and t.get("information") == "board":
        return "info_board"
    return None


TRUNK, LEAF, NEEDLE = (0.36, 0.27, 0.20), (0.24, 0.36, 0.17), (0.18, 0.30, 0.18)
BLACK, RED, STONE, WOOD, GREEN = (0.08, 0.08, 0.09), (0.70, 0.06, 0.05), (0.72, 0.69, 0.62), (0.45, 0.32, 0.20), (0.15, 0.30, 0.20)
METAL, BRONZE, WHITE = (0.35, 0.36, 0.38), (0.30, 0.24, 0.15), (0.92, 0.92, 0.90)


def _yaw_from_direction(t):
    """OSM `direction` is a compass bearing (0 = north, clockwise). Returns
    yaw in radians anticlockwise from east, or None."""
    d = t.get("direction") or t.get("camera:direction")
    try:
        return math.radians(90 - float(d))
    except (TypeError, ValueError):
        return None


def build(buf_prop, buf_leaf, rec, fid):
    x, y, z = rec["position_m"]
    k = rec["kind"]
    t = rec["_tags"]
    yaw = rec["yaw_rad"] or 0.0
    if k == "tree":
        h = rec["height_m"]
        cr = rec["crown_m"] / 2
        buf_prop.cylinder(x, y, z - 0.2, max(0.12, h * 0.025), h * 0.55 + 0.2, TRUNK, fid, sides=6, cap=False)
        if t.get("leaf_type") == "needleleaved":
            buf_leaf.cone(x, y, z + h * 0.3, cr, h * 0.7, NEEDLE, fid)
        else:
            buf_leaf.blob(x, y, z + h - cr * 0.9, cr, cr * 0.9, LEAF, fid)
    elif k == "bench":
        buf_prop.box(x, y, z + 0.40, 1.8, 0.45, 0.06, yaw, WOOD, fid)
        buf_prop.box(x - 0.2 * math.sin(yaw), y + 0.2 * math.cos(yaw), z + 0.45, 1.8, 0.06, 0.45, yaw, WOOD, fid)
        for side in (-0.8, 0.8):
            buf_prop.box(x + side * math.cos(yaw), y + side * math.sin(yaw), z, 0.06, 0.45, 0.42, yaw, BLACK, fid)
    elif k == "picnic_table":
        buf_prop.box(x, y, z + 0.72, 1.8, 0.8, 0.05, yaw, WOOD, fid)
        for off in (-0.65, 0.65):
            buf_prop.box(x - off * math.sin(yaw), y + off * math.cos(yaw), z + 0.42, 1.8, 0.3, 0.05, yaw, WOOD, fid)
        buf_prop.box(x, y, z, 0.1, 1.4, 0.72, yaw, WOOD, fid)
    elif k == "bollard":
        buf_prop.cylinder(x, y, z - 0.1, 0.10, 1.0, BLACK, fid, sides=6)
    elif k == "post_box":       # Gibraltar's red pillar boxes
        buf_prop.cylinder(x, y, z - 0.05, 0.25, 1.45, RED, fid, sides=10)
        buf_prop.cylinder(x, y, z + 1.4, 0.29, 0.12, RED, fid, sides=10)
    elif k == "telephone":      # red kiosk
        buf_prop.box(x, y, z, 0.92, 0.92, 2.5, yaw, RED, fid)
    elif k == "street_lamp":
        buf_prop.cylinder(x, y, z - 0.1, 0.08, 6.1, METAL, fid, sides=6)
        buf_prop.box(x, y, z + 5.9, 0.5, 0.25, 0.15, yaw, METAL, fid)
    elif k == "cannon":
        buf_prop.box(x, y, z, 1.4, 1.0, 0.6, yaw, WOOD if t.get("cannon:carriage") != "garrison" else STONE, fid)
        c, s = math.cos(yaw), math.sin(yaw)
        for k2 in range(5):     # barrel as tapering segments along the facing direction
            r = 0.28 - 0.025 * k2
            buf_prop.box(x + c * (0.3 + 0.5 * k2), y + s * (0.3 + 0.5 * k2), z + 0.6, 0.5, 2 * r, 2 * r, yaw, BLACK, fid)
    elif k == "fire_hydrant":
        buf_prop.cylinder(x, y, z - 0.05, 0.12, 0.8, (0.85, 0.75, 0.10), fid, sides=6)
    elif k == "flagpole":
        buf_prop.cylinder(x, y, z - 0.1, 0.06, rec["height_m"], WHITE, fid, sides=6)
    elif k == "mast":
        buf_prop.cylinder(x, y, z - 0.1, 0.25, rec["height_m"], METAL, fid, sides=6)
    elif k == "bus_stop":
        buf_prop.cylinder(x, y, z - 0.1, 0.04, 2.6, METAL, fid, sides=6)
        buf_prop.box(x, y, z + 2.2, 0.45, 0.04, 0.4, yaw, (0.10, 0.25, 0.55), fid)
        if t.get("shelter") == "yes":
            buf_prop.box(x + 1.5 * math.sin(yaw), y - 1.5 * math.cos(yaw), z + 2.3, 3.2, 1.5, 0.1, yaw, METAL, fid)
    elif k in ("waste_basket", "recycling", "drinking_water"):
        buf_prop.cylinder(x, y, z - 0.05, 0.22 if k != "recycling" else 0.6, 0.9 if k != "recycling" else 1.4,
                          GREEN if k == "waste_basket" else METAL, fid, sides=8)
    elif k == "memorial":
        buf_prop.box(x, y, z - 0.2, 1.2, 1.2, 1.4, yaw, STONE, fid)
        if t.get("memorial") == "statue" or t.get("historic") == "monument":
            buf_prop.box(x, y, z + 1.2, 0.5, 0.4, 1.8, yaw, BRONZE, fid)
    elif k == "fountain":
        buf_prop.cylinder(x, y, z - 0.1, 1.5, 0.6, STONE, fid, sides=12)
    elif k == "info_board":
        buf_prop.box(x, y, z, 1.2, 0.08, 2.0, yaw, BRONZE, fid)


DEFAULT_SIZE = {"tree": (7.0, 5.0), "flagpole": (8.0, None), "mast": (15.0, None)}


def collect(d, terrain):
    out = []

    def make(ref, t, x, y, kind, src, version):
        rec = {"id": ref, "osm_version": version, "kind": kind, "name": t.get("name"), "position_m": [x, y, 0.0],
               "source": src, "model": "generic", "_tags": t}
        h = parse_length(t.get("height"))
        dh, dc = DEFAULT_SIZE.get(kind, (None, None))
        if h is not None or dh is not None:
            rec["height_m"] = h or dh
            rec["height_source"] = "osm:height" if h else f"default:{kind}"
        if kind == "tree":
            cd = parse_length(t.get("diameter_crown"))
            rec["crown_m"] = cd or (min(dc, rec["height_m"] * 0.8))
            rec["crown_source"] = "osm:diameter_crown" if cd else "default:tree"
            rec["species"] = t.get("species") or t.get("genus")
        y_ = _yaw_from_direction(t)
        rec["yaw_rad"] = y_
        rec["orientation_source"] = "osm:direction" if y_ is not None else "default:east"
        out.append(rec)

    for nid, t in d.node_tags.items():
        kind = prop_kind(t)
        if kind:
            x, y = d.node_xy[nid]
            make(f"osm:node/{nid}", t, x, y, kind, "osm", d.node_version.get(nid))
    for w in d.ways.values():
        if w.tags.get("natural") == "tree_row":
            line = d.way_line(w)
            if line is None:
                continue
            n = max(2, int(line.length / 8.0) + 1)
            for k, p in enumerate(shapely.line_interpolate_point(line, np.linspace(0, line.length, n))):
                make(f"osm:way/{w.id}#{k}", {**w.tags, "natural": "tree"}, p.x, p.y, "tree",
                     "osm:natural=tree_row (positions every 8 m along the row, estimated)", w.version)
    if out:
        xy = np.array([o["position_m"][:2] for o in out])
        z = terrain.surface(xy[:, 0], xy[:, 1])
        for o, zz in zip(out, z):
            o["position_m"] = [round(o["position_m"][0], 3), round(o["position_m"][1], 3), round(float(zz), 3)]
    return out


def mesh(recs, origin, feature_index):
    from .glb import Primitive
    ox, oy = origin
    prop, leaf = MeshBuf(), MeshBuf()
    for r in recs:
        build(prop, leaf, r, feature_index[r["id"]])
    prims = []
    for buf, mat in ((prop, "M_Prop"), (leaf, "M_Foliage")):
        if buf.P:
            pos = np.concatenate(buf.P); pos[:, 0] -= ox; pos[:, 1] -= oy
            prims.append(Primitive(mat, pos, np.concatenate(buf.N), np.concatenate(buf.C),
                                   np.concatenate(buf.I), np.concatenate(buf.F)))
    return prims


def public_record(r):
    out = {k: v for k, v in r.items() if not k.startswith("_")}
    if out.get("yaw_rad") is not None:
        out["direction_deg"] = round((90 - math.degrees(out["yaw_rad"])) % 360, 1)
    out.pop("yaw_rad", None)
    return out
