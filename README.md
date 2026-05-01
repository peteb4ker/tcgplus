# TCG+ Vendor Locations

Chrome extension that surfaces vendor location info on TCGplayer product listing pages.

- Adds a city/state badge under each vendor's rating, color-coded by region:
  - **Green** — California
  - **Yellow** — Other Western US (OR, WA, NV, AZ, ID, UT, MT, WY, CO, NM, AK, HI)
  - **Gray** — International
- Floating panel summarizes counts on the current page and lets you click a region to filter the list.
- Optional toggle to hide TCGplayer's price-breakdown panel.
- Selected filter and breakdown-toggle persist across reloads.

## Install (from source)

1. Clone this repo (or download the latest [release zip](../../releases)).
2. In Chrome, open `chrome://extensions`.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select this directory.
5. Visit any page under `https://www.tcgplayer.com/product/*` to see the badges and panel.

## Development

The extension is plain MV3 — no build step. Edit `content.js` / `content.css`, click the reload icon for the extension on `chrome://extensions`, then reload the TCGplayer tab.

## License

MIT — see [LICENSE](LICENSE).
