# Coordinate systems, origin and units

Every component of the project (GIS pipeline, Unreal Engine project, web
validation viewer, validation scripts) uses the conventions on this page. If
you change anything here, every component has to change with it.

## 1. Coordinate reference systems

| Role | CRS | Why |
|---|---|---|
| Source / interchange | **EPSG:25830** (ETRS89 / UTM zone 30N) | The CRS used by the Government of Gibraltar GeoPortal (its 3D OLS viewer is `index25830.html`) and by Spain's IGN 5 m terrain model. Official data drops in without a datum shift. |
| Geographic | **EPSG:4326** (WGS 84 lon/lat) | OpenStreetMap and Copernicus. Never used as flat metres. |
| **Engine (game world)** | **GIB-LTM**, a local Transverse Mercator (below) | True scale and true north across the whole territory. |

GIB-LTM PROJ definition:

```
+proj=tmerc +lat_0=36.13 +lon_0=-5.35 +k=1 +x_0=0 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs
```

### Why not use UTM directly in the engine?

Gibraltar sits 2.35° west of UTM zone 30's central meridian. Measured with
`pyproj.Proj.get_factors` at latitude 36.13°:

| | UTM 30N (EPSG:25830) | GIB-LTM |
|---|---|---|
| Scale factor at lon −5.37 / −5.35 / −5.33 | 1.000160 / 1.000151 / 1.000142 | 1.00000004 / 1.00000000 / 1.00000004 |
| Length error over the Rock (~5 km) | **+0.76 m** | < 0.2 mm |
| Grid north vs true north | 1.39° | 0° at the central meridian |

GIB-LTM has the same ellipsoid (GRS80) and datum (ETRS89, treated as WGS 84 at
the sub-metre level) as EPSG:25830, so the transform between them is a pure
map-projection change: no datum shift, no loss of accuracy.

## 2. Origin

The engine origin `(0, 0, 0)` is **longitude −5.35°, latitude 36.13°, height
0 m** (mean sea level). That point is on the western slopes of the Upper Rock,
near the middle of the territory, so every point in Gibraltar is within about
±3 km east/west and ±4 km north/south of it. In EPSG:25830 the origin is
E 288530.022, N 4000925.373.

Because all coordinates stay within ±5 km, 32-bit floats keep sub-millimetre
precision everywhere (Unreal's large-world coordinates are not needed, but are
harmless).

## 3. Axes and units

The pipeline works in GIB-LTM metres: `x` = east, `y` = north, `z` = height
above mean sea level.

| Space | X | Y | Z | Units |
|---|---|---|---|---|
| GIB-LTM (pipeline, JSON) | East | North | Up | metres |
| glTF files (`.glb`) | East | Up | **South** (= −North) | metres |
| Unreal Engine | East | **South** (= −North) | Up | **centimetres** |
| three.js web viewer | East | Up | South | metres (same as glTF) |

Conversions:

```
glTF   (gx, gy, gz) = ( x,  z, -y)
Unreal (ux, uy, uz) = ( x*100, -y*100, z*100)
```

Unreal is left-handed with Z up; glTF and three.js are right-handed with Y
up. Unreal's glTF importer swaps glTF Y and Z, which maps glTF `(E, Up, S)`
onto Unreal `(E, S, Up)` and converts metres to centimetres. The Unreal import
script verifies this after import by comparing each mesh's bounds against
`bounds_m` in the manifest, and fails loudly if they disagree.

This matches Unreal's GeoReferencing plugin "flat planet" convention (+X east,
+Y south, +Z up). The level's `AGeoReferencingSystem` actor is set to:

* Planet shape: Flat Planet
* Projected CRS: the GIB-LTM PROJ string above
* Geographic CRS: `EPSG:4326`
* Origin at the projected CRS origin `(0, 0, 0)`

## 4. Heights

* Terrain heights come from IGN MDT05 (see `DATA_SOURCES.md`). Over Gibraltar,
  IGN's metadata says the model was made by aerial stereo-photogrammetry, not
  LiDAR. Its heights are orthometric. Spain's 2 m model states mean sea level
  at Alicante (EPSG:5782); the 5 m model's metadata doesn't say. The offset
  between Alicante and Gibraltar's own levelling datum is **unknown**; we
  expect decimetres, but that's unverified. It's listed in `DISCREPANCIES.md`
  until a local tie can be measured.
* `z = 0` is mean sea level. The sea surface is rendered at `z = 0`.
* X, Y and Z use the same unit. Nothing is exaggerated or independently
  scaled, ever.

## 5. Tiles

The world is cut into **500 m × 500 m** tiles aligned to the GIB-LTM grid.

* Tile `(ix, iy)` covers `ix*500 <= x < (ix+1)*500` and `iy*500 <= y < (iy+1)*500`.
* Tile id: `T_{E|W}{n}_{N|S}{m}`. For `ix >= 0` it's `E{ix}`, for `ix < 0`
  it's `W{-ix}`; likewise `N{iy}` / `S{-iy}`. Examples: `(0, 0)` → `T_E0_N0`,
  `(-1, 3)` → `T_W1_N3`, `(1, -5)` → `T_E1_S5`.
* All geometry in a tile's `.glb` files is stored **relative to the tile's
  south-west corner** `(ix*500, iy*500, 0)`. The engine places each tile
  actor at that corner (Unreal: `(ix*50000, -iy*50000, 0)` cm).
* Neighbouring tiles share identical edge vertices: terrain is sampled on a
  global grid, so there are no gaps or overlaps at tile seams. A validation
  check enforces this.
* Buildings are assigned to the tile containing their footprint centroid and
  are never cut, so a building may extend a few metres past its tile edge.
  Roads and terrain are clipped exactly at tile edges.

## 6. Identifiers

* Features from OpenStreetMap keep their OSM identity: `osm:way/123456`,
  `osm:relation/987`, `osm:node/42`. In asset and node names this becomes
  `osm_w123456`, `osm_r987`, `osm_n42`.
* Each feature record carries `source`, `source_version` (OSM version
  number), `confidence` and the measurements it was built from. See
  `MANIFEST.md`.
