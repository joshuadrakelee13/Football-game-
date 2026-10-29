"""Acquire source datasets and record them in data/raw/catalogue.json.

Only openly licensed, publicly accessible endpoints are used. Every download is
recorded with its URL, retrieval time, size, SHA-256 and licence so a build can
be traced back to exactly the data it was made from.

    python -m gibpipe.fetch            # fetch everything that is missing
    python -m gibpipe.fetch --refresh  # re-download everything
"""
import argparse
import datetime as dt
import hashlib
import json
import time

import numpy as np
import requests

from . import config, crs

CATALOGUE = config.RAW / "catalogue.json"

SOURCES = {
    "osm": {
        "name": "OpenStreetMap",
        "publisher": "OpenStreetMap contributors",
        "licence": "ODbL 1.0",
        "licence_url": "https://www.openstreetmap.org/copyright",
        "attribution": "© OpenStreetMap contributors. Available under the Open Database License (ODbL). https://www.openstreetmap.org/copyright",
    },
    "ign_mdt05": {
        "name": "MDT05 Digital Terrain Model, 5 m (over Gibraltar: from aerial stereo-photogrammetry, per IGN metadata)",
        "publisher": "Instituto Geográfico Nacional (IGN), Spain",
        "licence": "CC BY 4.0",
        "licence_url": "https://www.scne.es/",
        "attribution": "Obra derivada de MDT05-cob1 2008-2015 CC-BY 4.0 scne.es (Instituto Geográfico Nacional, resampled to the GIB-LTM grid)",
    },
    "copernicus_glo30": {
        "name": "Copernicus DEM GLO-30 (30 m DSM)",
        "publisher": "European Space Agency / Airbus",
        "licence": "Copernicus DEM licence (free, attribution required)",
        "licence_url": "https://spacedata.copernicus.eu/collections/copernicus-digital-elevation-model",
        "attribution": "Produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved",
    },
}


def _now():
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _load_catalogue():
    if CATALOGUE.exists():
        return json.loads(CATALOGUE.read_text())
    return {"files": {}}


def _record(cat, rel_path, source, url, extra=None):
    path = config.RAW / rel_path
    data = path.read_bytes()
    entry = {
        "source": source,
        **SOURCES[source],
        "url": url,
        "retrieved_utc": _now(),
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
    }
    if extra:
        entry.update(extra)
    cat["files"][rel_path] = entry
    CATALOGUE.write_text(json.dumps(cat, indent=2, ensure_ascii=False))


def _get(url, **kw):
    for attempt in range(5):
        try:
            r = requests.get(url, headers={"User-Agent": config.USER_AGENT}, timeout=180, **kw)
            if r.status_code == 200:
                return r
            if r.status_code in (400, 403, 404, 509):
                r.raise_for_status()
        except requests.RequestException as e:
            if attempt == 4:
                raise
            print(f"  retry {attempt + 1}: {e}")
        time.sleep(2 ** (attempt + 1))
    r.raise_for_status()
    return r


OSM_EXTRACTS = {
    # Daily extracts from openstreetmap.fr. The OSM editing API must not be
    # used for read-only projects (OSMF API usage policy), so we use these.
    "osm/gibraltar.osm.pbf": "https://download.openstreetmap.fr/extracts/europe/gibraltar.osm.pbf",
    # Spanish side of the border (La Línea) and the continuation of the coastline.
    "osm/cadiz.osm.pbf": "https://download.openstreetmap.fr/extracts/europe/spain/andalucia/cadiz.osm.pbf",
}


def fetch_osm(cat, refresh=False):
    (config.RAW / "osm").mkdir(parents=True, exist_ok=True)
    for rel, url in OSM_EXTRACTS.items():
        if (config.RAW / rel).exists() and not refresh:
            continue
        print("OSM", url)
        r = _get(url)
        (config.RAW / rel).write_bytes(r.content)
        _record(cat, rel, "osm", url, {"extract_last_modified": r.headers.get("Last-Modified"),
                                       "provider": "openstreetmap.fr daily extracts"})


def _utm_bbox(margin=200.0):
    w, s, e, n = config.FETCH_BBOX_LONLAT
    lon = np.array([w, e, e, w]); lat = np.array([s, s, n, n])
    x, y = crs.lonlat_to_engine(lon, lat)
    ex, ny = crs.engine_to_utm(x, y)
    return (np.floor((ex.min() - margin) / 5) * 5, np.floor((ny.min() - margin) / 5) * 5,
            np.ceil((ex.max() + margin) / 5) * 5, np.ceil((ny.max() + margin) / 5) * 5)


def fetch_ign(cat, refresh=False):
    rel = "dem/ign_mdt05_25830.tif"
    if (config.RAW / rel).exists() and not refresh:
        return
    (config.RAW / "dem").mkdir(parents=True, exist_ok=True)
    x0, y0, x1, y1 = _utm_bbox()
    url = ("https://servicios.idee.es/wcs-inspire/mdt?SERVICE=WCS&REQUEST=GetCoverage&VERSION=2.0.1"
           f"&COVERAGEID=Elevacion25830_5&SUBSET=x({x0:.0f},{x1:.0f})&SUBSET=y({y0:.0f},{y1:.0f})"
           "&FORMAT=image/tiff")
    print("IGN", url)
    (config.RAW / rel).write_bytes(_get(url).content)
    _record(cat, rel, "ign_mdt05", url, {"crs": "EPSG:25830", "resolution_m": 5.0,
                                          "bbox_25830": [x0, y0, x1, y1]})


def fetch_copernicus(cat, refresh=False):
    rel = "dem/copernicus_glo30_N36_W006.tif"
    if (config.RAW / rel).exists() and not refresh:
        return
    (config.RAW / "dem").mkdir(parents=True, exist_ok=True)
    url = ("https://copernicus-dem-30m.s3.eu-central-1.amazonaws.com/"
           "Copernicus_DSM_COG_10_N36_00_W006_00_DEM/Copernicus_DSM_COG_10_N36_00_W006_00_DEM.tif")
    print("Copernicus", url)
    (config.RAW / rel).write_bytes(_get(url).content)
    _record(cat, rel, "copernicus_glo30", url, {"crs": "EPSG:4326", "resolution_deg": 1 / 3600,
                                                 "note": "DSM (includes buildings and trees); used only for cross-checking"})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true")
    args = ap.parse_args()
    config.RAW.mkdir(parents=True, exist_ok=True)
    cat = _load_catalogue()
    fetch_ign(cat, args.refresh)
    fetch_copernicus(cat, args.refresh)
    fetch_osm(cat, args.refresh)
    print(f"catalogue: {len(cat['files'])} files -> {CATALOGUE}")


if __name__ == "__main__":
    main()
