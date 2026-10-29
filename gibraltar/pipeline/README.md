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
| `fetch.py` | Downloads the OSM daily extracts (Gibraltar + Cádiz for the Spanish side), IGN MDT05 (5 m DTM, WCS) and Copernicus GLO-30 (cross-check only). Records URL, time, size, SHA-256 and licence for every file. |
| `osm.py` | Reads the extracts, keeps whole ways touching the project area, assembles polygons and multipolygons in GIB-LTM metres. |
| `terrain.py` | DEM sampling; the land polygon from the OSM coastline (land is left of the coastline's direction); land cover; per-tile terrain meshes clipped exactly to the coastline; vertical skirts at the shore. |
| `buildings.py` | Footprints → extruded masses, using measured, derived or estimated heights (recorded per building); `building:part` support; an optional LiDAR surface-model hook. |
| `roads.py` | Highways → surfaces at their mapped or default widths, merged by class and cut against the terrain triangles so they lie exactly on the ground; bridge decks; tunnels listed. |
| `structures.py` | Walls, city walls and retaining walls; piers and breakwaters; trees; points of interest. |
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

On 4 CPU cores a full build takes about 40 s and validation about 45 s. The
output is 68 tiles: ~0.75 M terrain triangles, 0.14 M building, 0.39 M road
and 0.22 M wall triangles, 62 MB uncompressed.
