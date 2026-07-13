// @ts-check
// Regression coverage for #69: a single product page (and search-list-view
// tile) can show listings of multiple variants (Normal / Holofoil /
// Reverse Holofoil) under one headline market price. Each listing must
// chip against its OWN variant+condition market price, fetched from
// TCGplayer's per-SKU pricing endpoints — not the headline.
//
// Fixture mirrors the real-world Ditto 151 case: NM-Holofoil ~$0.53,
// NM-Reverse-Holofoil ~$4.67. A $3.20 Reverse-Holofoil NM listing should
// chip -$1.47 (-31.5%) against the RH market, not +$2.67 (+503.8%)
// against the Holofoil headline.
const { test, expect } = require('@playwright/test');
const { launchWithExtension, mockTCGplayer } = require('./helpers/load-extension.js');

const PRODUCT_ID = 516695;

// Fixture page: headline market is $0.53 (the Holofoil NM market — what
// the .price-points__upper__price element on a real product page carries).
// Three listings: Holofoil-NM at $0.20, Holofoil-LP at $0.25,
// Reverse-Holofoil-NM at $3.20. Note: NO Condition= URL param, so the
// pre-existing condition-gate fallback would happily render misleading
// chips against the headline — only per-SKU resolution gives the right
// answer.
const MULTI_VARIANT_HTML = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>multi-variant fixture</title></head>
  <body>
    <header>
      <button class="mp-header__content__cart-count" type="button" aria-label="Cart">
        <span class="tcg-badge mp-header__content__cart-count__chip">0</span>
      </button>
    </header>
    <section class="price-points">
      <div>Market Price:</div>
      <span class="price-points__upper__price">$0.53</span>
    </section>
    <section class="listings">
      <article class="listing-item" data-testid="listing-item--holo-nm">
        <div class="listing-item__listing-data">
          <div class="listing-item__listing-data__seller">
            <div class="seller-info">
              <a class="seller-info__name" href="/sellers/Seller-A/aaaaaaaa">Seller A</a>
              <div class="seller-info__content"></div>
            </div>
          </div>
          <div class="listing-item__listing-data__info">
            <h3 class="listing-item__listing-data__info__condition"><a href="#">Near Mint Holofoil</a></h3>
            <div class="listing-item__listing-data__info__price">$0.20</div>
            <span>+ $1.31 Shipping</span>
          </div>
        </div>
      </article>

      <article class="listing-item" data-testid="listing-item--holo-lp">
        <div class="listing-item__listing-data">
          <div class="listing-item__listing-data__seller">
            <div class="seller-info">
              <a class="seller-info__name" href="/sellers/Seller-B/bbbbbbbb">Seller B</a>
              <div class="seller-info__content"></div>
            </div>
          </div>
          <div class="listing-item__listing-data__info">
            <h3 class="listing-item__listing-data__info__condition"><a href="#">Lightly Played Holofoil</a></h3>
            <div class="listing-item__listing-data__info__price">$0.25</div>
            <span>+ $1.31 Shipping</span>
          </div>
        </div>
      </article>

      <article class="listing-item" data-testid="listing-item--rh-nm">
        <div class="listing-item__listing-data">
          <div class="listing-item__listing-data__seller">
            <div class="seller-info">
              <a class="seller-info__name" href="/sellers/Seller-C/cccccccc">Seller C</a>
              <div class="seller-info__content"></div>
            </div>
          </div>
          <div class="listing-item__listing-data__info">
            <h3 class="listing-item__listing-data__info__condition"><a href="#">Near Mint Reverse Holofoil</a></h3>
            <div class="listing-item__listing-data__info__price">$3.20</div>
            <span>+ $1.31 Shipping</span>
          </div>
        </div>
      </article>
    </section>
  </body>
</html>`;

// SKU catalog and per-SKU market prices for the fixture. Values match
// what mp-search-api / mpgateway return for Ditto 151 in production.
const SKUS = [
  { sku: 7432254, condition: 'Near Mint', variant: 'Holofoil', language: 'English' },
  { sku: 7432255, condition: 'Lightly Played', variant: 'Holofoil', language: 'English' },
  { sku: 7432256, condition: 'Moderately Played', variant: 'Holofoil', language: 'English' },
  { sku: 7432259, condition: 'Near Mint', variant: 'Reverse Holofoil', language: 'English' },
  { sku: 7432260, condition: 'Lightly Played', variant: 'Reverse Holofoil', language: 'English' },
];
const SKU_PRICES = {
  7432254: { marketPrice: 0.53 },
  7432255: { marketPrice: 0.48 },
  7432256: { marketPrice: 0.37 },
  7432259: { marketPrice: 4.67 },
  7432260: { marketPrice: 1.93 },
};

test.describe('Per-SKU market prices for multi-variant listings (regression for #69)', () => {
  /** @type {import('@playwright/test').BrowserContext} */
  let ctx;
  /** @type {import('@playwright/test').Page} */
  let page;

  test.beforeEach(async () => {
    ({ ctx } = await launchWithExtension());
    page = await ctx.newPage();
    await mockTCGplayer(page, {
      productHtml: MULTI_VARIANT_HTML,
      productSkus: { [PRODUCT_ID]: SKUS },
      skuMarketPrices: SKU_PRICES,
      cart: null,
    });
  });

  test.afterEach(async () => {
    if (ctx) await ctx.close();
  });

  test('each listing chips against its own SKU market price', async () => {
    await page.goto(`https://www.tcgplayer.com/product/${PRODUCT_ID}/test`);
    await expect(page.locator('.listing-item[data-tcgplus-chips="1"]')).toHaveCount(3);

    // Holofoil NM at $0.20 vs Holofoil-NM market $0.53 → -$0.33 (-62.3%).
    const holoNm = await page.locator('[data-testid="listing-item--holo-nm"] .tcgplus-price-chip').allInnerTexts();
    expect(holoNm).toContain('-$0.33 (-62.3%)');
    expect(holoNm).toContain('$1.31 shipping');

    // Holofoil LP at $0.25 vs Holofoil-LP market $0.48 → -$0.23 (-47.9%).
    // Without per-SKU resolution this would have been chipped against
    // the $0.53 headline (off by ~10%, and against the wrong condition).
    const holoLp = await page.locator('[data-testid="listing-item--holo-lp"] .tcgplus-price-chip').allInnerTexts();
    expect(holoLp).toContain('-$0.23 (-47.9%)');
    expect(holoLp).toContain('$1.31 shipping');

    // Reverse Holofoil NM at $3.20 vs RH-NM market $4.67 → -$1.47 (-31.5%).
    // This was the headline anomaly: against the $0.53 Holofoil headline
    // it computed +$2.67 (+503.8%). With per-SKU resolution it's correctly
    // showing the listing is BELOW its real variant market.
    const rhNm = await page.locator('[data-testid="listing-item--rh-nm"] .tcgplus-price-chip').allInnerTexts();
    expect(rhNm).toContain('-$1.47 (-31.5%)');
    expect(rhNm).toContain('$1.31 shipping');
    // And because $3.20 + $1.31 = $4.51 is below the $4.67 RH-NM market,
    // a DEAL chip rightly renders too (CSS uppercases the text → "DEAL").
    expect(rhNm).toContain('DEAL');

    // The delta chip's tooltip should reference the per-variant market,
    // not the $0.53 headline.
    const rhDelta = page
      .locator('[data-testid="listing-item--rh-nm"] .tcgplus-price-chip')
      .filter({ hasText: '-$1.47' });
    await expect(rhDelta).toHaveAttribute('title', 'vs market $4.67');
  });

  test('caps a stale worse-condition market at the NM market (regression for #111)', async () => {
    // Replays TCGplayer's real numbers for ME Mega Evolution Promo
    // Ampharos 075 (productId 694681): the LP-Holofoil "market" ($16.82)
    // sat ABOVE the NM-Holofoil market ($15.53) because the thin LP tier
    // recalculated days later on a falling card. Without the cap, a
    // $15.00 + $0.99-shipping LP listing totals $15.99 < $16.82 and
    // earned a bogus DEAL chip with a -$1.82 (-10.8%) delta.
    const AMPHAROS_ID = 694681;
    const AMPHAROS_HTML = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>stale LP market fixture</title></head>
  <body>
    <header>
      <button class="mp-header__content__cart-count" type="button" aria-label="Cart">
        <span class="tcg-badge mp-header__content__cart-count__chip">0</span>
      </button>
    </header>
    <section class="price-points">
      <div>Market Price:</div>
      <span class="price-points__upper__price">$15.53</span>
    </section>
    <section class="listings">
      <article class="listing-item" data-testid="listing-item--lp-holo">
        <div class="listing-item__listing-data">
          <div class="listing-item__listing-data__seller">
            <div class="seller-info">
              <a class="seller-info__name" href="/sellers/Seller-A/aaaaaaaa">Seller A</a>
              <div class="seller-info__content"></div>
            </div>
          </div>
          <div class="listing-item__listing-data__info">
            <h3 class="listing-item__listing-data__info__condition"><a href="#">Lightly Played Holofoil</a></h3>
            <div class="listing-item__listing-data__info__price">$15.00</div>
            <span>+ $0.99 Shipping</span>
          </div>
        </div>
      </article>
    </section>
  </body>
</html>`;
    await mockTCGplayer(page, {
      productHtml: AMPHAROS_HTML,
      productSkus: {
        [AMPHAROS_ID]: [
          { sku: 9289883, condition: 'Near Mint', variant: 'Holofoil', language: 'English' },
          { sku: 9289884, condition: 'Lightly Played', variant: 'Holofoil', language: 'English' },
        ],
      },
      skuMarketPrices: {
        9289883: { marketPrice: 15.53 },
        9289884: { marketPrice: 16.82 },
      },
      cart: null,
    });
    await page.goto(`https://www.tcgplayer.com/product/${AMPHAROS_ID}/test`);
    await expect(page.locator('.listing-item[data-tcgplus-chips="1"]')).toHaveCount(1);

    // Delta computed against the CAPPED market ($15.53), not the stale
    // $16.82: $15.00 - $15.53 = -$0.53 (-3.4%).
    const chips = await page.locator('[data-testid="listing-item--lp-holo"] .tcgplus-price-chip').allInnerTexts();
    expect(chips).toContain('-$0.53 (-3.4%)');
    expect(chips).toContain('$0.99 shipping');
    // All-in $15.99 is above the capped market — no DEAL chip.
    expect(chips).not.toContain('DEAL');

    const delta = page
      .locator('[data-testid="listing-item--lp-holo"] .tcgplus-price-chip')
      .filter({ hasText: '-$0.53' });
    await expect(delta).toHaveAttribute('title', 'vs market $15.53');
  });

  test('falls back to headline market when per-SKU lookup yields nothing', async () => {
    // Re-mock with no SKU catalog so per-SKU resolution returns null. The
    // headline-market path with condition gating from #70 takes over.
    await mockTCGplayer(page, {
      productHtml: MULTI_VARIANT_HTML,
      productSkus: {}, // no SKUs known
      skuMarketPrices: {},
      cart: null,
    });
    await page.goto(`https://www.tcgplayer.com/product/${PRODUCT_ID}/test`);
    await expect(page.locator('.listing-item[data-tcgplus-chips="1"]')).toHaveCount(3);

    // No listing matches the default Near Mint headline (their conditions
    // are "Near Mint Holofoil" / "Lightly Played Holofoil" / "Near Mint
    // Reverse Holofoil"), so the fallback gates them all — every listing
    // gets the shipping chip only. Better than +503% misinformation.
    for (const tid of ['listing-item--holo-nm', 'listing-item--holo-lp', 'listing-item--rh-nm']) {
      const chips = await page.locator(`[data-testid="${tid}"] .tcgplus-price-chip`).allInnerTexts();
      expect(chips).toEqual(['$1.31 shipping']);
    }
  });
});
