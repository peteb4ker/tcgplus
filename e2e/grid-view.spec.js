// @ts-check
const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const { launchWithExtension, mockTCGplayer } = require('./helpers/load-extension.js');

test.describe('Grid view (search page)', () => {
  /** @type {import('@playwright/test').BrowserContext} */
  let ctx;
  /** @type {import('@playwright/test').Page} */
  let page;

  test.beforeEach(async () => {
    ({ ctx } = await launchWithExtension());
    page = await ctx.newPage();
    const productHtml = await fs.readFile(path.join(__dirname, 'fixtures', 'search-grid-page.html'), 'utf8');
    await mockTCGplayer(page, { productHtml, cart: null });
    // Re-route /product/* and /search/* to the grid fixture so the manifest
    // match pattern fires.
    await page.route('https://www.tcgplayer.com/search/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: productHtml,
      })
    );
  });

  test.afterEach(async () => {
    if (ctx) await ctx.close();
  });

  test('renders a delta chip on each grid tile', async () => {
    await page.goto('https://www.tcgplayer.com/search/pokemon/test');
    // Three grid cards: $8 vs $10 (-20%), $11 vs $10 (+10%), $15 vs $10 (+50%).
    await expect(page.locator('.product-card__product[data-tcgplus-chips="1"]')).toHaveCount(3);
    const chipTexts = await page.locator('.tcgplus-price-chips--card .tcgplus-price-chip').allInnerTexts();
    expect(chipTexts).toContain('-$2.00 (-20.0%)');
    expect(chipTexts).toContain('+$1.00 (+10.0%)');
    expect(chipTexts).toContain('+$5.00 (+50.0%)');
    // The grid tile's only price is shipping-inclusive, so the tooltip
    // must disclose that the delta compares an all-in price (#99).
    await expect(page.locator('.tcgplus-price-chips--card .tcgplus-price-chip').first()).toHaveAttribute(
      'title',
      'vs market $10.00 (tile price includes shipping)'
    );
  });

  test('does not render shipping or Deal chips in grid view', async () => {
    await page.goto('https://www.tcgplayer.com/search/pokemon/test');
    await expect(page.locator('.product-card__product[data-tcgplus-chips="1"]')).toHaveCount(3);
    await expect(page.locator('.tcgplus-price-chips--card .tcgplus-ship-chip')).toHaveCount(0);
    await expect(page.locator('.tcgplus-price-chips--card .tcgplus-deal-chip')).toHaveCount(0);
  });
});
