"""Terrain: elevation model, land/sea mask from the OSM coastline, land cover,
and per-tile terrain meshes.

The terrain surface is a single global function: heights are sampled from the
DEM at the vertices of a global 5 m lattice in GIB-LTM, and each lattice cell is
split into two triangles along its SW-NE diagonal. Every tile, road and
building samples this same surface, so tile seams match exactly and draped
geometry lies on the ground.
"""
import numpy as np
import rasterio
import shapely
from rasterio import features as rfeatures
from rasterio.transform import from_origin
from scipy import ndimage
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import linemerge, polygonize, unary_union

from . import config, crs, osm

CELL = config.TERRAIN_CELL
BEACH_FILL_M = 1.0      # height given to unsurveyed beach (documented estimate)

# Land cover classes -> sRGB colour. Colours are for readability, not photo-realism.
LANDCOVER = {
    0: ("unmapped", (0.60, 0.57, 0.50)),
    1: ("built", (0.56, 0.55, 0.53)),
    2: ("grass", (0.42, 0.53, 0.27)),
    3: ("scrub", (0.36, 0.40, 0.24)),
    4: ("wood", (0.24, 0.33, 0.18)),
    5: ("heath", (0.47, 0.46, 0.31)),
    6: ("rock", (0.80, 0.78, 0.72)),
    7: ("sand", (0.86, 0.79, 0.62)),
    8: ("pitch", (0.30, 0.52, 0.30)),
    9: ("parking", (0.42, 0.42, 0.42)),
    10: ("runway", (0.33, 0.33, 0.34)),
}
# Higher priority wins where OSM polygons overlap.
LANDCOVER_RULES = [
    (1, lambda t: t.get("landuse") in ("residential", "commercial", "industrial", "retail", "military",
                                        "railway", "construction", "brownfield", "port", "religious")),
    (5, lambda t: t.get("natural") == "heath"),
    (3, lambda t: t.get("natural") == "scrub"),
    (4, lambda t: t.get("natural") == "wood" or t.get("landuse") == "forest"),
    (2, lambda t: t.get("landuse") in ("grass", "meadow", "recreation_ground", "village_green", "cemetery")
        or t.get("leisure") in ("park", "garden") or t.get("natural") == "grassland"),
    (9, lambda t: t.get("amenity") == "parking"),
    (8, lambda t: t.get("leisure") in ("pitch", "stadium", "track")),
    (6, lambda t: t.get("natural") in ("bare_rock", "scree", "cliff", "rock")),
    (7, lambda t: t.get("natural") in ("beach", "sand")),
    (10, lambda t: t.get("aeroway") in ("runway", "taxiway", "apron")),
]


def srgb_to_linear(c):
    c = np.asarray(c, float)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


class Terrain:
    def __init__(self, data: osm.OsmData):
        self.osm = data
        self._load_dem()
        self.land, self.coast_lines = build_land_polygon(data, self.clip_box)
        self.land_prepared = shapely.prepared.prep(self.land)
        self.gibraltar = gibraltar_polygon(data)
        self._build_landcover()
        self._refine_fill()
        self._load_imagery()

    # ---- elevation ---------------------------------------------------------
    def _load_dem(self):
        src = rasterio.open(config.RAW / "dem" / "ign_mdt05_25830.tif")
        a = src.read(1).astype(np.float64)
        self.dem_transform = src.transform
        self.dem_inv = ~src.transform
        sea = a <= 0.0
        # Land newer than the LiDAR survey (reclamations, new quays) has no
        # height in the DTM. Fill each sea cell with the nearest land height so
        # coastline vertices take quay-top heights; remember what was filled.
        dist, (ri, ci) = ndimage.distance_transform_edt(sea, return_indices=True)
        filled = a[ri, ci]
        far = dist * 5.0 > 15.0
        filled[far] = 3.0          # documented default deck height for new land
        self.dem = np.where(sea, filled, a)
        self.dem_filled_mask = sea.astype(np.float64)   # 1 = no LiDAR measurement
        self.dem_far_mask = far.astype(np.float64)
        # Clip region: the fetch bbox in engine metres, shrunk so coastline
        # ways (fetched whole) always cross its edges.
        w, s, e, n = config.FETCH_BBOX_LONLAT
        x0, y0 = crs.lonlat_to_engine(w, s)
        x1, y1 = crs.lonlat_to_engine(e, n)
        self.clip_box = box(float(x0) + 50, float(y0) + 50, float(x1) - 50, float(y1) - 50)

    def _dem_rc(self, x, y):
        e, n = crs.engine_to_utm(x, y)
        col, row = self.dem_inv * (e, n)
        # raster values describe pixel centres: shift by half a pixel
        return np.asarray(row) - 0.5, np.asarray(col) - 0.5

    def dem_sample(self, x, y, grid=None):
        r, c = self._dem_rc(np.ravel(x), np.ravel(y))
        g = self.dem if grid is None else grid
        v = ndimage.map_coordinates(g, [r, c], order=1, mode="nearest")
        return v.reshape(np.shape(x))

    def lattice_heights(self, i0, j0, i1, j1):
        """Heights at lattice vertices i0..i1, j0..j1 inclusive -> array [j, i]."""
        ii, jj = np.meshgrid(np.arange(i0, i1 + 1), np.arange(j0, j1 + 1))
        return self.dem_sample(ii * CELL, jj * CELL)

    def surface(self, x, y):
        """Exact height of the triangulated terrain surface at (x, y)."""
        x = np.asarray(x, float); y = np.asarray(y, float)
        fi = x / CELL; fj = y / CELL
        i = np.floor(fi); j = np.floor(fj)
        fx = fi - i; fy = fj - j
        z00 = self.dem_sample(i * CELL, j * CELL)
        z10 = self.dem_sample((i + 1) * CELL, j * CELL)
        z01 = self.dem_sample(i * CELL, (j + 1) * CELL)
        z11 = self.dem_sample((i + 1) * CELL, (j + 1) * CELL)
        lower = fx >= fy
        za = z00 + fx * (z10 - z00) + fy * (z11 - z10)
        zb = z00 + fy * (z01 - z00) + fx * (z11 - z01)
        return np.where(lower, za, zb)

    def measured_fraction(self, x, y):
        """1.0 where the DEM has a LiDAR measurement, 0.0 where it was filled."""
        return 1.0 - self.dem_sample(x, y, self.dem_filled_mask)

    def _refine_fill(self):
        """Beaches newer than the DTM survey (sea cells in the DTM that OSM maps
        as beach or sand) are set to 1 m rather than the 3 m quay default."""
        rows, cols = np.nonzero(self.dem_filled_mask > 0)
        if not len(rows):
            return
        e, n = self.dem_transform * (cols + 0.5, rows + 0.5)
        x, y = crs.utm_to_engine(e, n)
        beach = self.landcover_at(x, y) == 7
        r, c = rows[beach], cols[beach]
        self.dem[r, c] = np.minimum(self.dem[r, c], BEACH_FILL_M)

    # ---- imagery -----------------------------------------------------------
    def _load_imagery(self):
        """Sentinel-2 true-colour image (10 m), if fetched. Used only for
        ground colour."""
        from pyproj import Transformer
        files = sorted((config.RAW / "imagery").glob("*_TCI.tif"))
        self.imagery = None
        if not files:
            return
        src = rasterio.open(files[-1])
        self.imagery = src.read().astype(np.float64) / 255.0       # sRGB, 0..1, shape (3, h, w)
        self.imagery_name = files[-1].name
        self.img_inv = ~src.transform
        self._eng_to_img = Transformer.from_crs(crs.ENGINE_CRS, src.crs, always_xy=True)

    def imagery_colour(self, x, y):
        """(linear RGB [N,3], usable[N]) from the satellite image."""
        e, n = self._eng_to_img.transform(np.ravel(x), np.ravel(y))
        col, row = self.img_inv * (e, n)
        rgb = np.stack([ndimage.map_coordinates(self.imagery[k], [np.asarray(row) - 0.5, np.asarray(col) - 0.5],
                                                order=1, mode="nearest") for k in range(3)], -1)
        # Pixels that mix in sea (shoreline, harbour edges) are dark and blue-dominant.
        water = (rgb[:, 2] > rgb[:, 0]) & (rgb[:, 2] >= rgb[:, 1] * 0.95) & (rgb.mean(1) < 0.32)
        return srgb_to_linear(np.clip(rgb, 0, 1)), ~water

    # ---- land cover --------------------------------------------------------
    def _build_landcover(self):
        x0, y0, x1, y1 = self.clip_box.bounds
        self.lc_res = 2.5
        self.lc_x0 = np.floor(x0); self.lc_y1 = np.ceil(y1)
        w = int(np.ceil((x1 - self.lc_x0) / self.lc_res)); h = int(np.ceil((self.lc_y1 - y0) / self.lc_res))
        self.lc_transform = from_origin(self.lc_x0, self.lc_y1, self.lc_res, self.lc_res)
        grid = np.zeros((h, w), np.uint8)
        for cls, pred in LANDCOVER_RULES:
            shapes = [(p, cls) for _, _, p in osm.iter_areas(self.osm, pred)]
            if shapes:
                rfeatures.rasterize(shapes, out=grid, transform=self.lc_transform)
        self.landcover = grid
        # Where buildings are close together the 10 m satellite pixels mix
        # roof colours into the ground, so the image isn't used within 4 m
        # of a building footprint.
        near = np.zeros_like(grid)
        bshapes = [(p.buffer(4.0), 1) for _, _, p in osm.iter_areas(self.osm, lambda t: "building" in t)]
        if bshapes:
            rfeatures.rasterize(bshapes, out=near, transform=self.lc_transform)
        self.near_building = near

    def landcover_at(self, x, y, grid=None):
        g = self.landcover if grid is None else grid
        col = ((np.asarray(x) - self.lc_x0) / self.lc_res).astype(int)
        row = ((self.lc_y1 - np.asarray(y)) / self.lc_res).astype(int)
        h, w = g.shape
        ok = (row >= 0) & (row < h) & (col >= 0) & (col < w)
        out = np.zeros(np.shape(x), np.uint8)
        out[ok] = g[row[ok], col[ok]]
        return out

    def colours(self, x, y, z, nz):
        """Vertex colours (linear RGB): the Sentinel-2 true-colour image where
        it shows land; otherwise land cover, with slope-based rock where
        nothing is mapped."""
        cls = self.landcover_at(x, y)
        steep = nz < np.cos(np.radians(40))
        upper = z > 60
        cls = np.where((cls == 0) & steep, 6, cls)
        near = self.landcover_at(x, y, self.near_building) > 0
        cls = np.where((cls == 0) & near, 1, cls)       # between buildings: paved
        cls = np.where((cls == 0) & upper, 3, cls)      # Upper Rock: maquis scrub
        table = np.array([LANDCOVER[k][1] for k in sorted(LANDCOVER)])
        out = srgb_to_linear(table[cls])
        if self.imagery is not None:
            img, ok = self.imagery_colour(x, y)
            # Built-up ground keeps the paved palette (see near_building).
            ok &= ~np.isin(cls, (1, 9, 10)) & ~near
            out[ok] = img[ok]
        return out

    # ---- tile mesh ---------------------------------------------------------
    def tile_mesh(self, ix, iy):
        """Return (positions[N,3] world metres, normals, colours, indices) for
        the land part of tile (ix, iy), plus coastline skirts, or None."""
        ts = config.TILE_SIZE
        tx0, ty0 = ix * ts, iy * ts
        tbox = box(tx0, ty0, tx0 + ts, ty0 + ts)
        land = self.land.intersection(tbox)
        if land.is_empty or land.area < 1.0:
            return None
        n = int(round(ts / CELL))
        i0, j0 = int(round(tx0 / CELL)), int(round(ty0 / CELL))
        H = self.lattice_heights(i0 - 1, j0 - 1, i0 + n + 1, j0 + n + 1)   # 1-cell border
        Z = H[1:-1, 1:-1]                                                    # (n+1, n+1)
        # Normals from central differences on the global lattice (seam-safe).
        dzdx = (H[1:-1, 2:] - H[1:-1, :-2]) / (2 * CELL)
        dzdy = (H[2:, 1:-1] - H[:-2, 1:-1]) / (2 * CELL)
        nrm = np.stack([-dzdx, -dzdy, np.ones_like(dzdx)], -1)
        nrm /= np.linalg.norm(nrm, axis=-1, keepdims=True)

        gx = tx0 + np.arange(n + 1) * CELL
        gy = ty0 + np.arange(n + 1) * CELL
        # Classify cells against the land polygon.
        cx0, cy0 = np.meshgrid(gx[:-1], gy[:-1])
        cells = shapely.box(cx0.ravel(), cy0.ravel(), cx0.ravel() + CELL, cy0.ravel() + CELL)
        shapely.prepare(land)
        inside = shapely.contains_properly(land, cells)
        touching = shapely.intersects(land, cells) & ~inside

        positions = [np.stack([*np.meshgrid(gx, gy), Z], -1).reshape(-1, 3)]
        normals = [nrm.reshape(-1, 3)]
        idx = []
        jj, ii = np.divmod(np.nonzero(inside)[0], n)
        v00 = jj * (n + 1) + ii
        v10 = v00 + 1
        v01 = v00 + (n + 1)
        v11 = v01 + 1
        idx.append(np.stack([v00, v10, v11], -1))
        idx.append(np.stack([v00, v11, v01], -1))
        base = (n + 1) * (n + 1)

        # Cells cut by the coastline: clip each of the cell's two triangles
        # against the land and triangulate the pieces (exact coastline).
        extra_p, extra_i = [], []
        for k in np.nonzero(touching)[0]:
            j, i = divmod(int(k), n)
            x0, y0 = gx[i], gy[j]
            for tri in (Polygon([(x0, y0), (x0 + CELL, y0), (x0 + CELL, y0 + CELL)]),
                        Polygon([(x0, y0), (x0 + CELL, y0 + CELL), (x0, y0 + CELL)])):
                piece = land.intersection(tri)
                for poly in _polys(piece):
                    pts, tris = _triangulate(poly)
                    if len(tris):
                        extra_i.append(tris + base + sum(len(p) for p in extra_p))
                        extra_p.append(pts)
        if extra_p:
            P = np.concatenate(extra_p)
            z = self.surface(P[:, 0], P[:, 1])
            positions.append(np.column_stack([P, z]))
            # normal of the cell triangle the point lies in (same as lattice)
            normals.append(self._surface_normals(P[:, 0], P[:, 1]))
            idx.extend(extra_i)
        pos = np.concatenate(positions)
        nor = np.concatenate(normals)
        ind = np.concatenate(idx).astype(np.uint32) if idx else np.zeros((0, 3), np.uint32)
        # Drop unused lattice vertices (sea) to keep files small.
        used = np.zeros(len(pos), bool); used[ind.ravel()] = True
        remap = -np.ones(len(pos), np.int64); remap[used] = np.arange(used.sum())
        pos, nor, ind = pos[used], nor[used], remap[ind].astype(np.uint32)
        col = self.colours(pos[:, 0], pos[:, 1], pos[:, 2], nor[:, 2])
        terrain = (pos, nor, col, ind)
        skirts = self._skirts(tbox)
        return terrain, skirts

    def _surface_normals(self, x, y):
        e = 0.5
        dzdx = (self.surface(x + e, y) - self.surface(x - e, y)) / (2 * e)
        dzdy = (self.surface(x, y + e) - self.surface(x, y - e)) / (2 * e)
        n = np.column_stack([-dzdx, -dzdy, np.ones_like(dzdx)])
        return n / np.linalg.norm(n, axis=1, keepdims=True)

    def _skirts(self, tbox):
        """Vertical faces from the coastline down below sea level, so quays,
        sea walls and cliffs have no gap above the water."""
        edge = self.land.boundary.intersection(tbox)
        pos, nor, ind = [], [], []
        for line in _lines(edge):
            c = np.asarray(line.coords)[:, :2]
            c = _densify(c, CELL)
            if len(c) < 2:
                continue
            z = self.surface(c[:, 0], c[:, 1])
            for a in range(len(c) - 1):
                p0, p1 = c[a], c[a + 1]
                d = p1 - p0
                L = np.hypot(*d)
                if L < 1e-3:
                    continue
                # Land is on the polygon's left for exterior rings (CCW), so the
                # outward (sea-facing) normal is to the right of travel.
                out = np.array([d[1], -d[0]]) / L
                if not self.land_prepared.contains(Point(*(0.5 * (p0 + p1) - 0.5 * out))):
                    out = -out
                top0, top1 = z[a], z[a + 1]
                bot = config.SKIRT_DEPTH
                b = len(pos)
                pos += [(p0[0], p0[1], top0), (p1[0], p1[1], top1), (p1[0], p1[1], bot), (p0[0], p0[1], bot)]
                nor += [(out[0], out[1], 0.0)] * 4
                # winding chosen so the face points along `out`
                if np.cross(np.append(d, 0), [0, 0, 1])[:2] @ out > 0:
                    ind += [(b, b + 2, b + 1), (b, b + 3, b + 2)]
                else:
                    ind += [(b, b + 1, b + 2), (b, b + 2, b + 3)]
        if not pos:
            return None
        pos = np.array(pos, float); nor = np.array(nor, float)
        col = np.tile(srgb_to_linear((0.70, 0.67, 0.60)), (len(pos), 1))
        return pos, nor, col, np.array(ind, np.uint32)


# ---- land polygon ------------------------------------------------------------

def build_land_polygon(d, clip_box):
    """Land = the side of the OSM coastline to the left of its direction,
    within the clip box. Closed coastline ways (islands, detached moles) are
    added whole."""
    lines, islands = [], []
    for w in d.ways.values():
        if w.tags.get("natural") != "coastline":
            continue
        ln = d.way_line(w)
        if ln is None:
            continue
        if w.nodes[0] == w.nodes[-1]:
            islands.append(Polygon(ln.coords))
        else:
            lines.append(ln)
    merged = linemerge(lines)
    merged_lines = list(getattr(merged, "geoms", [merged]))
    clipped = [g for ln in merged_lines for g in _lines(ln.intersection(clip_box))]
    pieces = list(polygonize(unary_union([clip_box.exterior] + clipped)))
    # Sample points just left (land) and right (sea) of each coastline segment.
    left_pts, right_pts = [], []
    for ln in clipped:
        c = np.asarray(ln.coords)
        for a in range(len(c) - 1):
            d_ = c[a + 1] - c[a]
            L = np.hypot(*d_)
            if L < 0.5:
                continue
            m = 0.5 * (c[a] + c[a + 1]); left = np.array([-d_[1], d_[0]]) / L
            left_pts.append(m + 0.2 * left); right_pts.append(m - 0.2 * left)
    tree = shapely.STRtree(pieces)
    votes = np.zeros(len(pieces))
    for pts, v in ((left_pts, 1), (right_pts, -1)):
        if pts:
            ii, jj = tree.query(shapely.points(np.array(pts)), predicate="within")
            np.add.at(votes, jj, v)
    land_parts = [p for p, v in zip(pieces, votes) if v > 0]
    land_parts += [p.intersection(clip_box) for p in islands]
    land = unary_union(land_parts)
    land = shapely.make_valid(land).buffer(0)
    return land, clipped


def gibraltar_polygon(d):
    r = d.relations.get(config.GIBRALTAR_RELATION)
    if r is None:
        return None
    return d.relation_polygon(r)


# ---- small geometry helpers --------------------------------------------------

def _polys(g):
    """All non-degenerate polygons inside any geometry (recursing into collections)."""
    if g is None or g.is_empty:
        return []
    if g.geom_type == "Polygon":
        return [g] if g.area > 1e-6 else []
    out = []
    for p in getattr(g, "geoms", []):
        out += _polys(p)
    return out


def _lines(g):
    if g.is_empty:
        return []
    if g.geom_type == "LineString":
        return [g]
    if g.geom_type == "LinearRing":
        return [LineString(g.coords)]
    out = []
    for p in getattr(g, "geoms", []):
        out += _lines(p)
    return out


def _densify(c, step):
    out = [c[0]]
    for a in range(len(c) - 1):
        L = np.hypot(*(c[a + 1] - c[a]))
        k = max(1, int(np.ceil(L / step)))
        for t in range(1, k + 1):
            out.append(c[a] + (c[a + 1] - c[a]) * t / k)
    return np.array(out)


def _triangulate(poly):
    """Earcut a polygon with holes -> (points[N,2], triangles[M,3])."""
    import mapbox_earcut as earcut
    if poly.geom_type != "Polygon":
        parts = [_triangulate(p) for p in _polys(poly)]
        pts, tris, n = [], [], 0
        for p, t in parts:
            pts.append(p); tris.append(t + n); n += len(p)
        if not pts:
            return np.zeros((0, 2)), np.zeros((0, 3), np.int64)
        return np.concatenate(pts), np.concatenate(tris)
    rings = [np.asarray(poly.exterior.coords)[:-1]] + [np.asarray(r.coords)[:-1] for r in poly.interiors]
    rings = [r for r in rings if len(r) >= 3]
    if not rings:
        return np.zeros((0, 2)), np.zeros((0, 3), np.int64)
    pts = np.concatenate(rings)
    ends = np.cumsum([len(r) for r in rings]).astype(np.uint32)
    tri = earcut.triangulate_float64(pts, ends).reshape(-1, 3).astype(np.int64)
    # Make every triangle counter-clockwise seen from above (+z normal).
    a, b, c = pts[tri[:, 0]], pts[tri[:, 1]], pts[tri[:, 2]]
    area2 = (b[:, 0] - a[:, 0]) * (c[:, 1] - a[:, 1]) - (b[:, 1] - a[:, 1]) * (c[:, 0] - a[:, 0])
    tri[area2 < 0] = tri[area2 < 0][:, [0, 2, 1]]
    return pts, tri
