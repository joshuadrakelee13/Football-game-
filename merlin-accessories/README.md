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
- **Products mega menu.** All ten categories with one-line descriptions, plus featured ranges,
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
- **Brands page** listing every brand and where it is stocked. The Brands menu links straight
  to each one.
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

## Still to swap in from the live site

The live site could not be reached from the build environment. The colours were taken from
a screenshot of its header. These are stand-ins:

- **Logo:** `assets/img/logo.svg` and `favicon.svg` are drawn approximations. Replace the files.
- **Fonts:** Montserrat and Open Sans are set in `brand.css`. Change them there if the live
  site uses something else.
- **Images:** drop these into `assets/img/` and they appear automatically. Until then a neutral
  panel shows.
  - `banner-tool-repair.jpg` (home banner, left side)
  - `promo-tool-repair.jpg`, `promo-sanding-belts.jpg`, `promo-silicone.jpg`, `promo-products.jpg` (home tiles)
- **Copy and files:** search `TODO` in `src/content.mjs`. This covers:
  - the Abrasives, Power Tool Accessories and Building Hardware descriptions
  - the remaining Meet the Team members
  - the Downloads PDF links (until they are added, each card offers "Request a copy" by email)
