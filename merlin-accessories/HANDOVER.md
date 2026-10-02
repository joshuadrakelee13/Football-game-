# Handover: Merlin Accessories website v1.1

For a new Claude Code session with no earlier conversation.

## State of play

The site is a **content-complete 1:1 of merlinaccessories.com** (copied from the live pages in
October 2026) with the v1.1 design and navigation kept. Do not redesign it. The owner
(joshuadrakelee13) is non-technical: they open the site by downloading the GitHub zip and
double-clicking `merlin-accessories/index.html`, so generated HTML is committed.

Open decisions for the owner:
1. **Online product catalogue.** The live site (Wix Stores) has 206 products in 24 categories
   (`/product-page/...`, `/category/...`). Product pages show name, brand, description, features
   and an image, **no prices and no cart** (enquiry by phone/email). It is not built; links go to
   the live site. Data is already extracted if wanted: see "Re-scraping" below.
2. **Pages left out** because they are unlisted, stale or empty on the live site: `/blackfriday`
   and `/blackfriday-1` (dated one-off deals with prices), `/promotions` (empty),
   `/fixingsandtoolsinsouthampton` (template text), `/blank` (a temp page).
3. Live inconsistencies kept out: the live "Expert guidance…" strip says Mon-Thurs 07:30-17:30
   and Fri 07:30-17:00, while the header, footer and Contact say Mon-Fri 07:30-17:00. The build
   uses the latter everywhere. The Christmas tool-repair notice (assessed from Jan 14th 2026) is
   still live, so it is shown.

## How the build works

No dependencies. Node 18+.

```
node merlin-accessories/build.mjs        # writes every page (also: npm run merlin:build)
npm start                                # http://127.0.0.1:5173/merlin-accessories/
node merlin-accessories/tools/check.mjs  # Chromium end-to-end check (also: npm run merlin:check)
```

| Path | Role |
| --- | --- |
| `src/content.mjs` | **All words and facts** (company, categories, spotlights, tool repair, about, team, delivery, FAQ, downloads, charts, bulk deal, home slides/tiles, legal, form options) |
| `src/ranges.mjs` | Sub-ranges (name, text, product tags, logos, photo, call/view/brochure buttons) for each product page |
| `src/posts.mjs` | The Latest News posts as content blocks |
| `build.mjs` | Templates for every page, header, menus, footer, search index |
| `assets/css/brand.css` | **Only** place brand colours and fonts live |
| `assets/css/site.css` | Layout and components |
| `assets/js/site.js` | Menus, drawer, search, open/closed status, converter, forms (compose an email), newsletter, slideshow |
| `assets/img/` | Real photos and logos from the live site (WebP/JPEG/PNG) |
| `tools/check.mjs` | Crawl, anchors, **every image loads**, menus, search, 390px width, file:// links |
| `*/index.html`, `assets/js/search-index.js` | **Generated.** Never edit by hand |

Image paths in content are relative to `assets/img/`; an extension is optional (the build finds
`.webp`, `.jpg` or `.png`). Links copied from the live site are absolute; `resolveHref()` in
`build.mjs` turns the ones we have rebuilt into local links and leaves brochures (PDFs on the live
site), the online catalogue and other sites absolute (they open in a new tab).

## Rules that held

- **Never invent content.** If it is not on the live site, leave it out.
- Brand values only in `brand.css`; words only in `src/`.
- Keep the live URL slugs (`/products/<slug>`, `/post/<slug>`, `/faq-s`, `/koniguk`, …).
- Links must work from disk (`file://`): `site.js` adds `index.html` to folder links.
- Every page must pass `tools/check.mjs`. Google Fonts and Maps fail in the sandbox's headless
  Chromium; that is the sandbox.
- Accessibility already in place (skip link, focus, menus, search combobox, slideshow pause and
  reduced motion, accordions as `<details>`). Keep it.
- No cookie banner is reproduced: the build sets no cookies. The Google Maps embed is the only
  third party.
- No pull request unless the owner asks. Branch: `claude/vibrant-pascal-9fogfu`.

## Re-scraping the live site

`https://www.merlinaccessories.com/sitemap.xml` lists everything. Pages are server-rendered by
Wix, so `curl` returns the text; JS-built bits (downloads, forms' dropdowns) need a browser.
Images are `static.wixstatic.com/media/<id>~mv2.<ext>`; add `/v1/fit/w_800,h_2400,q_85/file.<ext>`
to resize. Wix throttles bursts (`ERR_TOO_MANY_RETRIES`, 403): go slowly and retry.
