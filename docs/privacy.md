# TCGPlus privacy policy

_Last updated: 2026-11-07_

TCGPlus is an open-source browser extension that adds usability improvements on top of [TCGplayer.com](https://www.tcgplayer.com). It is not affiliated with TCGplayer, Inc.

## What TCGPlus does with your data

**Nothing leaves your browser.** TCGPlus does not run a server, does not collect analytics, does not record telemetry, and does not transmit any data to the developer or to any third party. There is no account, no login, and no opt-in tracking.

The extension makes four kinds of network requests, all to TCGplayer's own servers (three hosts in total). Only the cart summary uses the TCGplayer session cookies your browser already has; the other three are sent without cookies.

1. **Vendor lookups.** When TCGPlus sees a listing it doesn't already have cached, it asks `seller-stores-backend.tcgplayer.com` for that vendor's public profile (city, state, country) so it can show the location badge. Sent without cookies.
2. **Cart summary.** TCGPlus asks `mpgateway.tcgplayer.com` (`/v1/cart/<key>/summary`) for the contents of your TCGplayer cart so it can show the running subtotal next to the cart count and feed the Deal-chip math. This is the same endpoint TCGplayer's own pages use, and it is the only request that includes your TCGplayer session cookies, because the cart belongs to your session.
3. **Product SKU catalogue.** For each product on the page, TCGPlus asks `mp-search-api.tcgplayer.com` (`/v2/product/<id>/details`) for the product's list of SKUs (condition, variant, language) so it can match each listing to the right SKU. Sent without cookies.
4. **Per-SKU market prices.** TCGPlus asks `mpgateway.tcgplayer.com` (`/v1/pricepoints/marketprice/skus/search`) for the public market price of those SKUs, which feeds the Deal chip. Sent without cookies. If this lookup fails, TCGPlus falls back to the market price already shown on the page.

No request goes anywhere else.

## What TCGPlus stores on your device

The following settings are saved to `chrome.storage.local` so the extension remembers them across page loads:

- Your home state and nearby states
- Which tier filter is currently active, if any
- Which on-page sections you've chosen to hide (price breakdown panel, recommendations carousel, page footer)
- Whether "Always Near Mint" is on
- Whether "Hide tiles with no matching listings" is on
- A flag recording that settings from older versions (which used the page's `localStorage`) have been migrated

This data lives only on your computer, in your browser. Uninstalling the extension or clearing your browser's storage removes it.

## Permissions the extension requests

- `storage`: required to save your settings.
- `host_permissions` for `https://seller-stores-backend.tcgplayer.com/*`, `https://mpgateway.tcgplayer.com/*`, and `https://mp-search-api.tcgplayer.com/*`: required to make the TCGplayer API calls described above.
- A content script on `https://www.tcgplayer.com/*`: required to add the panel, chips, and badges to TCGplayer pages.

The extension does not request access to any other site.

## Source code

TCGPlus is MIT-licensed and the entire source is public on GitHub:

> [github.com/peteb4ker/tcgplus](https://github.com/peteb4ker/tcgplus)

If you want to verify any of the claims on this page, the relevant code lives in `lib.js`, `storage.js`, `content.js`, and `background.js`.

## Contact

For privacy questions, open an issue on the GitHub repository above. For security disclosures, see [`SECURITY.md`](https://github.com/peteb4ker/tcgplus/blob/main/SECURITY.md).
