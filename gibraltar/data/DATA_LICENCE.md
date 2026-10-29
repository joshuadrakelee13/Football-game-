# Licence of the data in this folder

`build/` and `overrides.json` contain a **derived database** made from
OpenStreetMap data (buildings, roads, walls, points of interest, coastline),
combined with terrain heights from the Instituto Geográfico Nacional (IGN).

* The OpenStreetMap-derived parts are © OpenStreetMap contributors and are
  made available under the **Open Database License (ODbL) 1.0**:
  https://opendatacommons.org/licenses/odbl/1-0/ . You may copy, distribute
  and adapt them as long as you credit OpenStreetMap and its contributors and
  share any adapted database under the same licence.
* Terrain heights: "Obra derivada de MDT05-cob1 2008-2015 CC-BY 4.0 scne.es"
  (Instituto Geográfico Nacional, Spain), licensed under CC BY 4.0
  (https://creativecommons.org/licenses/by/4.0/). Changes: reprojected from
  EPSG:25830 to the GIB-LTM grid, bilinearly resampled onto a 5 m lattice,
  sea cells filled from the nearest land height, and clipped to the
  OpenStreetMap coastline.
* `audio/` contains sounds synthesised by `pipeline/gibpipe/audio.py`; they
  carry no third-party rights.

The pipeline that produced this data is in `../pipeline/` and can regenerate
it from the sources listed in `build/catalogue.json`.
