# gibpipe: Gibraltar GIS pipeline

Turns open geographic data into engine-ready tiles. It runs on Windows, macOS
or Linux with Python 3.10+. Nothing here runs inside the game.

```
pip install -r requirements.txt
python -m gibpipe.fetch       # download sources -> data/raw (+ catalogue.json)
python -m gibpipe.build       # make tiles       -> data/build (about 40 s)
python -m gibpipe.validate    # measure the build -> data/build/validation.json, docs/VALIDATION.md
python -m gibpipe.audio       # synthesise ambient loops -> data/audio
```

Run the commands from this `pipeline` folder. `build` and `validate` only read
`data/raw`, so a rebuild is repeatable for the same downloads. Re-run `fetch
--refresh` to pick up newer OSM data (the extracts are updated daily).

## Stages

| Module | What it does |
|---|---|
| `config.py` | Origin, CRS, tile size, acquisition area. **Read `docs/COORDINATES.md` before changing anything.** |
| `crs.py` | WGS 84 ↔ GIB-LTM ↔ EPSG:25830 transforms (pyproj); tile ids. |
| `fetch.py` | Downloads the OSM daily extracts (Gibraltar + Cádiz for the Spanish side), IGN MDT05 (5 m DTM, WCS), a pinned cloud-free Sentinel-2 true-colour scene (cropped) and Copernicus GLO-30 (cross-check only). Records URL, time, size, SHA-256 and licence for every file. |
| `osm.py` | Reads the extracts, keeps whole ways touching the project area, assembles polygons and multipolygons in GIB-LTM metres. |
| `terrain.py` | DEM sampling; the land polygon from the OSM coastline (land is left of the coastline's direction); ground colour from the Sentinel-2 image (land-cover palette in built-up areas); per-tile terrain meshes clipped exactly to the coastline; vertical skirts at the shore. |
| `buildings.py` | Footprints → extruded masses, using measured, derived or estimated heights (recorded per building); `building:part` support; tagged roof shapes (gabled, hipped, pyramidal, skillion); wall and roof colours from colour and material tags; an optional LiDAR surface-model hook. |
| `roads.py` | Highways → surfaces at their mapped or default widths, coloured by OSM `surface`, merged by class and cut against the terrain triangles so they lie exactly on the ground; zebra crossings; bridge decks; tunnels listed. |
| `structures.py` | Walls, city walls, retaining walls, fences, hedges, jersey barriers and guard rails; piers and breakwaters; points of interest. |
| `facades.py` | Doors at mapped OSM entrances (else one procedural door on the wall facing the nearest street) and procedural windows on 3 m storeys; skips party walls. Output goes to its own `facades` layer. |
| `props.py` | Trees and street furniture (benches, bollards, post boxes, phone kiosks, lamps, cannons, memorials, bus stops, …) as generic models at their OSM positions. |
| `glb.py` | Dependency-free glTF 2.0 writer and reader (vertex welding, 8-bit vertex colours, `_FEATURE_ID`). |
| `build.py` | Orchestrates everything, in parallel by tile; writes `manifest.json` and per-tile `features.json`. |
| `validate.py` | Checks the build against its sources: projection error, scale, land area, seams, road coverage, footprint fidelity, peak heights, bounds. Fails the run if a hard check fails. |
| `audio.py` | Procedural ambient loops for Unreal (sea, wind, birds, crickets). |

## Updating with better data

* **More accurate OSM**: improve OpenStreetMap itself (heights,
  `building:levels`, widths), then `fetch --refresh` and `build`.
* **A surface model for building heights**: save it as
  `data/raw/dem/ign_mds_25830.tif` (EPSG:25830). `build` then uses it for every
  building without an OSM `height`, marked `lidar:ign_mds`/`measured`.
* **Official Gibraltar data** (only with written permission; see
  `docs/LICENSING.md`): keep it in a separate layer. Never merge it into the
  OSM-derived layers, or OSM's share-alike licence would apply to it.
* **Custom building models**: add an entry to `data/overrides.json`.

## Performance

On 4 CPU cores a full build takes about 2½ minutes and validation about a
minute. The output is 68 tiles: ~0.75 M terrain triangles, 0.15 M building,
0.36 M façade (174,000 windows, 2,400 doors), 0.42 M road, 0.34 M wall and
0.20 M prop triangles, about 108 MB uncompressed.
