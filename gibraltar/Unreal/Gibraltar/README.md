# Gibraltar: Unreal Engine 5 project

A quiet first-person walk through a 1:1, geographically accurate Gibraltar.
There's no combat, no enemies and nothing to survive. You walk, climb the
Rock, read about places, and watch the real sun and moon move across the sky.

> **Please read this first.** The C++ and Python in this folder were written
> on a machine without Unreal Engine, so **nobody has compiled or run them
> yet**. They target the UE 5.5 APIs and were reviewed carefully, but expect
> to fix a few small compile errors the first time. See *If the build fails*
> below.

The level isn't stored in git. You build it from the GIS pipeline output
(`gibraltar/data/build/`) with one script, so a re-run always gives you the
latest data.

---

## 1. What you need (one-time setup, Windows)

1. **Epic Games Launcher**: <https://store.epicgames.com/download>. Sign in,
   open **Unreal Engine → Library**, click **+** next to *Engine Versions*,
   pick **5.5.x** and install it. The default location is
   `C:\Program Files\Epic Games\UE_5.5`. It needs about 60 GB.
2. **Visual Studio 2022 Community**: <https://visualstudio.microsoft.com/>.
   In the installer, tick the **"Game development with C++"** workload. On
   the right-hand side, also make sure these are ticked:
   * *Unreal Engine installer* (or *Unreal Engine Test Adapters*), if offered
   * a **Windows 10/11 SDK**
   * **MSVC v143 – VS 2022 C++ x64/x86 build tools**
   * **.NET Framework 4.8 SDK** (or newer) and the **.NET 6/8 runtime** (UnrealBuildTool needs it)
3. **The pipeline output.** The lead developer's Python pipeline writes
   `gibraltar/data/build/manifest.json` plus the `tiles/` folders, and
   (optionally) `gibraltar/data/audio/*.wav`. If `data/build` is missing, run
   the pipeline first (see `gibraltar/pipeline`).

Folder layout this project expects:

```
gibraltar/
  data/build/manifest.json     <- pipeline output
  data/build/tiles/...
  data/audio/*.wav             <- sea_waves.wav, wind.wav, birds_day.wav, crickets_night.wav
  Unreal/Gibraltar/Gibraltar.uproject   <- this project
```

## 2. Build the code

1. In Explorer, right-click `Gibraltar.uproject` and choose **Generate Visual
   Studio project files**. If that menu item is missing, double-click the
   `.uproject` once: Unreal offers to build the missing modules. Say **Yes**.
2. Open the new `Gibraltar.sln` in Visual Studio 2022.
3. At the top, set the configuration to **Development Editor** and the
   platform to **Win64**. Then choose **Build → Build Solution** (Ctrl+Shift+B).
   The first build takes a few minutes.

(`Scripts\BuildWorld.bat` also compiles the code for you. You still need
Visual Studio installed, but you don't have to open it.)

## 3. Build the world

Close the Unreal Editor, then double-click **`Scripts\BuildWorld.bat`** (or
run it from a command prompt). It:

1. finds UE 5.5 (from the registry, from `C:\Program Files\Epic Games\UE_5.5`,
   or from the `UE_ROOT` environment variable);
2. compiles the editor module;
3. runs `Scripts/import_gibraltar.py` headless. That script:
   * creates the materials (`/Game/Gibraltar/Materials`),
   * imports every tile layer `.glb` (`/Game/Gibraltar/Tiles/<tile>/SM_<tile>_<layer>`)
     with Nanite and exact (complex-as-simple) collision,
   * checks every mesh's bounds against the manifest, to within 1 cm,
   * imports the ambience sounds (`/Game/Gibraltar/Audio`),
   * builds the World Partition level `/Game/Gibraltar/Maps/L_Gibraltar` with
     terrain, roads, buildings, walls, props (trees and street furniture), facades (doors and windows), the sea, the sky, landmarks and the
     start point.

At the end it prints a **"Gibraltar import summary"** and writes
`Saved/GibraltarImport/report.json`. The first run can take 10–30 minutes
because Unreal compiles shaders and builds Nanite data. Later runs are faster.

Options:

| Command | What it does |
|---|---|
| `Scripts\BuildWorld.bat` | build the code, then import headless |
| `Scripts\BuildWorld.bat gui` | run the import inside the normal editor window (use this if the headless run misbehaves) |
| `Scripts\BuildWorld.bat nobuild` | skip compiling |
| `set GIBRALTAR_ONLY_TILES=T_E0_N0,T_W1_N0` then run | import just a few tiles, as a quick test |
| `set GIBRALTAR_BUILD_DIR=D:\somewhere\build` then run | use pipeline output from another folder |
| `set UE_ROOT=D:\Epic\UE_5.5` then run | use an engine installed somewhere else |

You can also run the script from inside the editor: **Tools → Execute Python
Script…** and pick `Scripts/import_gibraltar.py`. It replaces the open level,
so save your work first.

## 4. Play

Double-click `Gibraltar.uproject`. The editor opens `L_Gibraltar`. Press
**Play** (Alt+P). In the editor, **Esc stops Play-In-Editor**, so use **P**
for the pause menu there. In a packaged game, Esc works too.

### Controls

| Key | Action |
|---|---|
| W A S D / arrow keys | walk |
| Mouse | look |
| Shift (hold) | run (4.5 m/s; walking is 1.4 m/s) |
| Space | jump |
| C | crouch on/off |
| Left Ctrl (hold) | crouch while held |
| E | read about the landmark you're looking at / close the panel |
| Esc or P | pause menu: Resume, Settings, Save position, Load position, Return to start, Quit |
| F3 | location readout: GIB-LTM x/y, lon/lat, height above sea level, tile id, heading, time |
| [ and ] | time of day −1 h / +1 h |
| T | pause / resume the clock |

### Saving

* Your position, the time of day and your settings are **autosaved every 60
  seconds and when you quit**. The next time you start, you continue where
  you left off. **Pause menu → Return to start** takes you back to the
  start point.
* **Save position** and **Load position** in the pause menu use a separate
  manual slot.
* Save files are in `Saved/SaveGames/` (`Gibraltar_Autosave.sav`,
  `Gibraltar_Manual.sav`, `Gibraltar_Settings.sav`). To reset, delete them.
* Graphics settings (quality preset, resolution scale, VSync, window mode)
  are saved by Unreal in `Saved/Config/Windows/GameUserSettings.ini`.

### Time of day

The game starts at 10:00 local time on today's date. The sun and moon are
calculated for Gibraltar's real position (NOAA solar algorithm, a
low-precision lunar series) and Gibraltar's clock (CET/CEST, EU summer-time
rule). By default the clock runs 20× faster than real time, so one game day
takes 72 minutes. You can change this in **Settings → Time of day speed**.
In the editor, select **GibraltarSkyController** in the Outliner to set
another date or start hour. Click **Apply Time Of Day Now** to preview it.

### The sea

The sea is a flat plane at sea level (z = 0). About 60 cm below the surface
there's an invisible floor. You can paddle along a beach, but you can never
fall into the void. If you wade more than 25 m from dry land, you're gently
put back on the shore. Falling out of the world for any other reason also
puts you back on solid ground.

## 5. Coordinates (for developers)

Everything follows `gibraltar/docs/COORDINATES.md` and `MANIFEST.md`:

* Engine CRS **GIB-LTM** (Transverse Mercator, lat0 36.13, lon0 −5.35,
  k0 1, GRS80). Origin (0,0,0) = lon −5.35, lat 36.13, mean sea level.
* Unreal axes: **X = east, Y = south, Z = up**, centimetres:
  `Unreal = (x·100, −y·100, z·100)`.
* Tile `(ix, iy)` actor at `(ix·50000, −iy·50000, 0)`; id `T_E0_N0`, `T_W1_N3`, …
* `FGibraltarGeo` (C++) has forward and inverse GIB-LTM ↔ lon/lat (Krüger
  series, checked against PROJ to < 1 µm). It runs a self-test at startup;
  look for `GIB-LTM projection self-test passed` in the log.
* The level also contains an `AGeoReferencingSystem` (flat planet, projected
  CRS = GIB-LTM, geographic CRS = EPSG:4326, origin at the projected origin)
  for other tools. The game code itself does not depend on the plugin.

World Partition: the runtime grid is 500 m cells with a 1.25 km loading
range. Terrain tiles are not spatially loaded, so the whole Rock is always
visible. Buildings, roads and walls stream in around the player.

## 6. Troubleshooting

| Problem | Fix |
|---|---|
| "This project was made with a different version of the Unreal Engine" | Right-click `Gibraltar.uproject` → **Switch Unreal Engine version…** → pick 5.5. 5.4 and 5.6 should also work. |
| "The following modules are missing or built with a different engine version" | Click **Yes** to rebuild. If that fails, build in Visual Studio (step 2) to see the real error. |
| `BuildWorld.bat`: *manifest.json not found* | The pipeline hasn't been run yet. Run it so it writes `gibraltar/data/build`, or set `GIBRALTAR_BUILD_DIR`. |
| `BuildWorld.bat`: *Unreal Engine 5.5 was not found* | `set UE_ROOT=C:\path\to\UE_5.5` and run it again. |
| Headless import hangs or crashes | Run `Scripts\BuildWorld.bat gui nobuild`. It does the same thing in the editor window. |
| The import summary shows **bounds failures** | The importer used a different axis convention than expected, or the pipeline's `bounds_m` don't match the `.glb`. The log says which axes were detected. Send `Saved/GibraltarImport/report.json` to the lead developer. |
| Grey world, no sky | Make sure `GibraltarSkyController` is in the level (the import script places it). If it's missing, the game mode spawns one at runtime. |
| Silent | The `data/audio/*.wav` files didn't exist when you imported. Generate them and run `BuildWorld.bat nobuild` again. |
| Mouse too fast or too slow | Change **Settings → Mouse sensitivity** (0.1–4). |
| Low frame rate | Lower **Settings → Graphics quality** and/or **Resolution scale**. Lumen, Nanite and volumetric clouds need a DirectX 12 GPU (GTX 1070 / RX 5600 or better recommended). |

### If the build fails

The code has not been compiled yet. When Visual Studio reports an error, it's
almost always one of the API names listed in the integration notes
(`UNVERIFIED_APIS` below). Fix it to the name your engine version uses. Most
are one-line changes. Things to try first:

* `UGameUserSettings::GetResolutionScaleInformationEx` / `SetResolutionScaleValueEx`
  (pause menu): the alternatives are `GetResolutionScaleNormalized` /
  `SetResolutionScaleNormalized`.
* `UDirectionalLightComponent::SetAtmosphereSunLight` / `SetAtmosphereSunLightIndex`
  (sky controller).
* `UCharacterMovementComponent::SetCrouchedHalfHeight` (character). On older
  engines, write `CrouchedHalfHeight = 55.f;` instead.

#### UNVERIFIED_APIS

C++: `SetResolutionScaleValueEx`, `GetResolutionScaleInformationEx`,
`SetAtmosphereSunLight(Index)`, `SetCrouchedHalfHeight`,
`USkyLightComponent::bRealTimeCapture` (public field),
`SSlider::MinValue/MaxValue` arguments, and the `AVolumetricCloud` /
`ASkyAtmosphere` declarations living in
`Components/VolumetricCloudComponent.h` / `Components/SkyAtmosphereComponent.h`.

Python (all guarded: a wrong name only logs a warning): Interchange pipeline
option names (`common_meshes_properties`, `vertex_color_import_option`,
`combine_static_meshes`, `build_nanite`, `import_materials`, …),
`LevelEditorSubsystem.new_level(path, is_partitioned_world)`, the World
Partition grid (`WorldPartitionRuntimeSpatialHash.grids`), and
`GeoReferencingSystem` property names.

## 7. Data attribution

Map data © OpenStreetMap contributors (ODbL). Terrain: IGN MDT05. The full
list of sources and licences is in `gibraltar/data/build/catalogue.json` and
in the `attribution` list of `manifest.json`. Landmark panels show the source
of each entry.

## 8. Project layout

```
Gibraltar.uproject
Config/            DefaultEngine.ini (maps, Lumen, VSM, Nanite), DefaultGame.ini, DefaultInput.ini, DefaultGameUserSettings.ini
Source/Gibraltar/  C++ gameplay (character, controller, HUD, Slate menus, sky, ambience, saves, geo maths)
Scripts/           import_gibraltar.py (editor-only tooling), BuildWorld.bat
Content/Gibraltar/Custom/   hand-made override assets (the only Content kept in git)
```
