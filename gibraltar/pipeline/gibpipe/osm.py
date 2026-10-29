"""Load the raw OSM blocks into one de-duplicated dataset and build geometries
in engine coordinates (GIB-LTM metres)."""
import glob
from dataclasses import dataclass, field

import numpy as np
import shapely
from shapely.geometry import LineString, Polygon
from shapely.ops import linemerge, polygonize, unary_union

from . import config, crs


@dataclass
class Way:
    id: int
    version: int
    nodes: list
    tags: dict


@dataclass
class Relation:
    id: int
    version: int
    members: list          # (type, ref, role)
    tags: dict


@dataclass
class OsmData:
    node_xy: dict = field(default_factory=dict)       # id -> (x, y) engine metres
    node_ll: dict = field(default_factory=dict)       # id -> (lon, lat)
    node_tags: dict = field(default_factory=dict)     # id -> tags (only tagged nodes)
    node_version: dict = field(default_factory=dict)
    ways: dict = field(default_factory=dict)
    relations: dict = field(default_factory=dict)

    # ---- geometry helpers -------------------------------------------------
    def way_coords(self, way):
        pts = [self.node_xy[n] for n in way.nodes if n in self.node_xy]
        return pts if len(pts) == len(way.nodes) else None

    def way_line(self, way):
        pts = self.way_coords(way)
        if pts is None or len(pts) < 2:
            return None
        return LineString(pts)

    def way_polygon(self, way):
        pts = self.way_coords(way)
        if pts is None or len(pts) < 4 or way.nodes[0] != way.nodes[-1]:
            return None
        p = Polygon(pts)
        if not p.is_valid:
            p = shapely.make_valid(p)
            p = unary_union([g for g in getattr(p, "geoms", [p]) if g.geom_type == "Polygon"])
        return p if not p.is_empty and p.area > 0 else None

    def relation_polygon(self, rel):
        """Assemble a multipolygon relation from its member ways."""
        outer, inner = [], []
        for typ, ref, role in rel.members:
            if typ != "way" or ref not in self.ways:
                continue
            line = self.way_line(self.ways[ref])
            if line is None:
                return None          # incomplete relation; skip rather than guess
            (inner if role == "inner" else outer).append(line)
        if not outer:
            return None
        outers = list(polygonize(linemerge(outer)))
        inners = list(polygonize(linemerge(inner))) if inner else []
        if not outers:
            return None
        poly = unary_union(outers)
        if inners:
            poly = poly.difference(unary_union(inners))
        return poly if not poly.is_empty else None

    def element_polygon(self, kind, elem):
        return self.way_polygon(elem) if kind == "way" else self.relation_polygon(elem)


def load(files=None, margin_deg=0.004):
    """Read the OSM extracts and keep every element that touches the fetch
    bbox (plus a small margin). Ways are kept whole, with all their nodes, even
    where they run outside the bbox; this matters for long coastline ways.
    Where extracts overlap, the highest version of an element wins."""
    import osmium
    files = files or sorted(glob.glob(str(config.RAW / "osm" / "*.osm.pbf")))
    w, s, e, n = config.FETCH_BBOX_LONLAT
    w, s, e, n = w - margin_deg, s - margin_deg, e + margin_deg, n + margin_deg

    def inside(lon, lat):
        return w <= lon <= e and s <= lat <= n

    # Pre-pass: the territory boundary relation runs far out to sea, so its
    # member ways are kept regardless of the bbox.
    always = set()
    for f in files:
        for o in osmium.FileProcessor(f, osmium.osm.RELATION):
            if o.id == config.GIBRALTAR_RELATION:
                always |= {m.ref for m in o.members if m.type == "w"}

    d = OsmData()
    raw_nodes = {}
    for f in files:
        for o in osmium.FileProcessor(f).with_locations():
            if o.is_node():
                loc = o.location
                if loc.valid() and inside(loc.lon, loc.lat) and o.version >= d.node_version.get(o.id, -1):
                    raw_nodes[o.id] = (loc.lon, loc.lat)
                    d.node_version[o.id] = o.version
                    tags = dict(o.tags)
                    if tags:
                        d.node_tags[o.id] = tags
                    else:
                        d.node_tags.pop(o.id, None)
            elif o.is_way():
                old = d.ways.get(o.id)
                if old is not None and old.version >= o.version:
                    continue
                locs = [(nd.ref, nd.location) for nd in o.nodes]
                if o.id not in always and not any(l.valid() and inside(l.lon, l.lat) for _, l in locs):
                    continue
                if not all(l.valid() for _, l in locs):
                    continue        # incomplete in this extract; another may have it whole
                for ref, l in locs:
                    raw_nodes.setdefault(ref, (l.lon, l.lat))
                d.ways[o.id] = Way(o.id, o.version, [r for r, _ in locs], dict(o.tags))
            elif o.is_relation():
                old = d.relations.get(o.id)
                if old is not None and old.version >= o.version:
                    continue
                d.relations[o.id] = Relation(o.id, o.version, [(m.type, m.ref, m.role) for m in o.members],
                                             dict(o.tags))
    # Map member type letters (n/w/r) to the names used elsewhere.
    names = {"n": "node", "w": "way", "r": "relation"}
    for r in d.relations.values():
        r.members = [(names.get(t, t), ref, role) for t, ref, role in r.members]
    # Keep only relations that reference something we kept.
    d.relations = {k: r for k, r in d.relations.items()
                   if any((t == "way" and ref in d.ways) or (t == "node" and ref in raw_nodes)
                          for t, ref, _ in r.members) or k == config.GIBRALTAR_RELATION}
    ids = np.fromiter(raw_nodes.keys(), dtype=np.int64)
    ll = np.array(list(raw_nodes.values()))
    x, y = crs.lonlat_to_engine(ll[:, 0], ll[:, 1])
    d.node_xy = dict(zip(ids.tolist(), zip(x.tolist(), y.tolist())))
    d.node_ll = dict(zip(ids.tolist(), map(tuple, ll.tolist())))
    return d


def iter_areas(d, predicate):
    """Yield (kind, element, polygon) for closed ways and multipolygon
    relations whose tags satisfy the predicate."""
    for w in d.ways.values():
        if w.tags and predicate(w.tags) and len(w.nodes) > 3 and w.nodes[0] == w.nodes[-1]:
            p = d.way_polygon(w)
            if p is not None:
                yield "way", w, p
    for r in d.relations.values():
        if r.tags.get("type") in ("multipolygon", "boundary") and predicate(r.tags):
            p = d.relation_polygon(r)
            if p is not None:
                yield "relation", r, p


def osm_ref(kind, elem):
    return f"osm:{kind}/{elem.id}"


def node_name(ref):
    kind, num = ref.split(":")[1].split("/")
    return f"osm_{kind[0]}{num}"
