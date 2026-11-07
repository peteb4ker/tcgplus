# TCGPlus privacy policy

_Last updated: 2026-11-07_

TCGPlus is an open-source browser extension that makes [TCGplayer.com](https://www.tcgplayer.com) easier to shop. It is not affiliated with TCGplayer, Inc.

## What TCGPlus does with your data

**Your data stays in your browser.** TCGPlus has no server, collects no analytics or telemetry, and sends nothing to the developer or any third party. There is no account and no login.

TCGPlus makes four kinds of requests, all to TCGplayer's own servers on three hosts. Only the cart request includes your TCGplayer session cookies. The other three are sent without cookies.

1. **Seller locations.** For each seller on the page that it hasn't looked up yet, TCGPlus asks `seller-stores-backend.tcgplayer.com` for the seller's public profile (city, state and country) to show the location badge.
2. **Your cart.** TCGPlus asks `mpgateway.tcgplayer.com` (`/v1/cart/<key>/summary`) for your cart's contents. It uses them to show your cart subtotal and to work out the DEAL badge. TCGplayer's own pages use the same request. This is the only request that includes your TCGplayer session cookies, because the cart belongs to your session.
3. **Product printings and conditions.** For each product on the page, TCGPlus asks `mp-search-api.tcgplayer.com` (`/v2/product/<id>/details`) for the product's list of SKUs (condition, printing and language), so it can match each listing to the right one.
4. **Market prices.** TCGPlus asks `mpgateway.tcgplayer.com` (`/v1/pricepoints/marketprice/skus/search`) for the public market price of those SKUs. These prices feed the price chips and the DEAL badge. If this request fails, TCGPlus uses the market price shown on the page instead.

TCGPlus sends no other requests.

## What TCGPlus stores on your device

TCGPlus saves these settings in `chrome.storage.local` so it remembers them between visits:

- Your home state and nearby states
- The location filter you last selected, if any
- Which parts of the page you've chosen to hide (price breakdown panel, recommendations carousel, page footer)
- Whether "Always Near Mint" is on
- Whether "Hide tiles with no matching listings" is on
- A flag recording that settings from older versions, which used the page's `localStorage`, have been moved across

This data stays on your computer. Uninstalling the extension or clearing your browser's storage deletes it.

## Permissions

- `storage`: to save your settings.
- Host permissions for `https://seller-stores-backend.tcgplayer.com/*`, `https://mpgateway.tcgplayer.com/*` and `https://mp-search-api.tcgplayer.com/*`: to make the requests listed above.
- A content script on `https://www.tcgplayer.com/*`: to add the panel, chips and badges to TCGplayer pages.

TCGPlus does not request access to any other site.

## Source code

TCGPlus is MIT-licensed, and all of its source is public:

> [github.com/peteb4ker/tcgplus](https://github.com/peteb4ker/tcgplus)

To check any claim on this page, see `lib.js`, `storage.js`, `content.js` and `background.js`.

## Contact

For privacy questions, open an issue on the GitHub repository. To report a security problem, see [`SECURITY.md`](https://github.com/peteb4ker/tcgplus/blob/main/SECURITY.md).
