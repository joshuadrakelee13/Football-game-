# Merlin Sales

A daily sales view for Merlin Accessories. Simon drops in the files he exports from Merlin ERP,
and the app checks them, joins them and shows which customers need attention.

## How to open it

You need Node.js 18 or newer installed once. In a terminal, from the top folder of this repo,
type `npm start` and press Enter, then open **http://127.0.0.1:5173/merlin-sales/** in Chrome,
Edge or Firefox. Keep the terminal window open while you use the app; press Ctrl+C in it to stop.
Opening `index.html` by double-clicking it will not work, because browsers do not let a page
opened straight from disk keep its data reliably.

## Importing

1. Export the customer list, the sales lines (or invoice headers and invoice lines) and,
   if you want stock views, the stock report from Merlin ERP as .csv or .xlsx.
2. Open **Import** and drop the files (up to 4 at once).
3. Check each file's kind and its column matches. Anything marked with a red star is needed.
4. Check the totals. Type the net total from a Merlin ERP sales report for the same dates
   into **Total from Merlin report**: a zero difference means nothing was lost. Every skipped
   row is listed in a download, with the reason.
5. Click **Import**. Tick **Save these column matches** and next time the same exports go
   straight to step 4.

## Where the data lives

Everything you import is stored inside your browser on this computer (in its built-in
database, called `merlin-sales`). Nothing is uploaded. Using a different browser or computer
means importing again. Settings has a **Delete all data from this computer** button.

Only two things ever leave this computer:

- **Postcodes**, sent to [postcodes.io](https://postcodes.io) to place customers on the map.
  Only the postcode is sent, never a name or any sales figure, and each postcode is looked up
  once and then remembered.
- **Map tiles**, the background map pictures, loaded from OpenStreetMap. This reveals which
  area of the map is being looked at, but no customer data.

Never save real export files inside this repo. Files named `*.real.*` and anything in an
`exports/` folder are ignored by git as a safety net.

## For developers

- Plain HTML, CSS and JavaScript modules. No build step and no npm install.
- Libraries are kept in `vendor/` with their licences: SheetJS 0.20.3 (from cdn.sheetjs.com),
  Leaflet 1.9.4, Leaflet.markercluster 1.5.3 and IBM Plex Sans.
- From this folder: `npm test` runs the importer tests on the fake files in `tests/fixtures/`,
  and `npm run check` opens the app in a headless browser and imports them.
- The plan and the decisions behind it are in [PLAN.md](PLAN.md).
