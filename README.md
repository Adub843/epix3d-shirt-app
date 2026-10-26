# EPIX3D shirt builder

[epix3d.com](https://epix3d.com): build an urban or geometric shirt and order it. EPIX3D is a label of
Elevated Designs, so checkout, payment and orders go through the Elevated Designs Shopify store
([elevatedshirts.com](https://elevatedshirts.com)), with the same blanks and prices as
[design.elevatedshirts.com](https://design.elevatedshirts.com).

It's the same builder as the Elevated Designs shirt app, copied from `Adub843/elevated-shirt-app-private`
at b058153, in a dark urban skin and with one extra tab:

- **Explore**: a pattern maker. Eight styles (hex grid, 3D cubes, triangles, circuit, op rings, burst,
  shifted squares, glitch bars), eight palettes and six outlines. Every design comes from a short code like
  `hex/neon/circle/6/#3f2a1c`, which goes on the order line (`_Art used`), so any order can be re-made exactly.
  Lines and gaps stay at least about 2 mm at a 10 in print, and every fill is solid, so the art is DTF-ready.
- **Library**: art from the Business Console. Art whose category or tag is Epix3D, Urban, Geometric, Street
  or Graffiti shows first as "EPIX3D picks"; "All categories" shows the rest.
- **Shirt, Upload, Text, Edit, Order**: unchanged, plus street fonts. Design IDs start with `EPX-`.

It's a static site with no server. GitHub Pages publishes it on every push to `main` and every hour,
after refreshing `catalog.json` from the store's `builder-blanks` collection.

## Files

- `index.html`: the page and its settings (`data-sb-config`: store, library, fonts, featured art, ID prefix)
- `app.js`: the builder. Brand settings come from the config, so the code stays the same as the ED app's
- `geometry.js`: the pattern maker, no dependencies
- `imaging.js`: image tools, no dependencies
- `styles.css`: styles (the EPIX3D layer is at the end)
- `scripts/sync-catalog.mjs`: builds `catalog.json` from the store's public `builder-blanks` collection
- `data/styles.json`: style details (type, fabric, swatch colors) matched to products by handle

Test: `node --test tests/*.test.mjs`

## Setup

1. Settings → Pages: source "GitHub Actions", custom domain `epix3d.com`, then "Enforce HTTPS" once the
   certificate is ready. The `CNAME` file alone isn't enough with Actions.
2. DNS for epix3d.com (at Wix): four A records for `@` to 185.199.108.153, 185.199.109.153,
   185.199.110.153 and 185.199.111.153, and a CNAME `www` to `adub843.github.io`. Remove any Wix A record for `@`.
3. The Business Console must allow `https://epix3d.com` and `https://www.epix3d.com` (built in from
   Business-console PR "Allow epix3d.com", or the Worker variable `BUILDER_ORIGINS`), or the art library won't load.
4. Optional repository variable `STORE_URL` (default `https://elevatedshirts.com`).

## Design tools

- **Ideas**: 22 starter designs in different styles (`templates.js`), recolored to suit the shirt.
- **Text**: 87 self-hosted fonts in 12 style groups (`fonts/`, all OFL or Apache), one-tap looks, gradient, two outlines, hard shadow, arc, circle, wave and rise shapes.
- **Art**: 1,433 clip art pieces (`art/icons.json`, Phosphor Icons, MIT), 32 badge shapes (`design.js`), the pattern maker (`geometry.js`) and the console library.
- **Upload**: background removal, halftone cleanup, DTF prep, plus styles: halftone dots, distressed, sticker outline, drop shadow, two-tone, stencil, posterize, pixel art and shape cut (`imaging.js`).
- **Draw**, **Layers** (hide, lock, reorder), align buttons, Ctrl+D copy, saved designs and autosave in the browser (`store.js`), mockup download and share.

Every effect prints solid (no see-through pixels), so it holds up on DTF. `node --test tests/*.test.mjs` runs the checks.
