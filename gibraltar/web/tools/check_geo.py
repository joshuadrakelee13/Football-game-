#!/usr/bin/env python3
"""Check web/js/geo.js (GIB-LTM inverse/forward Transverse Mercator) against pyproj.

Run from anywhere:  python3 gibraltar/web/tools/check_geo.py
Exits non-zero if any point differs by more than 1e-7 degrees / 1 mm.
"""
import json
import pathlib
import subprocess
import sys

from pyproj import Transformer

HERE = pathlib.Path(__file__).resolve().parent
MANIFEST = HERE.parent.parent / "data" / "build" / "manifest.json"

proj = json.loads(MANIFEST.read_text())["crs"]["engine_proj"]
inv = Transformer.from_crs(proj, "EPSG:4326", always_xy=True)

pts = [(0, 0), (-246.942, 1648.743), (464.461, -2257.96), (502.881, -158.716),
       (-2500, -2500), (1500, 4000), (-2500, 4000), (1500, -2500), (1234.5, -987.6),
       (-1566.57, 2776.84), (5000, 5000), (-5000, -5000)]

js = f"""
import {{ ltmToLonLat, lonLatToLtm }} from '{(HERE.parent / 'js' / 'geo.js').as_uri()}';
const pts = {json.dumps(pts)};
const out = pts.map(([x, y]) => {{ const ll = ltmToLonLat(x, y); return [ll, lonLatToLtm(ll[0], ll[1])]; }});
console.log(JSON.stringify(out));
"""
res = json.loads(subprocess.check_output(["node", "--input-type=module", "-e", js]))

worst_deg = worst_m = 0.0
for (x, y), (ll, back) in zip(pts, res):
    lon, lat = inv.transform(x, y)
    d = max(abs(lon - ll[0]), abs(lat - ll[1]))
    r = max(abs(back[0] - x), abs(back[1] - y))
    worst_deg, worst_m = max(worst_deg, d), max(worst_m, r)
    print(f"x={x:9.3f} y={y:9.3f}  pyproj lon={lon:.9f} lat={lat:.9f}  js lon={ll[0]:.9f} lat={ll[1]:.9f}  "
          f"|d|={d:.2e} deg  roundtrip={r:.2e} m")
print(f"worst angular diff {worst_deg:.3e} deg, worst round-trip {worst_m:.3e} m")
sys.exit(0 if worst_deg < 1e-7 and worst_m < 1e-3 else 1)
