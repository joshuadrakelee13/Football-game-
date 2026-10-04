# Merlin Sales: build plan

The spec is the Merlin Sales build brief. This file records how it is being built and the
decisions the owner has confirmed. Approved on 03/10/2026.

## Decisions confirmed by the owner

1. **Font:** IBM Plex Sans, stored inside the app in `vendor/ibm-plex-sans/` with its licence
   (SIL Open Font License). No Google Fonts or other font services.
2. **Libraries:** SheetJS, Leaflet and Leaflet.markercluster, all kept in `vendor/` with their
   licence files. Charts are drawn by hand in SVG, so there is no chart library.
3. **SheetJS** comes from the official build at cdn.sheetjs.com (version 0.20.3), not the
   outdated npm package.
4. **Real column headings:** not available yet. The importer is built and tested with small fake
   fixture files. The real headings for the customer, sales and stock exports will be added
   after the owner's visit to Merlin (brief section 14).
5. **Money at stake** on Needs attention, all editable in Settings:
   - Overdue order: the customer's spend in the last 12 months
   - Declining spend: the drop, scaled up to a year
   - Lapsed product: what they spent on that product group in the previous 12 months
   - Cross-sell gap: typical (median) spend on that group among similar accounts
   - Lost: their spend in the 12 months before they stopped, shown in a separate list
6. **What leaves this computer:** postcodes sent to postcodes.io for the map, and the map's
   background tiles loaded from OpenStreetMap (which reveals the area being viewed, but no
   customer data). The README says both.

## Notes from the repo

- `merlin-accessories/` is not on `main` or this branch (it lives on unmerged branches). The
  brand colours were copied from its `brand.css`: navy `#243077`, blue `#0070af`.
- The repo's `npm start` server already serves `http://127.0.0.1:5173/merlin-sales/`.
- The demo gets its own small server inside `merlin-sales-demo/` on port 5174, so the rest
  of the repo is untouched.

## Structure

```
merlin-sales/
  index.html, README.md, PLAN.md
  package.json           npm start / npm test / npm run check, run from this folder
  css/tokens.css         design tokens (colour, type, spacing, radius)
  css/app.css            layout and components
  vendor/                SheetJS, Leaflet, Leaflet.markercluster, IBM Plex Sans
  js/
    config.js            database name and app constants (the demo build changes these)
    app.js               navigation, screen switching, shell
    db/                  browser storage (IndexedDB)
    import/              read, identify, map, clean, join, check, profiles: plain functions
                         with no browser code, so Node tests run exactly what the app runs
    model/               imported data combined with manual edits
    signals/             one file per signal (step 5)
    views/               one file per screen
    ui/                  formatting, tables, charts
  tests/                 fake fixtures, Node tests, headless browser check
  tools/make-demo.mjs    builds merlin-sales-demo/ (step 10)
```

## Build order

| # | Step | Status |
|---|---|---|
| 1 | Folder, README, vendor libraries, design tokens, empty screens with navigation | Done |
| 2 | Fake test fixture files covering every cleaning rule | Done |
| 3 | Importer: identify, map, join, clean, check, save, profiles, delete data. **Stop for review.** | |
| 4 | Customers list and customer page, manual edits and bulk edit | |
| 5 | Signals and the Needs attention home screen | |
| 6 | Products, stock views and Reps | |
| 7 | Map | |
| 8 | Settings | |
| 9 | Design polish (brief section 11), then the full tests (section 12) | |
| 10 | Demo app and the sample data generator | |
| 11 | AI features, only when the owner asks | |

## Design token plan (reviewed against brief section 11)

The idea: a well-kept ledger. White paper, fine rules, figures in neat columns, navy binding
down the left side. The one memorable detail is borrowed from bookkeeping: a single rule above
a total and a double rule beneath it, used wherever a figure is meant to reconcile (the import
check, table totals). A zero difference on the import check gets the double rule.

- **Colour.** Navy `#243077` for the navigation rail, primary buttons and links. One cool grey
  scale for ink, rules and surfaces. White surfaces only, no coloured card backgrounds, no
  gradients, no glass. Brand blue `#0070af` only for the keyboard focus ring.
- **Status colours** only for health, and each also has its own shape so they work without
  colour: good (filled circle, green), watch (triangle, amber), at risk (diamond, red),
  lost (hollow circle, grey). The red also marks import errors, as the brief asks.
- **Type.** IBM Plex Sans, regular 400, medium 500, semibold 600. Base 14px for density. Scale
  12 / 13 / 14 / 16 / 20 / 24. Tabular figures everywhere numbers appear; money right-aligned.
  Hierarchy by size and weight, not colour.
- **Shape.** Radius varies by purpose: 2px on inputs and small controls, 4px on buttons, 6px on
  panels and the drop area. Borders rather than shadows; a shadow only on floating menus.
- **Space.** 4px grid. Table rows 32px.
- **Motion.** Colour changes only (120ms), switched off for reduced motion.
- **Copy.** Sentence case, UK English, no emoji, no exclamation marks, no all-caps labels,
  buttons that say exactly what they do.
