# Build output format (pipeline → engines)

The GIS pipeline (`gibraltar/pipeline`) writes everything the engines need to
`gibraltar/data/build/`. The Unreal import script and the web viewer both read
only these files. They never read raw source data.

Axes, units, tiles and identifiers are defined in `COORDINATES.md`.

```
data/build/
  manifest.json                 world description and tile index
  tiles/<tile_id>/terrain.glb   ground surface, clipped to the coastline
  tiles/<tile_id>/roads.glb     roads, paths, steps (draped on terrain)
  tiles/<tile_id>/buildings.glb building masses
  tiles/<tile_id>/walls.glb     walls, fortifications, fences, hedges, barriers, piers
  tiles/<tile_id>/props.glb     trees and street furniture at their OSM positions
  tiles/<tile_id>/facades.glb   doors and windows (cosmetic: no collision)
  tiles/<tile_id>/features.json per-feature records for that tile
  catalogue.json                every source dataset: licence, hash, date
data/overrides.json             hand-made replacements for specific buildings
```

A layer file is only written if the tile has geometry for that layer.

## manifest.json

```jsonc
{
  "schema": 1,
  "pipeline_version": "0.1.0",
  "generated_utc": "2026-10-29T12:00:00Z",
  "crs": {
    "engine_proj": "+proj=tmerc +lat_0=36.13 +lon_0=-5.35 ...",
    "engine_name": "GIB-LTM",
    "interchange": "EPSG:25830",
    "origin_lonlat": [-5.35, 36.13],
    "vertical": "orthometric height above mean sea level (IGN MDT05, Alicante datum)"
  },
  "tile_size_m": 500,
  "sea_level_m": 0.0,
  "project_bounds_m": [xmin, ymin, xmax, ymax],   // GIB-LTM metres
  "land_bounds_m": [xmin, ymin, xmax, ymax],
  "spawn": { "name": "Casemates Square", "position_m": [x, y, z], "heading_deg": 0 },
  "pois": [
    { "id": "osm:node/123", "name": "Moorish Castle", "kind": "historic=castle",
      "position_m": [x, y, z], "description": "…", "source": "OpenStreetMap" }
  ],
  "attribution": ["© OpenStreetMap contributors (ODbL)", "…"],
  "tiles": [
    {
      "id": "T_E0_N0", "ix": 0, "iy": 0,
      "origin_m": [0, 0, 0],                       // tile SW corner, GIB-LTM
      "layers": {
        "terrain":   { "file": "tiles/T_E0_N0/terrain.glb",
                       "bounds_m": [[minx, miny, minz], [maxx, maxy, maxz]],
                       "triangles": 12345 },
        "roads":     { … }, "buildings": { … }, "walls": { … }, "props": { … }, "facades": { … }
      },
      "features": "tiles/T_E0_N0/features.json",
      "counts": { "buildings": 120, "roads": 40, "walls": 30, "piers": 2, "props": 85 }
    }
  ]
}
```

`bounds_m` is **tile-local** and uses **GIB-LTM axes** (x east, y north,
z up). The Unreal bounds of the imported mesh, before the actor is placed,
should therefore be
`min = (minx*100, -maxy*100, minz*100)` and `max = (maxx*100, -miny*100, maxz*100)`.
The import script checks this to within 1 cm.

## glTF layer files

* Binary glTF 2.0 (`.glb`), metres, glTF axes `(East, Up, South)`, positions
  relative to the tile origin.
* One node per layer, one mesh, one primitive per material.
* Every primitive has `POSITION`, `NORMAL` and `COLOR_0` (normalised 8-bit
  RGBA vertex colour, linear). Vertex colour carries the ground colour
  (sampled from a Sentinel-2 true-colour image, or the land-cover palette
  where the image shows water), road surface, building colour and so on, so a
  single vertex-colour master material is enough to start with.
* Material names (the engine maps these to its own materials):

| Material | Used for |
|---|---|
| `M_Terrain` | ground; colour from the Sentinel-2 image (fallback: land cover) |
| `M_Cliff` | vertical skirts where land meets the sea |
| `M_Road` | carriageways (colour by OSM `surface`); zebra-crossing stripes (white) |
| `M_Path` | footways, pedestrian streets, tracks, paths (colour by `surface`); pier and breakwater decks |
| `M_Steps` | `highway=steps` |
| `M_BuildingWall` | building façades |
| `M_BuildingRoof` | building roofs |
| `M_Wall` | walls, city walls, retaining walls, fences, jersey barriers, guard rails |
| `M_Prop` | street furniture: benches, bollards, post boxes, phone kiosks, lamps, cannons, memorials, bus stops, tree trunks |
| `M_Foliage` | tree crowns (props.glb) and hedges (walls.glb) |
| `M_Window` | window glass, 5 cm in front of the façade (facades.glb) |
| `M_Door` | door panels and frames (facades.glb) |

* Every primitive also carries a custom attribute `_FEATURE_ID` (float,
  exact integer) indexing the matching array in `features.json`
  (`buildings` for buildings.glb and facades.glb, `walls` for walls.glb,
  `props` for props.glb); `-1` means none (roads, terrain). Engines that don't
  understand it ignore it.

## features.json

Coordinates here are **world GIB-LTM metres** (not tile-local).

```jsonc
{
  "tile": "T_E0_N0",
  "buildings": [
    {
      "id": "osm:way/123456", "osm_version": 7,
      "name": "…", "building": "apartments",
      "centroid_m": [x, y], "footprint_area_m2": 412.5,
      "ground_min_m": 31.2, "ground_max_m": 36.9,
      "height_m": 21.0,
      "height_source": "osm:height | osm:building:levels | default:apartments",
      "confidence": "measured | derived | estimated",
      "levels": 7, "roof_shape": "gabled",
      "roof": { "shape": "gabled", "eave_m": 52.2, "ridge_m": 55.1,
                "source": "osm:roof:height | default:pitch 30°" },
      "wall_colour_source": "osm:building:colour | osm:building:material | default",
      "roof_colour_source": "osm:roof:colour | osm:roof:material | default",
      "facade": {
        "doors_mapped": 1, "doors_procedural": 0, "windows": 42,
        "windows_source": "procedural v1: … | none",
        "doors": [ { "position_m": [x, y], "width_m": 1.6,
                     "source": "osm:node/123 entrance=main | procedural: wall nearest a street" } ]
      },
      "override": null          // or the entry from overrides.json
    }
  ],
  "roads":  [ { "id": "osm:way/…", "name": "Main Street", "highway": "pedestrian",
                "width_m": 6.0, "width_source": "osm:width | default:pedestrian",
                "length_m": 84.2, "tunnel": false, "bridge": false, "layer": 0 } ],
  "walls":  [ { "id": "osm:way/…", "kind": "historic=city_walls", "height_m": 6,
                "height_source": "default:city_walls" } ],
  "props":  [ { "id": "osm:node/…", "kind": "tree | bench | bollard | post_box | telephone | street_lamp | cannon | …",
                "name": null, "position_m": [x, y, z], "model": "generic",
                "height_m": 7.0, "height_source": "osm:height | default:tree",
                "direction_deg": 270.0,          // only when OSM tags a direction
                "orientation_source": "osm:direction | default:east",
                "source": "osm" } ],
  "tunnels": [ { "id": "osm:way/…", "name": "…", "highway": "…", "length_m": 0 } ]
}
```

### Confidence levels

| Value | Meaning |
|---|---|
| `measured` | Taken directly from a source measurement (an OSM `height=` tag, or a LiDAR sample). |
| `derived` | Calculated from a measured attribute by a documented rule (e.g. `building:levels × 3.0 m + roof`). |
| `estimated` | No measurement exists; a documented default for that feature class. Shown in a distinct colour in the viewer's "data confidence" mode. |

## overrides.json

```jsonc
{
  "osm:way/123456": {
    "unreal_asset": "/Game/Gibraltar/Custom/SM_MoorishCastle",
    "web_asset": "custom/moorish_castle.glb",
    "note": "Hand-modelled from survey drawings, 2026-11"
  }
}
```

The pipeline leaves overridden buildings out of the merged `buildings.glb`
and copies the override entry into the building's `override` field. The engine
places the custom asset at `centroid_m` / `ground_min_m`.
