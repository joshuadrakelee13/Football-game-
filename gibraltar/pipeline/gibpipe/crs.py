"""Coordinate transforms between WGS 84, EPSG:25830 and the engine CRS (GIB-LTM)."""
import math

import numpy as np
from pyproj import CRS, Transformer

from . import config

ENGINE_CRS = CRS.from_proj4(config.ENGINE_PROJ)

_ll_to_eng = Transformer.from_crs(4326, ENGINE_CRS, always_xy=True)
_eng_to_ll = Transformer.from_crs(ENGINE_CRS, 4326, always_xy=True)
_eng_to_utm = Transformer.from_crs(ENGINE_CRS, config.INTERCHANGE_EPSG, always_xy=True)
_utm_to_eng = Transformer.from_crs(config.INTERCHANGE_EPSG, ENGINE_CRS, always_xy=True)


def lonlat_to_engine(lon, lat):
    return _ll_to_eng.transform(np.asarray(lon, float), np.asarray(lat, float))


def engine_to_lonlat(x, y):
    return _eng_to_ll.transform(np.asarray(x, float), np.asarray(y, float))


def engine_to_utm(x, y):
    return _eng_to_utm.transform(np.asarray(x, float), np.asarray(y, float))


def utm_to_engine(e, n):
    return _utm_to_eng.transform(np.asarray(e, float), np.asarray(n, float))


def tile_index(x, y):
    return int(math.floor(x / config.TILE_SIZE)), int(math.floor(y / config.TILE_SIZE))


def tile_id(ix, iy):
    ew = f"E{ix}" if ix >= 0 else f"W{-ix}"
    ns = f"N{iy}" if iy >= 0 else f"S{-iy}"
    return f"T_{ew}_{ns}"


def tile_origin(ix, iy):
    return ix * config.TILE_SIZE, iy * config.TILE_SIZE
