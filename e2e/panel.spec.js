// @ts-check
const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const { launchWithExtension, mockTCGplayer } = require('./helpers/load-extension.js');

test.describe('Floating panel and chips', () => {
  /** @type {import('@playwright/test').BrowserContext} */
  let ctx;
  /** @type {import('@playwright/test').Page} */
  let page;

  test.beforeEach(async () => {
    ({ ctx } = await launchWithExtension());
    page = await ctx.newPage();
    await mockTCGplayer(page);
  });

  test.afterEach(async () => {
    if (ctx) await ctx.close();
  });

  test('renders the panel with tier counts after listings load', async () => {
    await page.goto('https://www.tcgplayer.com/product/1/test');
    const panel = page.locator('.tcgplus-panel');
    await expect(panel).toBeVisible();

    // Default home is California; first listing is from CA, second OR (nearby), third TX (other).
    await expect(panel.locator('.tcgplus-row-home')).toContainText('California');
    await expect(panel.locator('.tcgplus-row-home b')).toHaveText('1');
    await expect(panel.locator('.tcgplus-row-nearby b')).toHaveText('1');
    await expect(panel.locator('.tcgplus-row-other b')).toHaveText('1');
  });

  test('renders price + shipping chips on each listing', async () => {
    await page.goto('https://www.tcgplayer.com/product/1/test');
    await expect(page.locator('.tcgplus-price-chip').first()).toBeVisible();
    const chipTexts = await page.locator('.tcgplus-price-chip').allInnerTexts();
    // First listing: $8 vs $10 market = -$2.00 (-20.0%), free shipping → Deal
    expect(chipTexts).toContain('-$2.00 (-20.0%)');
    expect(chipTexts).toContain('Shipping: Included');
    // Deal chip uses CSS text-transform: uppercase, so allInnerTexts returns DEAL.
    expect(chipTexts).toContain('DEAL');
    // Second listing: $11 vs $10 = +$1.00 (+10.0%), $1.31 shipping
    expect(chipTexts).toContain('+$1.00 (+10.0%)');
    expect(chipTexts).toContain('$1.31 shipping');
    // Third listing: $15 vs $10 = +$5.00 (+50.0%), $3.99 high shipping
    expect(chipTexts).toContain('+$5.00 (+50.0%)');
    expect(chipTexts).toContain('$3.99 high shipping');
  });

  test('renders the cart subtotal next to the cart count', async () => {
    await page.goto('https://www.tcgplayer.com/product/1/test');
    const subtotal = page.locator('.tcgplus-cart-subtotal');
    await expect(subtotal).toHaveText('$8.00');
  });

  test('clicking a tier row filters the listings', async () => {
    await page.goto('https://www.tcgplayer.com/product/1/test');
    // Wait until all three listings are tier-classified so the CSS filter
    // rule can correctly identify the home listing.
    await expect(page.locator('.listing-item[data-tcgplus-tier]')).toHaveCount(3);

    await page.locator('.tcgplus-panel-row[data-tier="home"]').click();
    await expect(page.locator('html')).toHaveClass(/tcgplus-filter-home/);

    // Only the home listing stays visible.
    await expect(page.locator('.listing-item[data-tcgplus-tier="home"]')).toBeVisible();
    await expect(page.locator('.listing-item[data-tcgplus-tier="nearby"]')).toBeHidden();
    await expect(page.locator('.listing-item[data-tcgplus-tier="other"]')).toBeHidden();
  });

  test('OOS hide rule hides search-result tiles carrying mp-oos-badge', async () => {
    const html = await fs.readFile(require('node:path').join(__dirname, 'fixtures', 'product-page.html'), 'utf8');
    const withOOS =
      html +
      `<div class="search-result"><div class="product-card"><span class="tcg-chip mp-oos-badge"><span class="tcg-chip__content">Out of Stock</span></span><div>OOS card</div></div></div>` +
      `<div class="search-result"><div class="product-card"><div>In stock card</div></div></div>`;
    await mockTCGplayer(page, { productHtml: withOOS });

    // Pre-set the storage flag via the extension's options page.
    await page.evaluate(async () => {
      // chrome is unavailable in main world. Round-trip via DOM event isn't
      // wired, so we set via document.cookie + reload? No — flip it via the
      // options page directly.
    });

    await page.goto('https://www.tcgplayer.com/product/1/test');
    // Both tiles initially visible.
    await expect(page.locator('.search-result').filter({ hasText: 'OOS card' })).toBeVisible();
    await expect(page.locator('.search-result').filter({ hasText: 'In stock card' })).toBeVisible();

    // Toggle the rule by injecting the same body class the extension uses.
    // (We don't drive the options page from this test; the OOS-hide CSS rule
    // is the part we want to verify here.)
    await page.evaluate(() => document.documentElement.classList.add('tcgplus-hide-oos'));
    await expect(page.locator('.search-result').filter({ hasText: 'OOS card' })).toBeHidden();
    await expect(page.locator('.search-result').filter({ hasText: 'In stock card' })).toBeVisible();
  });
});
