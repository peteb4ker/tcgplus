// @ts-check
// Coverage for #117: TCGplayer's 2026 product-page redesign renamed the
// condition cell (.listing-item__condition), moved the market price into
// the price-guide header table, appended "-message" to the shipping
// class, and reused product-card markup for the recommendations
// carousel. The fixture replays the redesigned DOM; these tests pin the
// extension's behaviour against it.
const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const { launchWithExtension, mockTCGplayer } = require('./helpers/load-extension.js');

const PRODUCT_ID = 1;

const SKUS = [
  { sku: 9101, condition: 'Near Mint', variant: 'Normal', language: 'English' },
  { sku: 9102, condition: 'Lightly Played', variant: 'Holofoil', language: 'English' },
];
const SKU_PRICES = {
  9101: { marketPrice: 10.0 },
  9102: { marketPrice: 9.0 },
};

test.describe('Product-page redesign (regression for #117)', () => {
  /** @type {import('@playwright/test').BrowserContext} */
  let ctx;
  /** @type {import('@playwright/test').Page} */
  let page;
  /** @type {string} */
  let html;

  test.beforeAll(async () => {
    html = await fs.readFile(path.join(__dirname, 'fixtures', 'product-page-redesign.html'), 'utf8');
  });

  test.beforeEach(async () => {
    ({ ctx } = await launchWithExtension());
    page = await ctx.newPage();
  });

  test.afterEach(async () => {
    if (ctx) await ctx.close();
  });

  test('listings chip via per-SKU markets read from the new condition cell', async () => {
    await mockTCGplayer(page, {
      productHtml: html,
      productSkus: { [PRODUCT_ID]: SKUS },
      skuMarketPrices: SKU_PRICES,
      cart: null,
    });
    await page.goto(`https://www.tcgplayer.com/product/${PRODUCT_ID}/test`);
    await expect(page.locator('.listing-item[data-tcgplus-chips="1"]')).toHaveCount(2);

    // NM Normal $8.00 vs SKU market $10.00 → -$2.00 (-20.0%); shipping
    // parsed from the renamed shipping-message span.
    const nm = await page.locator('[data-testid="listing-item--nm"] .tcgplus-price-chip').allInnerTexts();
    expect(nm).toContain('-$2.00 (-20.0%)');
    expect(nm).toContain('$1.49 shipping');

    // LP Holofoil $7.00 vs its own SKU market $9.00 → -$2.22... no:
    // -$2.00 (-22.2%). Proves the variant suffix still parses from the
    // new .listing-item__condition element.
    const lp = await page.locator('[data-testid="listing-item--lp-holo"] .tcgplus-price-chip').allInnerTexts();
    expect(lp).toContain('-$2.00 (-22.2%)');
    expect(lp).toContain('$0.99 shipping');
  });

  test('falls back to the price-guide header market when SKUs are unknown', async () => {
    await mockTCGplayer(page, {
      productHtml: html,
      productSkus: {},
      skuMarketPrices: {},
      cart: null,
    });
    await page.goto(`https://www.tcgplayer.com/product/${PRODUCT_ID}/test`);
    await expect(page.locator('.listing-item[data-tcgplus-chips="1"]')).toHaveCount(2);

    // The old .price-points selector has no target in the redesigned DOM;
    // the $10.00 must come from the price-guide header's label/value row
    // (NOT the $25.00 sitting in the near-mint comparison table).
    const nm = await page.locator('[data-testid="listing-item--nm"] .tcgplus-price-chip').allInnerTexts();
    expect(nm).toContain('-$2.00 (-20.0%)');

    // The LP-Holofoil listing mismatches the default Near Mint headline
    // condition, so the #70 gate suppresses its delta — shipping chip only.
    const lp = await page.locator('[data-testid="listing-item--lp-holo"] .tcgplus-price-chip').allInnerTexts();
    expect(lp).toEqual(['$0.99 shipping']);

    // No degradation warning: the market was found.
    await expect(page.locator('.tcgplus-panel-warning')).toHaveCount(0);
  });

  test('recommendations-carousel tiles get no chips on product pages', async () => {
    await mockTCGplayer(page, {
      productHtml: html,
      productSkus: { [PRODUCT_ID]: SKUS },
      skuMarketPrices: SKU_PRICES,
      cart: null,
    });
    await page.goto(`https://www.tcgplayer.com/product/${PRODUCT_ID}/test`);
    // Listings chipped (extension is alive and done annotating)...
    await expect(page.locator('.listing-item[data-tcgplus-chips="1"]')).toHaveCount(2);
    // ...but the carousel's product-card tiles stay untouched.
    await expect(page.locator('.product-card__product .tcgplus-price-chip')).toHaveCount(0);
    await expect(page.locator('.product-card__product[data-tcgplus]')).toHaveCount(0);
  });

  test('new-generation shop-by-seller banner gets the location badge', async () => {
    const bannerHtml = html.replace(
      '<section class="listings">',
      `<div class="shop-by-seller-banner">
        <div class="shop-by-seller-banner__message">
          <span class="shop-by-seller-banner__message-text">
            <span class="shop-by-seller-banner__label">You are shopping from</span>
            <span class="shop-by-seller-banner__store">Home Seller</span>
          </span>
        </div>
        <div class="shop-by-seller-banner__actions"><button>Leave</button></div>
      </div>
      <section class="listings">`
    );
    await mockTCGplayer(page, { productHtml: bannerHtml, cart: null });
    await page.route('https://www.tcgplayer.com/search/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: bannerHtml })
    );
    await page.goto('https://www.tcgplayer.com/search/pokemon/test?seller=aaaaaaaa');

    // Badge lands directly after the store name, single-seller mode is
    // detected (per-listing location badges suppressed).
    const badge = page.locator('.shop-by-seller-banner .tcgplus-loc');
    await expect(badge).toHaveText('Atascadero, CA');
    const afterStore = await page.evaluate(() => {
      const store = document.querySelector('.shop-by-seller-banner__store');
      return store && store.nextElementSibling ? store.nextElementSibling.className : null;
    });
    expect(afterStore).toContain('tcgplus-loc');
    await expect(page.locator('.listing-item .tcgplus-loc')).toHaveCount(0);
  });
});
