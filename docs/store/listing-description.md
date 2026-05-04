# Chrome Web Store listing copy

This file is the source for the TCGPlus Chrome Web Store listing. Paste these sections into the corresponding fields when submitting.

## Short description (132 chars max)

Vendor locations, market-price chips, and a smart Deal indicator on every TCGplayer product page. No accounts, no servers.

## Full description

TCGPlus is a usability layer on top of TCGplayer.com. It quietly adds the information you need to find good listings faster and decide whether something is worth buying, without changing how the rest of the site works.

What you get on every product page:

- A city/state badge under each vendor's rating, color-coded by where they ship from. Pick your home state in settings; nearby states get a yellow badge; everyone else stays neutral.
- A floating panel summarising how many listings on the current page are from your home state, your nearby states, and elsewhere. Click a tier to filter the list. Click again to clear.
- A row of chips next to each listing's price showing how far it is from the page's market price (continuous green-to-red gradient), the shipping cost, and a purple "DEAL" badge when the all-in cost still beats market — including TCGplayer's per-seller "Free Shipping on Orders Over $5" promo.
- The cart's running subtotal next to the cart icon, so you can see what you're spending without opening the cart.

In settings:

- Pick your home state and any number of nearby states.
- Hide TCGplayer's price-breakdown panel, recommendations carousel, and footer.
- Force every product / search URL to include `Condition=Near+Mint` automatically.
- Hide every search-result tile that's marked Out of Stock — TCGplayer's own out-of-stock filter sometimes misses these.

Privacy and trust:

- TCGPlus runs entirely in your browser. There is no TCGPlus server, no account, and no analytics. Settings live in `chrome.storage.local` on your device.
- The only network requests it makes are to TCGplayer's own endpoints (vendor info and your cart subtotal), using the session you're already logged into.
- Open source. MIT-licensed. Source, issues, and changelog at https://github.com/peteb4ker/tcgplus

TCGPlus is an independent tool. It is not affiliated with, endorsed by, or certified by TCGplayer, Inc. "TCGplayer" and the TCGplayer logo are trademarks of TCGplayer, Inc. Using browser extensions on TCGplayer may be inconsistent with TCGplayer's Terms of Service; install at your discretion.

## Category

Shopping

## Language

English

## Privacy policy URL

https://github.com/peteb4ker/tcgplus/blob/main/docs/privacy.md
