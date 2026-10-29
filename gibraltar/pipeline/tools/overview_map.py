"""Render a top-down overview map straight from the built .glb tiles.

    python tools/overview_map.py [out.png]

Terrain is hill-shaded from the mesh heights; roads, walls and buildings are
drawn from their actual triangles. Buildings are coloured by height
confidence (green measured, amber derived, red estimated), which makes it
easy to see how much of the city is verified. North is up.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from gibpipe import config, glb  # noqa: E402

RES = 2.5   # metres per pixel


def main(out):
    m = json.loads((config.BUILD / "manifest.json").read_text())
    x0, y0, x1, y1 = m["land_bounds_m"]
    x0, y0, x1, y1 = x0 - 150, y0 - 150, x1 + 150, y1 + 150
    W, H = int((x1 - x0) / RES), int((y1 - y0) / RES)
    zbuf = np.full((H, W), np.nan)
    img = Image.new("RGB", (W, H), (28, 58, 105))
    draw = ImageDraw.Draw(img)

    def px(p, ox, oy):
        return np.column_stack([(p[:, 0] + ox - x0) / RES, (y1 - (p[:, 1] + oy)) / RES])

    conf_col = {"measured": (60, 170, 80), "derived": (230, 160, 40), "estimated": (205, 80, 70)}
    layers = {"terrain": [], "roads": [], "walls": [], "buildings": []}
    for t in m["tiles"]:
        for name in layers:
            if name in t["layers"]:
                layers[name].append((t, glb.read_glb(config.BUILD / t["layers"][name]["file"])))
    # terrain: rasterise heights by triangle, then hill-shade
    for t, prims in layers["terrain"]:
        ox, oy, _ = t["origin_m"]
        for p in prims:
            if p["material"] != "M_Terrain":
                continue
            q = px(p["positions"], ox, oy)
            for tri in p["indices"]:
                a = q[tri]
                zz = p["positions"][tri, 2].mean()
                c0, r0 = np.floor(a.min(0)).astype(int); c1, r1 = np.ceil(a.max(0)).astype(int)
                c0, r0, c1, r1 = max(c0, 0), max(r0, 0), min(c1, W), min(r1, H)
                if c1 > c0 and r1 > r0:
                    zbuf[r0:r1, c0:c1] = zz
    gy, gx = np.gradient(np.nan_to_num(zbuf, nan=0.0), RES)
    slope = np.arctan(np.hypot(gx, gy)); aspect = np.arctan2(-gx, gy)
    hs = np.clip(np.sin(np.radians(45)) * np.cos(slope) + np.cos(np.radians(45)) * np.sin(slope) * np.cos(np.radians(315) - aspect), 0, 1)
    tint = np.clip(np.nan_to_num(zbuf, nan=0) / 430, 0, 1)
    rgb = np.stack([150 + 70 * hs - 30 * tint, 150 + 70 * hs - 10 * tint, 135 + 60 * hs - 30 * tint], -1)
    land = ~np.isnan(zbuf)
    arr = np.array(img); arr[land] = np.clip(rgb[land], 0, 255).astype(np.uint8)
    img = Image.fromarray(arr); draw = ImageDraw.Draw(img)
    for name, colour in (("roads", None), ("walls", (120, 105, 80))):
        for t, prims in layers[name]:
            ox, oy, _ = t["origin_m"]
            for p in prims:
                c = colour or {"M_Road": (70, 70, 72), "M_Path": (235, 225, 200), "M_Steps": (250, 240, 150)}.get(p["material"], (90, 90, 90))
                if name == "walls" and p["material"] == "M_Path":
                    c = (160, 140, 110)
                q = px(p["positions"], ox, oy)
                for tri in p["indices"]:
                    draw.polygon([tuple(v) for v in q[tri]], fill=c)
    for t, prims in layers["buildings"]:
        ox, oy, _ = t["origin_m"]
        feats = json.loads((config.BUILD / t["features"]).read_text())["buildings"]
        for p in prims:
            if p["material"] != "M_BuildingRoof":
                continue
            q = px(p["positions"], ox, oy)
            for tri in p["indices"]:
                f = int(p["feature_ids"][tri[0]])
                draw.polygon([tuple(v) for v in q[tri]], fill=conf_col[feats[f]["confidence"]])
    draw.text((10, 10), "N ^   2.5 m/px   buildings: green measured / amber derived / red estimated height", fill=(255, 255, 255))
    img.save(out, optimize=True)
    print(out, img.size)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else str(config.ROOT / "docs" / "img" / "overview.png"))
