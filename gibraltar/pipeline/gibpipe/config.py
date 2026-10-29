"""Project-wide constants. See gibraltar/docs/COORDINATES.md before changing any."""
import os
from pathlib import Path

PIPELINE_VERSION = "0.1.0"

ROOT = Path(__file__).resolve().parents[2]          # gibraltar/
DATA = ROOT / "data"
RAW = DATA / "raw"
BUILD = Path(os.environ.get("GIB_BUILD_DIR", DATA / "build"))
AUDIO = DATA / "audio"
OVERRIDES = DATA / "overrides.json"

# Engine CRS: local Transverse Mercator centred on Gibraltar (true scale, true north).
ORIGIN_LON = -5.35
ORIGIN_LAT = 36.13
ENGINE_PROJ = (
    f"+proj=tmerc +lat_0={ORIGIN_LAT} +lon_0={ORIGIN_LON} +k=1 +x_0=0 +y_0=0 "
    "+ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs"
)
ENGINE_NAME = "GIB-LTM"
INTERCHANGE_EPSG = 25830          # ETRS89 / UTM 30N, used by GeoPortal and IGN
VERTICAL_DATUM = "orthometric height above mean sea level (IGN MDT05, Alicante/REDNAP datum)"

# Acquisition area (WGS 84). Covers all of Gibraltar's land, its harbour works,
# and a strip of La Línea north of the border for context.
FETCH_BBOX_LONLAT = (-5.3850, 36.1000, -5.3250, 36.1660)   # W, S, E, N
# OSM relation for the territory of Gibraltar (admin_level=2).
GIBRALTAR_RELATION = 1278736

TILE_SIZE = 500.0         # metres, GIB-LTM grid
TERRAIN_CELL = 5.0        # metres; matches the IGN MDT05 source resolution
SEA_LEVEL = 0.0
SKIRT_DEPTH = -4.0        # how far coastline skirts drop below sea level
PROJECT_MARGIN = 400.0    # sea margin around land when choosing tiles

USER_AGENT = "GibraltarWalkingSim-pipeline/0.1 (+https://github.com/joshuadrakelee13/Football-game-)"
