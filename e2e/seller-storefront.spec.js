// @ts-check
// Coverage for #161: seller storefront pages (/sellers/<name>/<key>) render
// the same .product-card__product grid tiles as the search grid, but the
// pathname is neither /search/ nor /product/. The fixture replays the real
// .product-grid ancestor chain; these tests pin the chip behaviour there.
const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const { launchWithExtension, mockTCGplayer } = require('./helpers/load-extension.js');

const STOREFRONT_URL =
  'https://www.tcgplayer.com/sellers/Test-Seller/aaaaaaaa?productLineName=pokemon&sort=market-high-low';

test.describe('Seller storefront page', () => {
  /** @type {import('@playwright/test').BrowserContext} */
  let ctx;
  /** @type {import('@playwright/test').Page} */
  let page;

  test.beforeEach(async () => {
    ({ ctx } = await launchWithExtension());
    page = await ctx.newPage();
    const html = await fs.readFile(path.join(__dirname, 'fixtures', 'seller-storefront-page.html'), 'utf8');
    await mockTCGplayer(page, { productHtml: html, cart: null });
    await page.route('https://www.tcgplayer.com/sellers/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html })
    );
  });

  test.afterEach(async () => {
    if (ctx) await ctx.close();
  });

  test('renders a delta chip on each storefront tile', async () => {
    await page.goto(STOREFRONT_URL);
    // Three tiles: $8 vs $10 (-20%), $11 vs $10 (+10%), $15 vs $10 (+50%).
    await expect(page.locator('.product-card__product[data-tcgplus-chips="1"]')).toHaveCount(3);
    const chipTexts = await page.locator('.tcgplus-price-chips--card .tcgplus-price-chip').allInnerTexts();
    expect(chipTexts).toContain('-$2.00 (-20.0%)');
    expect(chipTexts).toContain('+$1.00 (+10.0%)');
    expect(chipTexts).toContain('+$5.00 (+50.0%)');
    // Same shipping-inclusive tile price as the search grid, same tooltip.
    await expect(page.locator('.tcgplus-price-chips--card .tcgplus-price-chip').first()).toHaveAttribute(
      'title',
      'vs market $10.00 (tile price includes shipping)'
    );
  });

  test('grid-only surface: no shipping/Deal chips, no panel, no OOS banner', async () => {
    await page.goto(STOREFRONT_URL);
    await expect(page.locator('.product-card__product[data-tcgplus-chips="1"]')).toHaveCount(3);
    await expect(page.locator('.tcgplus-price-chips--card .tcgplus-ship-chip')).toHaveCount(0);
    await expect(page.locator('.tcgplus-price-chips--card .tcgplus-deal-chip')).toHaveCount(0);
    await expect(page.locator('.tcgplus-panel')).toHaveCount(0);
    await expect(page.locator('.tcgplus-oos-banner')).toHaveCount(0);
  });
});
