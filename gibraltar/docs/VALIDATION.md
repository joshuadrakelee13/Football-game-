# Validation report

Generated 2026-10-29T17:31:42Z by `python -m gibpipe.validate` from the build made at 2026-10-29T17:29:00Z. Regenerate it after every build; do not edit by hand.

| Status | Check | Value | Notes |
|---|---|---|---|
| pass | Projection round trip (lon/lat -> GIB-LTM -> lon/lat), max error | 2.8270250997094675e-06 mm | 22180 OSM nodes |
| pass | Engine distance vs WGS 84 geodesic distance, max relative error | 0.1415971965306144 ppm | 2000 random node pairs, 1993 longer than 100 m; ellipsoid-surface scale, heights ignored |
| pass | Gibraltar land area (OSM coastline within OSM territory boundary) | 6.591 km² | official planar area 6.55 km² (GeoPortal); difference +0.6% — reclamation since the official figure is a likely cause |
| pass | Terrain mesh area vs land polygon area (all built tiles) | -0.0 % | mesh 8.8334 km², land polygon 8.8334 km² |
| warn | Highest terrain point in build | 418.65 m | official summit 426.0 m; 5 m grid under-samples the knife-edge ridge |
| warn | Peak height: Rock of Gibraltar (osm:node/243843850) | -9.05 m (terrain max within 100 m − OSM ele) | OSM ele 426.0 m; terrain 416.95 m at 90.3 m from the OSM node (402.97 m at the node itself) |
| pass | Peak height: Signal Hill (osm:node/8910097389) | -0.28 m (terrain max within 100 m − OSM ele) | OSM ele 387.0 m; terrain 386.72 m at 95.1 m from the OSM node (380.79 m at the node itself) |
| info | Gibraltar land with a DTM measurement (not gap-filled) | 92.12 % | the rest is land newer than the DTM survey (reclamations, new quays): filled from nearest land height |
| info | Copernicus GLO-30 (30 m DSM) minus terrain, median absolute difference (Gibraltar land) | 3.04 m | p5 -35.8 m, p50 0.0 m, p95 8.3 m. Independent coarse cross-check only: the DSM includes buildings and trees, and its 30 m cells smear the cliffs (large negative values on the ridge) |
| pass | Terrain tile seams, max height mismatch between neighbours | 0.0 mm | 6918 shared edge vertices compared |
| pass | Road/path centreline points lying on rendered surfaces | 100.0 % | 51534 sample points every 5 m on land |
| info | Carriageway length in Gibraltar (OSM, excluding tunnels) | 115.2 km | official: 'more than 48 km' of roads (GeoPortal) |
| info | Tunnel ways recorded but not drawn on the surface | 171 ways | 8.6 km; official tunnel total ~52 km (mostly military, unmapped) |
| info | Road network: largest connected component share of nodes | 98.13 % | 39 components in source OSM network (incl. tunnels); topology copied 1:1 from OSM |
| pass | Building roofs: rendered footprint area vs source, max relative error | 0.224 % | 5585 buildings read back from buildings.glb |
| pass | Building roofs: centroid offset vs source, max | 0.7 mm | float32 storage relative to tile origin |
| pass | Footprint area in GIB-LTM vs ellipsoidal (geodesic) area, max relative error | 0.432 ppm | 400 footprints |
| info | Building heights by confidence | measured: 50, derived: 120, estimated: 5416 buildings | measured = OSM height tag; derived = OSM building:levels × 3 m; estimated = type default |
| pass | Mapped props (trees, street furniture) missing from the build | 0 items | 4742 OSM props inside the built tiles |
| pass | Window corners below the ground in front of them | 0 vertices | about 171412 procedural windows checked |
| pass | Layer files whose bounds disagree with manifest bounds_m | 0 files |  |

## Distances between landmarks

Engine distance is measured in the game's coordinate space; geodesic distance is measured on the WGS 84 ellipsoid between the same OSM positions. Agreement shows the world is at true scale. (It does not check OSM's own positional accuracy, which needs an independent survey source.)

| From | To | Engine (m) | Geodesic (m) | Difference (mm) |
|---|---|---|---|---|
| Grand Casemates Square | Grand Casemates Gates | 57.608 | 57.608 | +0.0 |
