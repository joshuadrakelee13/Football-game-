# Data sources

Every dataset the project uses or has considered, what it contains, whether we
can reach it, and what its licence allows. Obligations (credits, share-alike,
permission emails) are in `LICENSING.md`.

**Status of this page:** researched 2026-10-29 from the project's cloud
container. "Verified" means checked this session against the publisher's own
page, metadata record or service response (URL given). Anything marked
**unverified** has not been confirmed. The "confirm by" note says how to check it.
This is not legal advice.

## Corrections to earlier assumptions

1. **IGN MDT05 over Gibraltar is not LiDAR.** The official MDT05 metadata
   (IDEE catalogue record `spaignMDT05`, lineage section) says the model comes
   from PNOA LiDAR "with the exception of the sheets of Andorra, Ceuta,
   Melilla, Isla de Alborán and **Gibraltar** (183-2, 1110-3, 1111-3, 1078B,
   1078-2) obtained by **automatic stereocorrelation of photogrammetric
   flights** of the PNOA". The terrain is therefore photogrammetric, not a LiDAR
   bare-earth model. It is still the best open terrain we have (max 419 m against the
   official 426 m), but cliff faces, vegetated slopes and the old town may hold
   larger errors than the LiDAR-derived parts of Spain.
   Record: `https://www.idee.es/csw-inspire-idee/srv/spa/csw?Service=CSW&Request=GetRecordById&Version=2.0.2&outputSchema=http://www.isotc211.org/2005/gmd&elementSetName=full&id=spaignMDT05`
2. **The OSM editing API must not be our bulk download route.** The OSMF API
   Usage Policy (`https://operations.osmfoundation.org/policies/api/`) says:
   "The editing API is provided in order to edit the map data, not for
   read-only purposes or projects" and "Large or frequent data users must use
   the download service planet.osm or other alternatives". A daily Gibraltar
   extract is reachable from this container instead (see table, row 1).
3. **COORDINATES.md says Gibraltar's local datum differs from Alicante "by a few
   decimetres at most". That is unverified.** No published offset was found.
   See "Vertical datum" below.

**Status (2026-10-29):** all three are now reflected in the project. The
pipeline downloads OSM only from the openstreetmap.fr daily extracts (Gibraltar
and Cádiz); the editing API is no longer used. The terrain is described as
photogrammetric everywhere. COORDINATES.md and DISCREPANCIES.md mark the
datum offset as unknown.

## Source table

Access = status **from this cloud container** on 2026-10-29.
Used = yes / planned / candidate / reference only / no.

| # | Source | Publisher | URL | Contains | Format | CRS | Resolution | Coverage | Vintage | Access | Licence (summary) | Used |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | OSM Gibraltar extract | OpenStreetMap contributors; extract by OpenStreetMap France | https://download.openstreetmap.fr/extracts/europe/gibraltar.osm.pbf | All OSM features: buildings, roads, paths, steps, walls, POIs, landuse | `.osm.pbf` | EPSG:4326 | Vector | Gibraltar | Daily; checked file timestamp 2026-10-29T01:05:17Z | Reachable (HTTP 200, 782 kB) | ODbL 1.0 (share-alike database licence) | **Yes** (replaces API) |
| 2 | OSM API v0.6 | OSMF | https://api.openstreetmap.org/api/0.6/ | Same data, live | OSM XML | EPSG:4326 | Vector | Any bbox | Live | Reachable (lead dev) | ODbL; **usage policy forbids read-only/bulk use** | No (for bulk) |
| 3 | IGN MDT05 (WCS coverage `Elevacion25830_5`) | Instituto Geográfico Nacional (IGN) / CNIG, Spain | https://servicios.idee.es/wcs-inspire/mdt | Bare-earth terrain model (DTM) | GeoTIFF via WCS 2.0.1 (native COG) | EPSG:25830; heights orthometric (see datum notes) | 5 m grid | Spain plus Gibraltar sheet | Product "MDT05-cob1", dated 2008-2015; Gibraltar part from photogrammetry, flight date **unverified** | Reachable | CC BY 4.0, AccessConstraints "CC BY 4.0 scne.es" (verified in GetCapabilities) | **Yes** |
| 4 | IGN MDT02 2nd coverage | IGN / CNIG | https://centrodedescargas.cnig.es/CentroDescargas/modelo-digital-terreno-mdt02-segunda-cobertura | 2 m DTM from LiDAR 2nd coverage | ASCII grid (.asc) per MTN25 sheet | ETRS89 UTM; heights EPSG:5782 (Alicante) | 2 m | Spain; **Gibraltar coverage unverified** | "MDT02-cob2 2015-2021" | CNIG download centre timed out | CC BY 4.0 | Candidate |
| 5 | PNOA-LiDAR point clouds (cob1/cob2/cob3) | IGN / CNIG + regions | https://centrodedescargas.cnig.es/ | Classified LiDAR points (LAZ) | LAZ | ETRS89 UTM | cob3 spec 5 pts/m² (per IGN spec document, not checked for this area) | Spain; **Gibraltar coverage unverified, probably none** (MDT05 used photogrammetry there) | cob1 2008-2015; cob2 2015-2021; cob3 2022-2025 | Timed out | CC BY 4.0 | Candidate (Campo de Gibraltar backdrop only) |
| 6 | IGN PNOA orthophoto "máxima actualidad" (WMS layer `OI.OrthoimageCoverage`) | IGN / CNIG | https://www.ign.es/wms-inspire/pnoa-ma | Aerial colour orthophoto | WMS (JPEG/PNG) | EPSG:25830 and others | Sub-metre (exact GSD for this sheet **unverified**) | **Gibraltar only partly covered:** test GetMaps show imagery north of roughly N 4,001,440 (EPSG:25830, about the isthmus, airport and north town); everything south is black (no data) | **Unverified** | Reachable | CC BY 4.0, AccessConstraints "CC BY 4.0 scne.es" | Candidate (north only) |
| 7 | Copernicus DEM GLO-30 | European Union / ESA; data © DLR & Airbus | s3://copernicus-dem-30m (https://copernicus-dem-30m.s3.amazonaws.com/readme.html) | Surface model (DSM: includes buildings and trees) | COG | EPSG:4326 (vertical reference **unverified** here, usually stated as EGM2008) | 30 m (1 arc-second) | Global | Data © 2010-2018 per licence notice | Reachable | Copernicus WorldDEM-30 licence: free, worldwide, commercial use allowed, fixed notices | Validation / sea-edge fallback only |
| 8 | Sentinel-2 L2A COGs | EU Copernicus / ESA; hosted by Element 84 on AWS | https://registry.opendata.aws/sentinel-2-l2a-cogs/ | Multispectral satellite images | COG | UTM 30N (per tile) | 10 m visible bands (per the brief) | Global | Every few days | Reachable (lead dev) | Copernicus Sentinel legal notice: free, full and open; reuse and modification allowed; fixed notice | Planned (ground colour) |
| 9 | Gibraltar GeoPortal vector & imagery services (WMS/WFS) | HM Government of Gibraltar: ITLD, Technical Services Dept (GLIS basemap) | https://www.geoportal.gov.gi/ ; services at http(s)://download.geoportal.gov.gi/geoserver/{wms,wfs} | ~90 layers: `gibgis:buildings_py`, `structures_py`, `thoroughfare_pl`, `transport_py`, `hypsography_pl`, `inspire:EL_Contourline`, `vegetation_py`, `landformnatural_py`, `landformmanmade_py`, `aerial2013_v3` (Aug 2013), `aerial2003`, basemaps, addresses, cadastral parcels | WMS/WFS (GeoServer) | **EPSG:25830** (verified: web viewer config `projection: 'EPSG:25830'`) | Vector; imagery GSD unverified | Gibraltar | Buildings "from 2003/2004/2013 aerial photography, 2008/2010/2013 ground surveys and digital plans" (layer abstract via third-party Spatineo directory; **live capabilities unverified**) | **Blocked: HTTP 403** from the Government's F5 firewall (do not bypass) | "All rights reserved". Reproduction or distribution needs prior approval. Spatineo lists AccessConstraints "geossNonCommercial" (**unverified against live service**) | Planned **only with written permission** |
| 10 | GeoPortal terrain model `DTM_Union_ONLY_LAND_nd6` | HM Government of Gibraltar | https://viewers.geoportal.gov.gi/3dviewer/ (Qgis2threejs export) | Land-only DTM used by the 3D viewer | Embedded in JS (not a download) | EPSG:25830 (verified in file header) | Viewer copy is a 513×513 grid over ~3.2 × 5.2 km; source resolution **unknown** | Gibraltar land | Files last modified 2021-04-09 | Viewer reachable | All rights reserved | **No** (do not extract). Ask for it in the permission email |
| 11 | Gibraltar Topographical Map 1:2000 / 1:5000 | HM Government of Gibraltar (Technical Services) | https://www.geoportal.gov.gi/index.php/downloads/publications | Printed topographic maps | PDF (1:2000 file `1in2000map2019.pdf`) | Grid not stated | — | Gibraltar | 2019 | Reachable | © 2019 ITLD, all rights reserved | Reference only (looking, not tracing) until permission |
| 12 | Overture Maps buildings theme | Overture Maps Foundation | s3://overturemaps-us-west-2 ; https://docs.overturemaps.org/ | Building footprints and parts, some heights; conflated from OSM (top priority), Esri Community Maps, Microsoft, Google, Spanish national data and others | GeoParquet | EPSG:4326 | Vector | Global | Monthly releases | Reachable (lead dev) | Buildings theme **ODbL**; per-source attributions | Candidate (gap-fill, keep separate from OSM) |
| 13 | Microsoft Global ML Building Footprints | Microsoft | https://github.com/microsoft/GlobalMLBuildingFootprints | ML-derived footprints, some height estimates | GeoJSONL by quadkey | EPSG:4326 | Vector | Quadkey `033113000` (covers Gibraltar) has a 2.7 MB "Spain" file. **Gibraltar buildings inside it unverified** | Files dated 2026-02-23 | Reachable | **CDLA Permissive 2.0** (per Microsoft README; Overture's page says ODbL, so the two disagree) | Candidate |
| 14 | Google Open Buildings | Google Research | https://sites.research.google/gr/open-buildings/ | ML footprints | CSV | EPSG:4326 | Vector | Africa, S & SE Asia, Latin America, Caribbean: **not Europe** | — | Not tested | CC BY 4.0 or ODbL (user's choice) | No (no coverage) |
| 15 | Historical maps: King's Topographical Collection (British Library) | British Library | https://www.ministryforheritage.gi/gibraltar-maps-and-plans/the-kings-topological-collection | 18th-century plans of Gibraltar | Scans | None (needs georeferencing) | — | Gibraltar | 1500-1824 collection | Page found by search, not fetched | Reported as freely available or public domain via BL Flickr releases. **Check each item's own statement** | Reference only |
| 16 | Wikimedia Commons photos | Individual authors | https://commons.wikimedia.org/ | Photos of buildings and streets | JPEG etc. | — | — | Gibraltar | Various | Not tested | **Per file** (CC BY, CC BY-SA, PD, …) | Reference only |
| 17 | Mapillary street-level imagery | Mapillary (Meta) / contributors | https://www.mapillary.com/ | Street-level photos | Images via API | — | — | Patchy | Various | Help pages returned 403 to our fetcher | CC BY-SA 4.0 (secondary sources; official page not read) | Reference only |
| 18 | KartaView street-level imagery | KartaView (Grab) / contributors | https://kartaview.org/ | Street-level photos | Images | — | — | Patchy | Various | Not tested | CC BY-SA 4.0 (OSM wiki; official terms not read) | Reference only |
| 19 | UKHO Admiralty charts | UK Hydrographic Office | https://copyright.ukho.gov.uk/ | Bathymetry, coastline, harbour works | Charts / S-57 | — | — | Gibraltar waters | — | Not tested | Crown copyright; reproduction needs a UKHO licence (free licence possible for low-value commercial products, per UKHO guide) | No |
| 20 | EMODnet Bathymetry DTM 2024 | EMODnet Bathymetry Consortium (EU) | https://emodnet.ec.europa.eu/en/bathymetry | Sea-floor depth grid | GeoTIFF/ASCII etc. | EPSG:4326 | 1/16 arc-minute (~115 m); some higher-resolution survey grids | European seas | 2024 | Page reachable | **Licence unverified** (page links to separate terms of use) | Candidate (sea floor seen from cliffs) |
| 21 | PSMSL Gibraltar tide gauge (station 981) | PSMSL / National Oceanography Centre | https://psmsl.org/data/obtaining/stations/981.php | Monthly mean sea level | Text | — | — | Gibraltar harbour | 1961-2014 | Reachable | Free (terms not checked) | Datum research only |
| 22 | Northern Defences drone LiDAR survey | HM Government of Gibraltar | https://www.gibraltar.gov.gi/press-releases/northern-defences-lidar-survey-and-current-works-8552023-9460 | LiDAR 3D model of the Northern Defences | Unknown | Unknown | Unknown | Northern Defences only | Announced 2023-12-11 | Not published | Not published | Ask in permission email |

Not in the table: LandScope (https://www.land-scope.com/gibraltar/) is a
commercial firm that says it holds a mobile-mapping LiDAR and photo dataset of
Gibraltar. We only saw this in a search snippet (**unverified**). Their data
would cost money and need a licence.

## Notes per source

**GeoPortal (rows 9-11).** The GeoPortal home page lists max height 426 m,
planar area 6.55 km², surface area 8.40 km², roads > 48 km, tunnels ~52 km. Its
web viewer config (`https://viewers.geoportal.gov.gi/webviewer/DefaultOptions.js`)
uses EPSG:25830, map extent `284014, 3997356 – 292596, 4005938`, and shows the
credit "© HM Government Of Gibraltar 2022" on every layer. The Technical
Services Department "is solely responsible for the upkeep and maintenance of the
GLIS basemap" (GeoPortal participants page). The 90-layer list comes from the
Spatineo directory (`https://directory.spatineo.com/service/12315/`), which
mirrors the service's GetCapabilities ("last updated 2026-10-25"). We could
not read the live GetCapabilities because of the 403.
*Confirm by:* from a home PC in QGIS, add the WMS/WFS and read the
capabilities' `AccessConstraints`, the layer list, and whether `buildings_py`
has a height attribute.

**No Gibraltar open-data portal found.** Web searches found no
`data.gov.gi` or equivalent and no open licence for Government of Gibraltar
data. Our proxy returned 502 for `data.gov.gi`, `www.data.gov.gi` and
`opendata.gov.gi`, so we can't tell whether those hosts exist.
`https://www.gibraltar.gov.gi/open-data` returns 404. Treat all Gibraltar
Government data as all-rights-reserved until the Government tells us otherwise.

**IGN accuracy (rows 3-4).** The MDT05 metadata gives a vertical accuracy entry
of "rango=[0,50] cm" and the MDT02 metadata gives "rango=[0,25] cm". These are
national figures for the LiDAR-derived product. **No accuracy figure is
published for the photogrammetric Gibraltar sheets.** Water areas are
"interpolated and edited to a constant height … reliability is low".

**IGN LiDAR vintage over the Campo de Gibraltar (row 5).** The SCNE product table
lists 2nd-coverage LiDAR for Andalucía under the years 2020 and 2021, but the exact flight
over San Roque / La Línea is **unverified**.
*Confirm by:* PNOA coverage viewer or the LAZ file metadata from the CNIG
download centre (try from a home PC).

**Copernicus GLO-30 (row 7)** is a surface model (it includes roofs and trees)
at 30 m. Over Gibraltar its maximum is 369.7 m, which badly flattens the ridge. Use it
only to sanity-check MDT05 or to fill the sea edge. The AWS copy carries the
older WorldDEM-30 licence. A newer Copernicus licence exists (Sinergise forum,
2024-04-26) but has not been applied to the AWS bucket.

## Vertical datum

* **IGN heights:** the MDT02 metadata says "In the Peninsula, heights refer to
  the mean sea level of the Mediterranean at Alicante. EPSG code: 5782" (Ceuta
  and Melilla also use EPSG:5782). The MDT05 record does **not** state its
  vertical datum. That it uses EPSG:5782 too is likely but **unverified**, and so is the
  vertical reference used for the photogrammetric Gibraltar sheets.
* **Gibraltar local datums:** Gibraltar's Ministry of Heritage says "Today the
  Chart Datum and Principal Datum are no longer on the same level, the former
  being below the latter by 0.146m", and that in the early 1860s Chart Datum
  and Ordnance Datum "appear to have been one and the same"
  (`https://www.ministryforheritage.gi/heritage-and-antiquities/tide-gauge-triangular-marker-detached-mole-1609`).
  PSMSL station 981 (Gibraltar) gives "RLR(1964) is 9.7m below BM BoltAP"
  and notes a "large apparent datum shift" when a new gauge was installed in 1993.
  The current radar gauge on the North Mole dates from April 2004 (NTSLF).
* **Gibraltar vs Alicante offset: not found.** We have no published number.
  *Confirm by:* asking the GeoPortal administrator / Technical Services which
  vertical datum the GLIS basemap and their DTM use (included in the email
  draft in `LICENSING.md`), or by levelling against a known Gibraltar benchmark.
* Practical effect: for a walking simulator an offset of a few decimetres is
  invisible. It matters only where the sea surface (z = 0) meets the harbour
  walls and beaches.

## Selected sources and why

| Layer | Source | Why |
|---|---|---|
| Terrain | IGN MDT05 (row 3) | Only open, commercially usable model that resolves the Rock (419 m vs official 426 m). CC BY 4.0. Same CRS as the project's interchange CRS. Photogrammetric over Gibraltar (see correction 1). |
| Buildings, roads, paths, steps, walls, POIs | OSM via daily extract (row 1) | Best open vector detail. Commercial use is allowed under ODbL with attribution and share-alike of the processed data (see `LICENSING.md`). |
| Ground colour | Sentinel-2 L2A (row 8) | Free, commercial use allowed, simple notice. 10 m is coarse, so use it for broad tint only. |
| Validation | Copernicus GLO-30 (row 7), GeoPortal viewers (looking only) | Cross-checks; nothing from the GeoPortal is copied into our data. |
| Upgrade path | GeoPortal buildings/contours/DTM/aerial 2013 (rows 9-10) | Highest-accuracy local data, but **only after written permission** that covers commercial release. |

## Sources we must not use

These must not be used as game assets, traced, extracted, or used to derive
geometry. Looking at them in a browser is fine. Copying from them is not.

* **Google Maps / Google Earth / Street View / Photorealistic 3D Tiles.**
  Google's Maps Additional Terms forbid users to "mass download or create bulk
  feeds of the content", "create a new product or service based on Google
  Maps", or "use Google Maps to create or augment any other mapping-related
  dataset" (`https://www.google.com/help/terms_maps/`). The Map Tiles API
  policies forbid "Geodata extraction or resale" and "Offline uses". Your own 3D
  objects may sit over the tiles only "as long as the 3D objects aren't extracted, traced,
  or otherwise derived by hand or machine from Photorealistic 3D Tiles"
  (`https://developers.google.com/maps/documentation/tile/policies`).
  Verified.
* **Apple Maps / Look Around, Bing Maps / Bing aerial, Esri World Imagery and
  Esri 3D scenes.** Their terms were **not re-read this session**. None of
  them publishes an open licence for its imagery or 3D content, so treat all of them as
  forbidden for extraction or game assets unless you hold a written licence.
  (Some allow tracing *into OpenStreetMap* under special permissions. That
  permission is for OSM editing, not for our game.)
* **GeoPortal data obtained any way other than with permission**, including
  extracting the 3D viewer's embedded DTM, scraping WMS tiles, or getting
  round the 403 with other hosts, proxies or spoofed headers.
* **FABDEM** (a "bare-earth" Copernicus derivative): non-commercial and
  share-alike, per search results. Not compatible with a commercial release.
* **UKHO Admiralty charts** without a UKHO licence.
* **Wikimedia Commons / Mapillary / KartaView pixels as textures** unless the
  specific file's licence and its share-alike terms have been accepted and
  recorded (see `LICENSING.md`). Using them as visual reference while modelling
  is the intended use.
