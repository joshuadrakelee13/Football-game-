# Handover: Merlin Accessories website v1.1

Read this before touching anything. It is written for a new Claude Code session that
has none of the earlier conversation.

## 1. The job

The owner of this repo (joshuadrakelee13) asked for a **Version 1.1 of
https://www.merlinaccessories.com/**: Merlin Accessories Ltd, a trade supplier of
sealants, fasteners, fixings and power tools in Winchester.

What they asked for, in their words:

- "keep the exact same assets, colours, fonts, branding and overall visual identity"
- "Version 1.1 of the existing website rather than redesigning it from scratch"
- "improving the UI and UX … easier to navigate, less clunky, more intuitive and more seamless
  when moving between pages, menus and different sections"
- "Keep the existing content and structure where appropriate"

**Your task now:** make the content a **real 1:1 with the live site**, so that every piece
of information on merlinaccessories.com is also in this build. The user's words: "add any
details which you missed so its a real 1:1 so all the info listed is there". **Keep
everything already built.** The user is happy with the design and UX ("This is brilliant").
This is a content-completion pass, not a redesign.

## 2. Why things are the way they are

The first session's network policy **blocked** `www.merlinaccessories.com`,
`static.wixstatic.com` and `web.archive.org`, even after the user changed settings. A fresh
session should pick up the new policy. Check this first:

```
curl -sS -o /dev/null -w "%{http_code}\n" https://www.merlinaccessories.com/
curl -sS -o /dev/null -w "%{http_code}\n" https://static.wixstatic.com/
```

If either prints `000` or `403`, access is still blocked. Tell the user: they open the
environment menu in the session title bar, choose Edit, then Network access, and allow both
hosts. Do not guess content as a workaround.

Without access, the content came from two places:

1. **Web search snippets** of the live pages.
2. **One screenshot of the live home page** the user pasted. It showed:
   - a navy masthead with the logo on the left, a search box in the centre, and the phone
     number `01962 842 002` with "Monday - Friday 07:30 - 17:00 / Trade Counter 07:00 - 17:00"
     on the right
   - a mid-blue menu bar: **Home, Products ▾, Tool Repair Service, Brands ▾, About ▾,
     Downloads ▾, Contact, Bulk Boxes & Pallet Deals**
   - a wide Tool Repair banner. The left side is a photo with the Bosch, DeWalt, Makita, Metabo
     and Milwaukee logos. The right side is navy, reading "Tool repair *Service*" with the
     checklist Battery replacement / Motor & Gearbox repairs / Switch & Trigger replacement /
     General maintenance & Servicing, and a white "Find out more ▸" button.
   - four tiles: "Tool repair Service", "SANDING BELTS MADE TO ORDER" (Mirka),
     "SILICONE SPECIALISTS", and a Merlin logo tile reading "Over 8,000 essential products that
     trade professionals rely on every day." Each has a white footer strip with blue diagonal
     stripes and a link label.
   - a blue cookie banner at the bottom (not reproduced: the build sets no cookies of its own)

The colours in `assets/css/brand.css` were sampled from that screenshot:
- masthead navy `#272f7a`
- menu bar blue `#0e73aa`
- logo cyan `#29abe2`

**The logo and favicon are hand-drawn approximations, the fonts (Montserrat and Open Sans) are
guesses, and there are no real photos.** These are the main things to replace.

## 3. How the build works

No dependencies, no framework. Node 18+.

```
node merlin-accessories/build.mjs        # writes every page (also: npm run merlin:build)
npm start                                # serves the repo → http://127.0.0.1:5173/merlin-accessories/
node merlin-accessories/tools/check.mjs  # Chromium end-to-end check, see §6 (also: npm run merlin:check)
```

| Path | Role | Edit? |
| --- | --- | --- |
| `src/content.mjs` | **All words and facts**: company details, hours, categories (with `groups` = sub-ranges), spotlights, tool repair, about, team, news, downloads, bulk deals, home promo tiles | Yes: most of your work goes here |
| `build.mjs` | Templates for every page, header, mega menu, footer, search index. Writes `<slug>/index.html` and `assets/js/search-index.js` | Yes, for new page types or sections |
| `assets/css/brand.css` | **Only** place brand colours and fonts are defined (CSS custom properties) | Yes: set the real fonts and colours here |
| `assets/css/site.css` | Layout and components. Uses only the tokens from brand.css | Only when needed |
| `assets/js/site.js` | Menus, drawer, search, live open/closed status, converter, enquiry form, file:// link fix | Rarely |
| `assets/img/` | `logo.svg`, `favicon.svg` (approximations), plus image slots (see §5) | Yes |
| `tools/check.mjs` | Test script | — |
| `*/index.html`, `assets/js/search-index.js` | **Generated.** Never edit by hand; rerun the build | No |

The build deletes and rewrites only the page folders it generates. It never touches `src/`,
`assets/` or `tools/`.

**Commit the generated HTML too.** The user opens the site by downloading the repo zip from
GitHub and double-clicking `index.html`, with no installs, so built pages must be in the repo.

### Page map

URLs deliberately reuse the live site's slugs:

| Live URL | Build | Source |
| --- | --- | --- |
| `/` | `index.html` | live (screenshot) |
| `/products` | `products/` | live |
| `/products/adhesivesandchemicals` | `products/adhesivesandchemicals/` | live |
| `/products/fastenersandfixings` | ✓ | live |
| `/products/screws` | ✓ | inferred from snippets: verify the slug |
| `/products/nailsandstaples` | ✓ | live |
| `/products/abrasives` | ✓ | inferred: verify |
| `/products/siteprotectionandppe` | ✓ | live |
| `/products/powertoolsandhandtools` | ✓ | live |
| `/products/powertoolaccessories` | ✓ | live |
| `/products/gateandfencehardware` | ✓ | live |
| `/products/buildinghardware` | ✓ | inferred: verify |
| `/toolrepairservice` | ✓ | live |
| `/about`, `/meettheteam`, `/latestnews`, `/downloads`, `/conversioncharts`, `/contact` | ✓ | live |
| `/koniguk`, `/soudaclean` | ✓ (shown as "featured ranges") | live |
| `/brands` | ✓ | **new in v1.1** (live has a Brands ▾ menu; check where its items link) |
| `/bulkboxesandpalletdeals` | ✓ | **slug guessed**: use the live one |

Live URLs seen in search results but **not built yet**:
- `/category/all-products`, `/category/tapes`, `/category/touch-up-repair`, `/category/soudal`.
  These are Wix Stores category pages, which suggests the live site has an **online product
  catalogue with individual products**. Find out what is there; it may be the biggest gap.
- Any `/product-page/...` URLs.

## 4. The 1:1 content pass: step by step

1. **Confirm access** (§2). If blocked, stop and tell the user.
2. **Inventory the live site.** Fetch `/sitemap.xml` (Wix sites have one, often split into
   `pages-sitemap.xml`, `store-products-sitemap.xml`, `store-categories-sitemap.xml`,
   `blog-posts-sitemap.xml`). Make a list of every URL and compare it with the page map above.
   Wix pages render server-side, so `curl` returns the text. Images are on
   `static.wixstatic.com/media/<id>~mv2.<ext>`; drop the `/v1/fill/...` suffix to get the
   original file.
3. **For each page, compare word for word** against what the build shows. Put the live copy into
   `src/content.mjs`, replacing the summaries written from search snippets. In particular:
   - every **`// TODO`** in `content.mjs`: Abrasives, Power Tool Accessories and Building Hardware
     descriptions; remaining team members; the Downloads PDF URLs (`file:` field: when set, the
     card shows "Download PDF" instead of "Request a copy")
   - **category `groups`**: several have empty `items: []`. Fill them with the real sub-ranges
     and products listed on each live page, and add sub-ranges that exist live but are missing.
     Group names become `#anchors` and search entries automatically.
   - **brands** per category (`brands: []`). The live Brands ▾ menu lists the real set; check
     whether each brand has its own page live.
   - **Meet the Team**: names, roles, "with Merlin since", photos. A team member with `name: null`
     is a placeholder for the "Key Account & Business Development Manager, with Merlin since
     2000" found in search.
   - **Latest News**: full posts, dates and images. Items have no dates because none were
     available; add `date` and render it if the live site shows dates.
   - **About**: full story. Only the 1980 founding (Mike Carey, £200 budget) and the 1983 move to
     Winnall are confirmed.
   - **Contact**: anything beyond phone, email, address and hours (VAT number, delivery info,
     account forms, social links).
   - **Downloads ▾** menu items. The build has Catalogues & Brochures plus Conversion Charts;
     add whatever the live menu has.
   - **Conversion Charts**: the live page's actual charts. The build's charts (inch fractions,
     screw gauges, feet to metres, live converter) were written in v1.1 because the live content
     was unknown. Keep the converter, but make sure the live tables are all present.
   - **Bulk Boxes & Pallet Deals**: real deals and wording.
   - **Footer**: any links, accreditations, payment or trade logos, social icons and legal text
     (privacy policy, terms, cookie policy pages, if they exist, need building too).
   - the home page's banner and tiles beyond the four seen. Check whether the banner is a
     slideshow with more slides.
   - **any Wix Store products and categories** (step 2). If there is a real product catalogue,
     discuss with the user how to represent it before building, because it is a big
     structural addition. A sensible v1.1 approach is product cards within each category page,
     data-driven from `content.mjs`, keeping search indexing.
4. **Real assets:**
   - Download the real **logo** and save it as `assets/img/logo.svg`, or as a PNG/WebP and change
     the `logo()` helper in `build.mjs`. It sits on navy, so it needs the white version.
   - Download the **favicon**.
   - Download the **banner and tile photos**; filenames are in §5.
   - Download category and product images. Add an `image` field in `content.mjs` and render it on
     cards; keep `loading="lazy"` and width/height.
   - Find the **real fonts**: look at the page's CSS or `<link>`s; Wix often uses
     `madefor-display`, `avenir-lt-w01`, `proxima-n-w01` and similar. Set them in `brand.css`.
     If they are Wix-licensed fonts, pick the closest Google Font and say so.
   - **Re-sample colours** from the live CSS and correct `brand.css` if needed.
5. **Rebuild, run `tools/check.mjs`, look at the screenshots** in `screenshots/merlin/`
   (git-ignored), then commit and push.
6. Report to the user in plain language: what was added, and anything on the live site that was
   deliberately left out and why.

## 5. Image slots

Each slot is an `<img onerror="this.remove()">` over a neutral panel, so a missing file
degrades gracefully. Drop files into `assets/img/` with these names:

| File | Where |
| --- | --- |
| `banner-tool-repair.jpg` | Home banner, left half (the live photo already includes the brand logos; remove the `.banner-brands` text strip in `build.mjs` if so) |
| `promo-tool-repair.jpg` | Home tile 1 |
| `promo-sanding-belts.jpg` | Home tile 2 (has a yellow "Mirka" badge overlay; remove it if the photo shows the logo) |
| `promo-silicone.jpg` | Home tile 3 |
| `promo-products.jpg` | Home tile 4 |

If the live tiles are single flattened images (text baked in, as the screenshot suggests), it
is better to keep the HTML text, since it is accessible, sharp and searchable, and use only the
photographic part. Ask the user if unsure.

## 6. Ground rules that held in session 1. Keep them.

- **Never invent content.** Session 1 removed made-up sub-products after drafting them.
  Unknown means `// TODO`, not plausible filler. The only additions not on the live site are
  UX ones: the converter, open/closed status, Brands page and similar.
- **Brand values only in `brand.css`**, words only in `content.mjs`.
- **Keep the live URL slugs.**
- **Links must work from disk.** `site.js` adds `index.html` to folder links under `file://`.
  Any link built in JS must go through `local()`.
- **Every page must pass `tools/check.mjs`**: no broken links or anchors, no sideways scroll at
  390px, menus and search working, and file:// links working. The Google Fonts and Maps requests
  fail with certificate errors in the cloud sandbox's headless Chromium; that is the sandbox, not
  the site.
- Accessibility already in place; keep it:
  - skip link and visible focus
  - menus with `aria-expanded`, Esc, arrow keys and hover intent
  - search as a combobox/listbox
  - `prefers-reduced-motion`
- Do not reproduce the Wix cookie banner unless something on the page sets cookies; the Google
  Maps embed on Contact is the only third party. If the user wants consent handling, gate the
  map behind a click.

## 7. UX features already built (don't lose them)

- **Header:** a navy masthead with logo, search, phone, hours and a live "Trade counter: Open
  now · until 17:00 / Closed · opens Mon 07:00" status in UK time. Below it, a blue menu bar
  that sticks on scroll and gains a mini logo, a search icon and the phone number.
- **Menus:**
  - Products mega menu: 10 categories with icon and description, featured ranges, Bulk Deals,
    Tool Repair card and "View all".
  - Brands dropdown in two columns; About and Downloads dropdowns.
- **Instant search:** press `/` or `Ctrl/⌘K`, or click any search box. It covers categories,
  ranges, products, brands and pages, with arrow-key navigation and a "call or enquire"
  fallback when nothing matches.
- **Category pages:**
  - breadcrumbs and an icon hero
  - "Ask about stock" email with the subject pre-filled
  - sticky category sidebar, which becomes swipeable chips on phones
  - "Jump to" chips, sub-range cards with Enquire links, and brand chips
  - featured ranges, a Tool Repair banner where relevant, an enquiry card, and previous/next
    category links
- **Phones:**
  - a slide-in drawer with accordions
  - a bottom action bar with Call, Directions, Email and Search
  - full-screen search
- **Contact:**
  - cards for calling, emailing and visiting
  - an hours table that highlights today
  - an enquiry form that composes an email
  - a map
- **Everywhere else:**
  - a footer sitemap and a "Can't see what you need?" call-to-action band
  - cross-document view transitions and hover prefetch (speculation rules)
  - HardwareStore JSON-LD on the home page

## 8. Git

- **Branch:** `claude/vibrant-pascal-9fogfu` on `joshuadrakelee13/Football-game-`. Develop and
  push here only. The repo's main project is an unrelated football game; the site lives
  entirely in `merlin-accessories/` plus one `merlin:build` script line in `package.json`.
- **No pull request** has been opened. Don't open one unless the user asks.
- Don't commit zips or screenshots; `screenshots/` is git-ignored.

## 9. The user

Non-technical. Wants no installs: they view the site by downloading the GitHub zip and
double-clicking `merlin-accessories/index.html`. Keep replies short and plain, explain any
settings change step by step, and say clearly what is real and what is still a stand-in.
