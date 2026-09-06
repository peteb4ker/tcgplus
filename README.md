# TCGPlus

[![Install from the Chrome Web Store](https://img.shields.io/chrome-web-store/v/laaddebgfkkfemgjgjibdhpnflmchjaj?label=Install%20from%20the%20Chrome%20Web%20Store&logo=googlechrome&logoColor=fff&color=4285f4&style=for-the-badge)](https://chromewebstore.google.com/detail/tcgplus/laaddebgfkkfemgjgjibdhpnflmchjaj)
[![Chrome Web Store users](https://img.shields.io/chrome-web-store/users/laaddebgfkkfemgjgjibdhpnflmchjaj?label=users&color=05772d&style=for-the-badge)](https://chromewebstore.google.com/detail/tcgplus/laaddebgfkkfemgjgjibdhpnflmchjaj)

TCGPlus adds the price-vs-market delta and shipping cost to every TCGplayer listing, flags the ones that still come in under market once shipping is included, and shows where the seller ships from.

![TCGPlus on a TCGplayer product page](docs/images/hero.png)

![TCGPlus deal chips and location filter in action](docs/images/demo.gif)

## Install

Install TCGPlus from the [Chrome Web Store](https://chromewebstore.google.com/detail/tcgplus/laaddebgfkkfemgjgjibdhpnflmchjaj). To run an unreleased build, see [Install from source](#install-from-source).

## Features

TCGPlus runs on product pages, search pages, and the cart and checkout pages. The cart page also gets a price-vs-market chip on every line item, so you can sanity-check your cart before paying.

### Vendor location badges

Every listing gets a city/state badge under the seller's rating, color-coded by where they ship from:

- Green: your home state
- Yellow: your nearby states
- Gray: international
- Uncolored: anywhere else in the US

When you've filtered to a single seller, the location moves into the "You are shopping from" banner and the per-listing badges are hidden, since they'd all be identical.

### Click-to-filter panel

A floating panel summarizes the page by tier (Home / Nearby / Other US). Click a tier to filter the listings to just that group, click again to clear. Counts reflect only the active page. The chosen filter sticks across reloads.

### Price, shipping, and Deal chips

Each listing gets a row of chips that show price-vs-market, shipping cost, and whether the all-in cost is a deal.

- **Price-vs-market chip**: how far the price is from the market price, e.g. `+$5.00 (+16.7%)`. Solid green below market. Above market shifts from yellow through orange to red, hitting full red at 10% over.
- **Shipping chip**: replaces the plain "+ $X.XX Shipping" line. Green when shipping is included, yellow under $2, red at $2 or more (labelled "high shipping").
- **Deal chip**: a purple "DEAL" badge appears when the listing's all-in cost would still beat the market price. The math factors in any "Free Shipping on Orders Over $X" promo on the listing, but only when your existing cart subtotal _with that same seller_ plus the listing's price clears the global free-shipping threshold (currently $5).
- On the search grid, each tile shows only the price-vs-market chip. The grid price is TCGplayer's shipping-inclusive cheapest listing, so the chip compares that all-in price against market and can read slightly worse than the list-view delta for the same listing; the chip's tooltip notes this. List view shows the full chip row.

#### Which market price the chips use

When a page shows listings across variants (Normal / Holofoil / Reverse Holofoil) or conditions (NM / LP / MP / HP / DM), each listing chips against its **own SKU's market price**, matched by condition and variant — a Reverse Holofoil listing compares against the Reverse Holofoil market, not the page's headline.

Within a variant, each condition's market price is capped at the best condition above it (NM, then LP, MP, HP, Damaged). TCGplayer recalculates thin condition tiers days later than Near Mint, so a stale LP "market" can sit above the fresh NM one; without the cap, an LP listing could show an inflated below-market delta and a DEAL chip while costing more than the NM market. Both the delta chip and the Deal math use the capped value.

If the per-SKU lookup is unavailable, the chip falls back to the page's headline market price, and only on listings whose condition matches the headline — mismatched listings get the shipping chip only rather than a misleading delta.

**Below market**

![Green chips below market](docs/images/chips-below-market.png)

**Near market**

![Orange chips near market](docs/images/chips-near-market.png)

**Above market**

![Red chips above market](docs/images/chips-above-market.png)

### Cart and checkout: all-in cost vs market

At a card show you'd pay the sum of the cards' market prices in cash, with no shipping or tax. TCGPlus compares that baseline to what your cart actually costs, and puts a per-item chip on every line item:

- **Cart page**: in every Cart Summary box (desktop sidebar and mobile layout), labeled "All-in vs market (before tax)" since TCGplayer calculates taxes at checkout.
- **Checkout**: in the Order Summary card under Est. Tax, with the tax included in the verdict.

The breakdown shows the cart's market value (per-SKU, quantity-aware), the items total, shipping, tax where known, and a color-coded verdict chip, e.g. `-$3.14 (-8.2%)`. Items with no market data are counted at their listed price and a note says how many.

If TCGPlus can't read a row's price or quantity, it checks its own item total against the cart's own reported total rather than guess. On a mismatch it shows a plain notice instead of a verdict, since a partial row count would make the market value and the delta wrong.

### Cart subtotal in the header

TCGPlus adds the cart's current subtotal next to the cart icon in TCGplayer's header, in the same green TCGplayer uses for prices. It shows even at `$0.00` and refreshes whenever the count badge changes. The Deal-chip math uses the same number.

### Settings page

Click the gear icon on the floating panel, click the TCGPlus icon in your browser toolbar, or open **Extension options** from `chrome://extensions` — they all open the same settings page:

- **Home state**: pick any US state. Default is California.
- **Nearby states**: tick zero or more. The home state is auto-disabled so you can't pick it twice. Default is the western US set (OR, WA, NV, AZ, ID, UT, MT, WY, CO, NM, AK, HI).
- **Hide on page**: checkboxes to hide TCGplayer's price-breakdown panel, recommendations carousel, and footer.
- **Always Near Mint**: rewrites any product or search URL without `Condition=Near+Mint` to include it before the listings render. Off by default.
- **Hide tiles with no matching listings**: hides search tiles whose listings don't match your current filters. TCGplayer marks these "Out of Stock", but they're usually a language or condition mismatch rather than true unavailability. Whenever any are present, a banner above the grid shows a count and a toggle button, so hidden tiles are never silent. Off by default.

Settings are stored in `chrome.storage.local`. Changes apply live to any open TCGplayer tab — no reload needed.

![TCGPlus settings page](docs/images/options-page.png)

## Privacy

TCGPlus runs entirely in your browser. There is no TCGPlus server, no account, and no analytics. The only network calls it makes are to TCGplayer's own APIs:

- `seller-stores-backend.tcgplayer.com/sm/seller/<key>` for each unique vendor on the page (used for the location badge).
- `mpgateway.tcgplayer.com/v1/cart/<key>/summary` for the cart subtotal and per-seller breakdown.
- `mp-search-api.tcgplayer.com/v2/product/<id>/details` for the SKU catalogue of each product (variant + condition), and `mpgateway.tcgplayer.com/v1/pricepoints/marketprice/skus/search` for per-SKU market prices. These power the variant-aware delta chip on product, search-list, and cart pages.

All four hosts are listed as host permissions in the manifest. The page's headline market price is read from the page itself as a fallback when per-SKU pricing isn't available. Nothing is sent anywhere else. Full details in the [privacy policy](docs/privacy.md).

## Development

[![CI](https://github.com/peteb4ker/tcgplus/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/peteb4ker/tcgplus/actions/workflows/ci.yml)
[![CodeQL](https://github.com/peteb4ker/tcgplus/actions/workflows/codeql.yml/badge.svg?branch=main)](https://github.com/peteb4ker/tcgplus/actions/workflows/codeql.yml)
[![Release](https://img.shields.io/github/v/release/peteb4ker/tcgplus?label=release&color=05772d)](https://github.com/peteb4ker/tcgplus/releases/latest)

Plain MV3 extension, no build step. See [docs/development.md](docs/development.md) for the dev build, tests, and CI.

### Install from source

For local development or testing an unreleased build:

1. Clone this repo, or download the latest [release zip](../../releases).
2. In Chrome, open `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select this directory.
5. Visit any product page (`https://www.tcgplayer.com/product/*`) or search page (`https://www.tcgplayer.com/search/*`).

## License

MIT, see [LICENSE](LICENSE).
