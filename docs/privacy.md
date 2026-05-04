# TCGPlus privacy policy

_Last updated: 2026-05-04_

TCGPlus is an open-source browser extension that adds usability improvements on top of [TCGplayer.com](https://www.tcgplayer.com). It is not affiliated with TCGplayer, Inc.

## What TCGPlus does with your data

**Nothing leaves your browser.** TCGPlus does not run a server, does not collect analytics, does not record telemetry, and does not transmit any data to the developer or to any third party. There is no account, no login, and no opt-in tracking.

The extension makes two kinds of network requests, both to TCGplayer's own servers, both using the session cookies your browser already has:

1. **Vendor lookups.** When TCGPlus sees a listing it doesn't already have cached, it asks `seller-stores-backend.tcgplayer.com` for that vendor's public profile (city, state, country) so it can show the location badge.
2. **Cart summary.** TCGPlus asks `mpgateway.tcgplayer.com` for the contents of your TCGplayer cart so it can show the running subtotal next to the cart count and feed the Deal-chip math. This is the same endpoint TCGplayer's own pages use.

No request goes anywhere else.

## What TCGPlus stores on your device

The following settings are saved to `chrome.storage.local` so the extension remembers them across page loads:

- Your home state and nearby states
- Which tier filter is currently active, if any
- Which on-page sections you've chosen to hide
- Whether "Always Near Mint" is on
- Whether "Always hide out-of-stock" is on

This data lives only on your computer, in your browser. Uninstalling the extension or clearing your browser's storage removes it.

## Permissions the extension requests

- `storage`: required to save your settings.
- `host_permissions` for `https://seller-stores-backend.tcgplayer.com/*` and `https://mpgateway.tcgplayer.com/*`: required to make the two TCGplayer API calls described above.

The extension does not request access to any other site.

## Source code

TCGPlus is MIT-licensed and the entire source is public on GitHub:

> [github.com/peteb4ker/tcgplus](https://github.com/peteb4ker/tcgplus)

If you want to verify any of the claims on this page, the relevant code lives in `lib.js`, `storage.js`, `content.js`, and `background.js`.

## Contact

For privacy questions, open an issue on the GitHub repository above. For security disclosures, see [`SECURITY.md`](https://github.com/peteb4ker/tcgplus/blob/main/SECURITY.md).
