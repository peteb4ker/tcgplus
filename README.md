# TCG+ Vendor Locations

Chrome extension that augments TCGplayer product listing pages with vendor-location and pricing context, and lets you tune what's on screen.

## Features

### Vendor location badges
Each listing gets a city/state badge under the vendor's rating, color-coded by where the seller ships from:

- **Green** — your home state
- **Yellow** — your nearby states
- **Gray** — international
- *(uncolored)* — other US

### Floating panel (daily filters)
A small panel summarizes counts on the current page by tier (Home / Nearby / Other US) and lets you click any tier to filter the listing list to just that tier. Click again to clear. Counts reflect only the active page; the selected filter persists across reloads.

### Price-vs-market chip
Next to each listing's price, a single chip shows the absolute and percentage difference vs the page's market price (e.g. `+$5.00 (+16.7%)`). Color is a continuous gradient — solid green below market, neutral at parity, yellow through orange to red as the price climbs above, capped red at ≥10% over.

### Settings drawer (one-time configuration)
Click the gear icon on the panel to open settings:

- **Home state** — choose any US state. Defaults to California.
- **Nearby states** — check zero or more states (the home state is auto-disabled). Defaults to the western US set (OR, WA, NV, AZ, ID, UT, MT, WY, CO, NM, AK, HI).
- **Hide on page** — checkboxes to hide TCGplayer's `product-details__breakdown`, `product-details__recommendations`, and `<footer>` sections.

All settings persist to `localStorage`. Changing the home or nearby states reclassifies listings live without re-fetching.

## Install (from source)

1. Clone this repo (or download the latest [release zip](../../releases)).
2. In Chrome, open `chrome://extensions`.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select this directory.
5. Visit any page under `https://www.tcgplayer.com/product/*` to see the badges, chips, and panel.

## Development

The extension is plain MV3 — no build step. Edit `content.js` / `content.css`, click the reload icon for the extension on `chrome://extensions`, then reload the TCGplayer tab.

The seller API hit for vendor location is `https://seller-stores-backend.tcgplayer.com/sm/seller/<key>` (declared as a host permission in the manifest); no other network calls are made. Market price is read from the page DOM.

## License

MIT — see [LICENSE](LICENSE).
