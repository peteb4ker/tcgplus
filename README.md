# TCGPlus

TCGPlus is a Chrome extension for [TCGplayer](https://www.tcgplayer.com). It reduces friction in the navigation experience so you can search and buy faster.

![TCGPlus on a TCGplayer product page](docs/images/hero.png)

## Features

### Vendor location badges
Every listing gets a city/state badge under the seller's rating, color-coded by where they ship from:

- Green: your home state
- Yellow: your nearby states
- Gray: international
- Uncolored: anywhere else in the US

### Click-to-filter panel
A floating panel summarizes the page by tier (Home / Nearby / Other US). Click a tier to filter the listings to just that group, click again to clear. Counts reflect only the active page. The chosen filter sticks across reloads.

### Price-vs-market chip
Each listing's price gets a chip showing how far it is from the page's market price, e.g. `+$5.00 (+16.7%)`. The colour follows the gap. Below market is solid green. Above market shifts from yellow through orange to red, hitting full red at 10% over.

| Below market | Near market | Above market |
|---|---|---|
| ![Green chips below market](docs/images/chips-below-market.png) | ![Orange chips near market](docs/images/chips-near-market.png) | ![Red chips above market](docs/images/chips-above-market.png) |

### Settings drawer
The gear icon on the panel opens settings:

- **Home state**: pick any US state. Default is California.
- **Nearby states**: tick zero or more. The home state is auto-disabled so you can't pick it twice. Default is the western US set (OR, WA, NV, AZ, ID, UT, MT, WY, CO, NM, AK, HI).
- **Hide on page**: checkboxes to hide TCGplayer's price-breakdown panel, recommendations carousel, and footer.

Settings are stored in `localStorage`. Changing the home or nearby states reclassifies listings on the spot without re-fetching anything.

![Settings drawer with home state, nearby states, and hide controls](docs/images/settings.png)

### How it works
The only network call the extension makes is to TCGplayer's own seller API for vendor location lookups. The market price is read straight from the page DOM. Nothing is sent anywhere else.

## Install (from source)

1. Clone this repo, or download the latest [release zip](../../releases).
2. In Chrome, open `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select this directory.
5. Visit any page under `https://www.tcgplayer.com/product/*`.

## Development

Plain MV3, no build step. Edit `content.js` and `content.css`, hit reload on the extension in `chrome://extensions`, then refresh the TCGplayer tab.

CI on GitHub Actions validates `manifest.json` and runs `node --check` on the content script. Pushing a `v*` tag builds a zip and attaches it to a GitHub Release.

The seller API call is to `https://seller-stores-backend.tcgplayer.com/sm/seller/<key>`, declared as a host permission in the manifest. Market price is read from the page DOM at `.price-points__upper__price`.

## License

MIT, see [LICENSE](LICENSE).
