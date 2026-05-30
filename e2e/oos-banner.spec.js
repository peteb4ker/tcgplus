// @ts-check
const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const { launchWithExtension, mockTCGplayer } = require('./helpers/load-extension.js');

test.describe('OOS banner on search-grid page', () => {
  /** @type {import('@playwright/test').BrowserContext} */
  let ctx;
  /** @type {import('@playwright/test').Page} */
  let page;

  test.beforeEach(async () => {
    ({ ctx } = await launchWithExtension());
    page = await ctx.newPage();
    const productHtml = await fs.readFile(path.join(__dirname, 'fixtures', 'search-grid-oos.html'), 'utf8');
    await mockTCGplayer(page, { productHtml, cart: null });
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

  test('mounts above the tile grid with a correct count', async () => {
    await page.goto('https://www.tcgplayer.com/search/all/test');
    const banner = page.locator('.tcgplus-oos-banner');
    await expect(banner).toBeVisible();
    await expect(banner.locator('.tcgplus-oos-banner__text')).toContainText(
      '2 tiles with no listings matching your filters'
    );
    await expect(banner.locator('.tcgplus-oos-banner__toggle')).toHaveText('Hide them');

    // Sibling of .search-results: appears just above the grid.
    const isSiblingOfGrid = await page.evaluate(() => {
      const grid = document.querySelector('.search-results');
      const b = document.querySelector('.tcgplus-oos-banner');
      return !!(grid && b && b.parentNode === grid.parentNode && b.nextSibling === grid);
    });
    expect(isSiblingOfGrid).toBe(true);
  });

  test('toggling the button hides and re-shows OOS tiles, banner text follows', async () => {
    await page.goto('https://www.tcgplayer.com/search/all/test');
    const banner = page.locator('.tcgplus-oos-banner');
    await expect(banner).toBeVisible();

    // Initial state: 5 tiles visible, banner offers "Hide them".
    await expect(page.locator('.search-result:visible')).toHaveCount(5);
    await expect(banner.locator('.tcgplus-oos-banner__toggle')).toHaveText('Hide them');

    // Click hide → 2 tiles disappear, banner text + button flip.
    await banner.locator('.tcgplus-oos-banner__toggle').click();
    await expect(banner.locator('.tcgplus-oos-banner__text')).toContainText(
      '2 tiles hidden — no listings match your filters'
    );
    await expect(banner.locator('.tcgplus-oos-banner__toggle')).toHaveText('Show them');
    await expect(page.locator('.search-result:visible')).toHaveCount(3);
    // CSS class on <html> is the proxy for "storage flipped + applyHideOOS ran".
    await expect(page.locator('html.tcgplus-hide-oos')).toHaveCount(1);

    // Click show → tiles return, banner text + button flip back.
    await banner.locator('.tcgplus-oos-banner__toggle').click();
    await expect(banner.locator('.tcgplus-oos-banner__text')).toContainText(
      '2 tiles with no listings matching your filters'
    );
    await expect(banner.locator('.tcgplus-oos-banner__toggle')).toHaveText('Hide them');
    await expect(page.locator('.search-result:visible')).toHaveCount(5);
    await expect(page.locator('html.tcgplus-hide-oos')).toHaveCount(0);
  });

  test('does not mount when no tiles carry the OOS badge', async () => {
    // Re-route the search URL to the original (no-OOS) fixture for this case.
    const baseHtml = await fs.readFile(path.join(__dirname, 'fixtures', 'search-grid-page.html'), 'utf8');
    await page.route('https://www.tcgplayer.com/search/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: baseHtml,
      })
    );
    await page.goto('https://www.tcgplayer.com/search/pokemon/test');
    // Let the content script settle. If the banner is going to mount, it
    // will have done so by the time chips appear.
    await expect(page.locator('.product-card__product[data-tcgplus-chips="1"]')).toHaveCount(3);
    await expect(page.locator('.tcgplus-oos-banner')).toHaveCount(0);
  });
});
