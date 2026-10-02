# Merlin Accessories — website v1.1

A rebuild of [merlinaccessories.com](https://www.merlinaccessories.com/) that keeps
Merlin's branding, content and page structure and reworks the navigation and usability.

## Running it

```
node merlin-accessories/build.mjs     # regenerate the pages
npm start                             # then open http://127.0.0.1:5173/merlin-accessories/
```

No dependencies. The output is plain static HTML with relative links, so it can be hosted
anywhere, including GitHub Pages or a sub-folder.

## How it is put together

| File | What it holds |
| --- | --- |
| `src/content.mjs` | Every word and fact: categories, hours, contact details, news, team and downloads |
| `build.mjs` | Page templates; writes `<page>/index.html` for every page plus the search index |
| `assets/css/brand.css` | **The only place brand colours and fonts are set** |
| `assets/css/site.css` | Layout and components |
| `assets/js/site.js` | Menus, search, open/closed status, converter and enquiry form |
| `assets/img/` | Logo, favicon and image slots |

Page URLs match the live site's (`/products/adhesivesandchemicals`, `/toolrepairservice`,
`/meettheteam`, `/koniguk` …), so existing links and bookmarks keep working.

## What changed from v1.0 (UX)

- **The same header, made to work harder.** It keeps the navy masthead (logo, search, phone,
  hours) and the blue menu bar with the same items. When you scroll, the menu bar sticks to
  the top and picks up a small logo, a search button and the phone number, so navigation is
  always within reach.
- **Products mega menu.** All twelve categories with one-line descriptions, plus featured ranges,
  Tool Repair and Bulk Deals, one hover or tap away. Hover intent stops it flickering, and it
  works fully from the keyboard (chevron toggles, arrow keys, Esc).
- **Instant search** across categories, sub-ranges, products, brands and pages. Open it from
  the masthead or press `/` or `Ctrl/⌘ K`. Arrow keys move through results and Enter opens one.
  A search with no results offers to call or send an enquiry.
- **Live "open now / closed — opens Mon 07:00" status**, worked out in UK time, in the header,
  the home page, the mobile menu and the contact page. Today's row is highlighted in the hours
  table.
- **Category pages built for browsing:**
  - breadcrumbs
  - a sticky list of all categories in a sidebar (a swipeable row on phones)
  - "Jump to" chips for each sub-range
  - Enquire links that pre-fill the email subject
  - previous/next category links
- **Brands page** with the brand pages and the trading-partner logo wall.
- **Phones:**
  - a slide-in menu with accordions
  - a thumb-reach bar for Call, Directions, Email and Search
  - full-screen search
- **Contact:** tap-to-call and email cards, a map, and an enquiry form that opens a ready-to-send
  email.
- **Conversion charts:** a live unit converter, plus inch fractions, screw gauge and
  feet-to-metres tables.
- **Smooth page changes** (cross-document view transitions), link prefetching on hover,
  skip link, visible focus states and reduced-motion support.

## Content: 1:1 with the live site (v1.1 content pass)

Every page, menu item, wording, brochure, photo, logo and form field on
merlinaccessories.com is in this build, copied from the live pages (checked October 2026):

- real logo, favicon, banners, tile photos, range photos, brand logos, team photos, brochure
  covers and the conversion chart images (all under `assets/img/`)
- brand colours read from the live CSS (`brand.css`)
- every sub-range on every product page (with its brands, brochure and call/view buttons),
  Blum, Konig, Moldex PPE, Soudaclean, Made to order sanding belts, Delivery, FAQ's, Bulk Buy
  Silicone Pallet Deals, the four Latest News posts, 13 team members, the full About story,
  the 14 brochures, Terms / Privacy / Cookie pages and the footer details

Still different from the live site, on purpose:

- **Fonts.** The live site uses Proxima Nova and DIN Next (licensed through Wix). Montserrat and
  Nunito Sans stand in. Change `--font-display` / `--font-body` in `brand.css`.
- **Online product catalogue** (206 products in 24 categories on the live site) is not rebuilt.
  Links to it go to the live site.
- **Forms** open the visitor's email app (there is no server). The live site's forms and newsletter
  sign-up post to Wix.
- **Brochure PDFs** are linked from the live site (about 300 MB in total), not copied in.
