# Licensing: what we owe each data source

Plain-English guide to the legal side of the data in `DATA_SOURCES.md`.
Researched 2026-10-29 from primary sources (URLs given). **This is not legal
advice.** Before a commercial release, have a lawyer check this page,
especially the OpenStreetMap section.

## 1. The short version

| Source | Can we use it in a game we sell? | What we must do |
|---|---|---|
| OpenStreetMap (ODbL) | **Yes** | Credit OSM. Publish our processed OSM-derived data free under ODbL. Never mix OSM with restricted data for the same feature type. |
| IGN MDT05 terrain (CC BY 4.0) | **Yes** | Exact Spanish credit line, link to the licence, say we modified it. |
| IGN PNOA orthophoto (CC BY 4.0), if used | **Yes** | Same as MDT05, with the PNOA product identifier. |
| Copernicus DEM GLO-30 | **Yes** | Fixed credit line plus a fixed "no liability" sentence. |
| Sentinel-2 | **Yes** | "Contains modified Copernicus Sentinel data [Year]". |
| Overture buildings (ODbL) | **Yes** | As for OSM, plus each underlying source's credit. |
| Microsoft building footprints (CDLA Permissive 2.0) | **Yes** | Include the licence text if we redistribute the *data*. |
| Gibraltar GeoPortal (all rights reserved) | **Not without written permission** | **You** must email and get a yes in writing (draft in §6). |
| Wikimedia Commons / Mapillary / KartaView | As **reference to look at**: yes. As **textures**: only per file, with conditions | Record each file's licence. Avoid share-alike files as textures. |
| Google / Apple / Bing / Esri imagery and 3D | **No** | Do not extract, trace or ship. |

## 2. Credits screen: exact strings

Put this block in the game's **Credits** screen **and** in a `DATA_LICENCES.txt`
file shipped next to the game. Also add the short line at the end of this
section to the start-up splash or loading screen. Keep `manifest.json →
attribution` in sync with this list. Only include the lines for sources the
build actually uses.

```
MAP AND TERRAIN DATA

Map data from OpenStreetMap
© OpenStreetMap contributors. Available under the Open Database License (ODbL).
https://www.openstreetmap.org/copyright
The OpenStreetMap-derived data used in this game is available free under the
ODbL at: <URL WHERE WE PUBLISH IT – see section 3.1>

Obra derivada de MDT05-cob1 2008-2015 CC-BY 4.0 scne.es
(Terrain derived from the MDT05 digital terrain model of the Instituto
Geográfico Nacional de España / Sistema Cartográfico Nacional, licensed under
CC BY 4.0, https://creativecommons.org/licenses/by/4.0/ . Modified:
reprojected, clipped to the coastline, resampled and converted to 3D meshes.)

Contains modified Copernicus Sentinel data <YEAR OF THE IMAGES>

produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence
and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and
ESA; all rights reserved.
The organisations in charge of the Copernicus programme by law or by delegation
do not incur any liability for any use of the Copernicus WorldDEM-30.
```

Lines to add only if the build uses that source:

```
Overture Maps Foundation, overturemaps.org
(+ per-source lines for each building source present – see section 3.6)
© HM Government of Gibraltar <year> – used with permission
(only after written permission, in the wording they specify)
```

Short splash or loading-screen line (keep it on screen long enough to read):

```
Map data © OpenStreetMap contributors (ODbL) · Terrain: Obra derivada de MDT05-cob1 2008-2015 CC-BY 4.0 scne.es · Contains modified Copernicus Sentinel data
```

Where each string comes from:

* OSM: OSMF Attribution Guidelines (adopted 2021-06-25),
  `https://osmfoundation.org/wiki/Licence/Attribution_Guidelines`.
  "Attribution must be to 'OpenStreetMap'", must make clear the data is under
  the ODbL, and "© OpenStreetMap contributors" is an accepted form. For games:
  "attribution can be provided either by a splash screen on application
  startup, in the game view, during gameplay, on the credits page, in the menu,
  or in another suitable location. Detailed information must be provided in a
  suitable location if the initial attribution does not provide detailed
  information."
* IGN: IGN licence conditions,
  `https://www.ign.es/resources/licencia/Condiciones_licenciaUso_IGN.pdf`, plus the
  product table at `https://www.scne.es/tablaProductos.php` (row MDT05-cob1:
  recognition "MDT05-cob1 2008-2015 CC-BY 4.0 scne.es").
* Copernicus DEM: licence Article 6(b) and 6(c),
  `https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Data/DEM/resources/license/License-COPDEM-30.pdf`.
  Only needed if any shipped data was derived from GLO-30. Pure validation use
  that ships nothing needs no notice, but listing it does no harm.
* Sentinel: EU legal notice,
  `https://sentinels.copernicus.eu/documents/247904/690755/Sentinel_Data_Legal_Notice`.

## 3. Per-source obligations

### 3.1 OpenStreetMap: ODbL 1.0

Licence text: `https://opendatacommons.org/licenses/odbl/1-0/`.
OSM copyright page: "If you alter or build upon our data, you may distribute the
result only under the same license."

**Two kinds of output.** The ODbL treats two kinds of output differently:

* A **Produced Work** is "a work (such as an image, audiovisual material, text,
  or sounds) resulting from using … the Contents". The rendered game (what
  players see, screenshots, videos) is a Produced Work. You can license it
  however you like, including commercially, provided it carries the OSM notice
  (ODbL 4.3).
* A **Derivative Database** is OSM data that has been changed or processed.
  Our `features.json` files (with OSM IDs, heights, widths) and the per-tile
  `.glb` geometry built from OSM are, in practice, databases that anyone could
  extract OSM data from. The OSMF Produced Work guideline says: "If the
  published result of your project is intended for the extraction of the
  original data, then it is a database and not a Produced Work"
  (`https://osmfoundation.org/wiki/Licence/Community_Guidelines/Produced_Work_-_Guideline`).
  Treat the shipped OSM-derived files as a Derivative Database to be safe.

**What share-alike means for us.**

1. ODbL 4.6: if we publicly use a Derivative Database, **or a Produced Work
   made from one**, we must also offer, free of charge if distributed over the
   internet, either (a) the entire Derivative Database, or (b) "the method of
   making the alterations … (such as an algorithm)". The game is made from our
   processed OSM data, so **this applies even if we argue the game is only a
   Produced Work.**
2. Simplest compliance: publish, free and under ODbL, the OSM-derived build
   outputs (`features.json`, building/road/wall meshes derived from OSM) **or**
   the pipeline source code plus the exact OSM extract timestamp it ran on. Put
   the URL in the credits.
3. Our **own code, art, hand-made models (`overrides.json` assets), sounds and
   the game itself** do not become ODbL. ODbL 4.5(b): "Using this Database …
   to create a Produced Work does not create a Derivative Database".
4. Ideally, send corrections we discover (wrong building heights, missing
   steps) back to OSM by editing it directly. That is the spirit of the licence.

**Mixing OSM with other data (important for GeoPortal and Overture).**
Under the OSMF Collective Database guideline
(`https://osmfoundation.org/wiki/Licence/Community_Guidelines/Collective_Database_Guideline_Guideline`)
and the Horizontal Map Layers guideline
(`https://osmfoundation.org/wiki/Licence/Community_Guidelines/Horizontal_Map_Layers_-_Guideline`):

* **Safe:** for one feature type within one area, use either **all OSM** or
  **all non-OSM** data, with no references between them. For example, terrain from
  IGN plus roads from OSM is fine, because terrain and roads are different types.
* **Triggers share-alike on the other data:** filling gaps in OSM buildings
  with buildings from another source "not present in the OpenStreetMap
  layer", or joining another source's heights onto OSM buildings by ID or by
  location. The other data would then have to be published under ODbL.
* Consequence: **never merge GeoPortal building data into OSM buildings.**
  The GeoPortal licence would forbid publishing it under ODbL. If permission
  arrives, use GeoPortal buildings for *all* buildings in Gibraltar (and drop
  OSM buildings) or not at all, and ask the Government whether that is allowed.

**DRM.** ODbL 4.7 forbids technical measures that restrict the data, unless an
unrestricted copy is also available "without additional fee" and "at least as
accessible". Publishing the free ODbL download (point 2) covers this if the
game ships with DRM (for example a Steam wrapper).

**Notice text.** ODbL 4.3 example: "Contains information from OpenStreetMap,
which is made available here under the Open Database License (ODbL)". The
credits block in §2 meets the OSMF guideline.

**Download route.** Use the daily extract or planet files, not the editing API
(see `DATA_SOURCES.md`, correction 2).

### 3.2 IGN Spain (MDT05, MDT02, LiDAR, PNOA orthophoto): CC BY 4.0

Source: IGN licence conditions PDF (link in §2), issued under Orden
FOM/2807/2015. It says use of the products "tendrá carácter libre y gratuito,
siempre que se mencione el origen y propiedad de los datos" (use is free of
charge provided the origin and ownership of the data are credited) and that use
"conlleva la aceptación por el usuario de una licencia CC-BY 4.0".

* **Commercial use: allowed.** The CC BY 4.0 deed says "for any purpose, even
  commercially" (`https://creativecommons.org/licenses/by/4.0/`).
* **Credit format** (IGN rule 4, derived works): "Obra derivada de
  <identificador del producto> <fecha> CC-BY 4.0 <atribución de productores>".
  For MDT05 this gives **`Obra derivada de MDT05-cob1 2008-2015 CC-BY 4.0 scne.es`**.
  If MDT02 is used: `Obra derivada de MDT02-cob2 2015-2021 CC-BY 4.0 scne.es`.
  For the PNOA orthophoto, look up its identifier and date in the scne.es table
  first. We have **not verified** them.
* **Where the credit goes:** IGN wants it "visible junto con los datos … a pie de
  mapa, imagen, presentación o ventana de visualización", i.e. next to the
  data. Only "en caso de imposibilidad manifiesta y justificable" (if that is
  clearly and justifiably impossible) may it go in "listados de capas …
  leyendas … o créditos". A game has no map footer, so we use the credits **plus** the
  splash line. Rule 7 allows other arrangements agreed with CNIG. Optional
  but recommended: email `consulta@cnig.es` to confirm this placement (§5).
* **Metadata** (IGN rule 5): if we publish a modified dataset (e.g. a released
  heightmap), put the same credit in its metadata (abstract, lineage, access
  constraints). Our `catalogue.json` should carry it.
* **CC BY 4.0 extras:** link to the licence and say what we changed (done in
  §2). The deed says "You may not apply legal terms or technological measures
  that legally restrict others from doing anything the license permits."
  If the game uses DRM, also publish the derived terrain heightmap freely
  (with the ODbL download is fine) so nobody depends on the DRM'd copy. This is
  a cautious suggestion, not a legal ruling.
* **No share-alike.** IGN data does not force us to open anything else.

### 3.3 Copernicus DEM GLO-30

Licence Articles 4 to 6 (link in §2): rights of "reproduction; distribution;
communication to the General Public; adaptation, modification and combination",
"free of charge", "worldwide and without limitation in time". **Commercial use
allowed** (no restriction stated). Obligations: the adapted-data notice, the
no-liability sentence (in any "licence or any legal warning or notice"), and no
implied endorsement by Copernicus, ESA or Airbus. No share-alike. A newer
Copernicus licence exists but the AWS copy still points to this one.

### 3.4 Sentinel-2

EU legal notice (link in §2): free reuse covering "(a) reproduction;
(b) distribution; (c) communication to the public; (d) adaptation, modification
and combination". Commercial use is not named, but nothing restricts it. Notice
for modified data: **"Contains modified Copernicus Sentinel data [Year]"**. No
share-alike. Users waive damage claims against the EU and data providers.

### 3.5 Gibraltar GeoPortal: permission required

The GeoPortal disclaimer (`https://www.geoportal.gov.gi/index.php/downloads/disclaimer`)
says access "does not imply a license to reproduce and/or distribute
information without the prior approval of HM Government of Gibraltar", and
directs permission requests to the Geoportal Administrator. Every page says
"© 2019 by Information Technology & Logistics Department. All rights
reserved." A third-party directory lists the service's access constraint as
"geossNonCommercial" (**unverified** against the live service). That suggests
non-commercial use at most, so **written permission that names commercial use is
essential** before any GeoPortal-derived data goes into a build we might sell.

Until permission arrives:

* Do not download, trace or digitise GeoPortal layers, PDFs or the 3D viewer
  model into project data.
* Looking at the public viewers to judge whether our OSM-based model looks
  right is ordinary browsing. Copying what we see into our data is the line
  not to cross.

### 3.6 Overture Maps and Microsoft footprints

* **Overture buildings theme: ODbL** ("the buildings theme is published under
  the ODbL license", `https://docs.overturemaps.org/guides/buildings/`). Same
  obligations as OSM (§3.1). Also credit "Overture Maps Foundation,
  overturemaps.org" and each source actually present in Gibraltar's features
  (check each feature's `sources` field). Strings from
  `https://docs.overturemaps.org/attribution/`: OSM "© OpenStreetMap
  contributors."; Microsoft "Licensed by Microsoft under the Open Database
  License."; Esri Community Maps "Esri Community Maps contributors." (CC BY 4.0);
  BTN (Spain) "Work derived from BTN 2024 ign.es." (CC BY 4.0).
  Overture buildings already contain OSM, so mixing Overture and OSM buildings
  is still OSM data (share-alike applies to the result).
* **Microsoft Global ML Building Footprints** direct: Microsoft's README says
  CDLA Permissive 2.0. If we share the *data*, we must include the agreement's
  text. The licence "does not impose any restriction or obligations with respect
  to the use, modification, or sharing of Results" (`https://cdla.dev/permissive-2-0/`).
  If those footprints were mixed with OSM buildings, ODbL share-alike would
  apply to the mix (compatible, since CDLA Permissive allows it).

### 3.7 Photos and street-level imagery (Wikimedia Commons, Mapillary, KartaView)

* **As reference** (look at a photo, then model by hand from scratch): this is
  how artists normally work. No pixels are copied, and the photo's licence
  terms are generally not triggered. Keep a list of reference URLs anyway.
* **As textures** (pixels copied into the game): each file has its own
  licence (Commons: "Each file's license is stated on its description page").
  * Public domain or CC0: usable. Credit is optional but polite.
  * CC BY: usable commercially. Credit the author, licence and link in the
    credits, and say we modified it.
  * **CC BY-SA (all Mapillary and KartaView imagery, many Commons photos):** the texture and
    adaptations of it must be shared under CC BY-SA. **Avoid as
    textures** unless we are happy to release those textures under CC BY-SA.
  * Commons also warns that copyright licences do not cover "trademarks …
    personality rights": crop out identifiable people, shop logos and number
    plates.
* Mapillary's and KartaView's licences come from secondary sources (Mapillary's own
  help page returned 403 to us). **Confirm by** reading their current
  terms before relying on them.

### 3.8 Historical maps

Maps from the 1700s and 1800s (e.g. the British Library's King's Topographical
Collection, 1500-1824) are reported as freely available or public domain. Use
the publisher's statement **on each item's own page** and record it. Modern
scans can carry their own terms. Use these maps for reference (fortification layouts),
not textures, unless that item's statement allows it.

### 3.9 UKHO Admiralty charts

Crown copyright. Reproducing chart content needs a UKHO licence. The UKHO
copyright site says a free licence may apply where the product's total
commercial value is under £10,000. Otherwise a fee applies. Not needed for
now.

## 4. Fine without asking anyone

You can use OSM, IGN, Copernicus DEM and Sentinel-2 data in the prototype, screenshots,
videos and a commercial release, **with the credits above**. Raw downloads kept
private on your own PC are not public use (ODbL 4.5(c)).

## 5. Actions for you (the developer)

1. **Email the GeoPortal administrator** (draft in §6). Address: the GeoPortal
   contact page hides it with JavaScript; it decodes to **gis.itld@gibraltar.gov.gi**.
   Check it in your browser at `https://www.geoportal.gov.gi/index.php/contact`
   before sending. Backup contact: ITLD, 16 Library Street, Gibraltar,
   tel. +350 200 48416 / +350 200 51465
   (`https://www.gibraltar.gov.gi/contacts/itld-information-technology-logistics-department-45`).
   Keep the reply. If permission is granted, copy its exact conditions and
   credit wording into this file.
2. **From your home PC in QGIS**, open the GeoPortal WMS/WFS
   (`https://download.geoportal.gov.gi/geoserver/wms`, `.../wfs`) and note the
   `AccessConstraints` text. **Only look until permission arrives**: don't
   export.
3. **Optional:** email `consulta@cnig.es` (CNIG) to confirm a credits screen plus
   splash line is acceptable attribution for MDT05 in a game. Also ask whether
   MDT02 or PNOA LiDAR covers Gibraltar and what vertical datum the Gibraltar
   MDT05 sheets use.
4. **Before any public release:** decide where the ODbL download will live
   (e.g. a GitHub release of the OSM-derived `features.json` and meshes, or
   the pipeline source plus the OSM extract timestamp). Put the URL in the
   credits.
5. **Before commercial release:** have this file reviewed by a lawyer.

## 6. Draft permission email (GeoPortal)

> **To:** gis.itld@gibraltar.gov.gi
> **Subject:** Permission request – use of Geoportal data in a 3D model of Gibraltar
>
> Dear Geoportal Administrator,
>
> I am an independent developer building a first-person, walk-around 3D model
> of the whole of Gibraltar at true scale, using Unreal Engine. It is currently
> a non-commercial prototype. I may in future release it commercially (for
> example as a paid game or virtual tour). I am writing, as your disclaimer
> asks, to request permission before using any Geoportal data.
>
> I would like to use the following layers from your download service
> (download.geoportal.gov.gi) to improve accuracy:
>
> * `gibgis:buildings_py` (building footprints), and any building height or
>   number-of-floors information you hold
> * `gibgis:hypsography_pl` and/or `inspire:EL_Contourline` (contours)
> * the terrain model used in your 3D viewer (`DTM_Union_ONLY_LAND_nd6`), or
>   any other DTM/DSM or LiDAR data, including the 2023 Northern Defences
>   LiDAR survey if it is available
> * `gibgis:thoroughfare_pl` and `gibgis:transport_py` (roads and paths)
> * `gibgis:structures_py`, `gibgis:landformnatural_py`,
>   `gibgis:landformmanmade_py`, `gibgis:vegetation_py`
> * `gibgis:aerial2013_v3` (2013 aerial image), as a modelling reference and
>   possibly as ground texture
>
> The data would be converted into 3D shapes inside the application. I would not
> redistribute your original files. I would credit HM Government of Gibraltar
> in the credits with whatever wording you prefer.
>
> Could you please tell me:
>
> 1. whether you are able to grant permission for (a) the non-commercial
>    prototype and (b) a possible future commercial release, and on what terms
>    (including any fee);
> 2. the attribution wording you would like;
> 3. which vertical datum the heights in these layers use, and its offset from
>    mean sea level at Alicante if known;
> 4. whether I may access the download service at all. It currently returns
>    "This site is not accessible" from some networks.
>
> Thank you very much for your time and for making the Geoportal available.
>
> Kind regards,
> [Your name]
> [Contact details]
