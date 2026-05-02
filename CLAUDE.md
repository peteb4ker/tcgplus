# CLAUDE.md

Notes for AI agents working on this repo.

## Deal math must stay in sync between code and README

The "Deal" chip's logic is one of the few things in this extension that's hard to verify by reading the code alone. It depends on:

- The listing's price.
- The listing's stated shipping cost.
- Whether the listing has the "Free Shipping on Orders Over $X" promo.
- The per-seller cart subtotal from `mpgateway.tcgplayer.com/v1/cart/<key>/summary`.
- The global free-shipping threshold (currently $5, fetched from `/v2/param/freeshippingthreshold`, hard-coded as `FREE_SHIP_THRESHOLD` for now).
- The page's market price.

Whenever you change the formula in `content.js` (search for `renderDealChipHtml` and `recomputeDealChips`), update the `Price, shipping, and Deal chips` section of `README.md` in the same commit. The README is the user-facing source of truth for what triggers the chip; the code must agree.

If you add new inputs (e.g. tax, kickbacks, multi-listing combinations), document them in the README too. Don't ship a Deal-math change without a matching README update.

## Other things to keep in mind

- The extension is plain MV3 with no build step. Keep `content.js` and `content.css` editable by hand.
- `manifest.json` host permissions must list every host the script fetches from. Currently `seller-stores-backend.tcgplayer.com` (vendor info) and `mpgateway.tcgplayer.com` (cart). If you add another fetch target, add the host permission too.
- All persisted state lives in `localStorage` under the `tcgplus.*` namespace. No accounts, no servers.
