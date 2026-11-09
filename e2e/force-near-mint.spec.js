// @ts-check
// "Always Near Mint" rewrites /product/ and /search/ URLs to carry
// Condition=Near Mint. TCGplayer is a Vue SPA, so the rewrite has to
// re-run on client-side route changes too, not only on a full page load.

const { test, expect } = require('@playwright/test');
const { launchWithExtension, mockTCGplayer } = require('./helpers/load-extension.js');

/**
 * @param {import('@playwright/test').BrowserContext} ctx
 * @param {Record<string, unknown>} items
 */
async function setStorage(ctx, items) {
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  await sw.evaluate((i) => chrome.storage.local.set(i), items);
}

/** @param {import('@playwright/test').Page} page */
async function waitReady(page) {
  await page.waitForFunction(() => document.documentElement.dataset.tcgplusReady === '1', { timeout: 5000 });
}

test.describe('Always Near Mint', () => {
  /** @type {import('@playwright/test').BrowserContext} */
  let ctx;

  test.afterEach(async () => {
    if (ctx) await ctx.close();
  });

  test('rewrites the URL on initial load', async () => {
    ({ ctx } = await launchWithExtension());
    await setStorage(ctx, { 'tcgplus.forceNearMint': true });
    const page = await ctx.newPage();
    await mockTCGplayer(page);
    await page.goto('https://www.tcgplayer.com/product/1');
    await page.waitForURL(/\/product\/1\?Condition=Near\+Mint$/, { timeout: 5000 });
  });

  test('leaves a URL that already has Condition=Near Mint alone', async () => {
    ({ ctx } = await launchWithExtension());
    await setStorage(ctx, { 'tcgplus.forceNearMint': true });
    const page = await ctx.newPage();
    await mockTCGplayer(page);
    let loads = 0;
    page.on('load', () => loads++);
    await page.goto('https://www.tcgplayer.com/product/1?Condition=Near+Mint');
    await waitReady(page);
    await page.waitForTimeout(500);
    expect(page.url()).toBe('https://www.tcgplayer.com/product/1?Condition=Near+Mint');
    expect(loads).toBe(1);
  });

  test('rewrites the URL after an SPA route change', async () => {
    ({ ctx } = await launchWithExtension());
    await setStorage(ctx, { 'tcgplus.forceNearMint': true });
    const page = await ctx.newPage();
    await mockTCGplayer(page);
    await page.goto('https://www.tcgplayer.com/product/1?Condition=Near+Mint');
    await waitReady(page);

    // Client-side route change to a product URL without the param, with
    // the DOM swap that accompanies it (that's what wakes the scan).
    await page.evaluate(() => {
      history.pushState({}, '', '/product/2');
      const main = document.createElement('main');
      main.textContent = 'product 2';
      document.body.appendChild(main);
    });
    await page.waitForURL(/\/product\/2\?Condition=Near\+Mint$/, { timeout: 5000 });
  });

  test('lets the site drop Condition on the same page without reloading (#196)', async () => {
    ({ ctx } = await launchWithExtension());
    await setStorage(ctx, { 'tcgplus.forceNearMint': true });
    const page = await ctx.newPage();
    await mockTCGplayer(page);
    await page.route('https://www.tcgplayer.com/search/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: '<!doctype html><html><body><main class="search-results"></main></body></html>',
      })
    );
    let loads = 0;
    page.on('load', () => loads++);
    await page.goto('https://www.tcgplayer.com/search/all/product?q=asdfasdfas&seller=aaaaaaaa&Condition=Near+Mint');
    await waitReady(page);

    // When nothing matches, TCGplayer's own script strips the Condition
    // (and seller) facets from the URL with replaceState and re-renders
    // the empty results. Rewriting it back reloads into the same state,
    // forever.
    await page.evaluate(() => {
      history.replaceState(history.state, '', '/search/all/product?q=asdfasdfas');
      const p = document.createElement('p');
      p.textContent = 'No results';
      document.body.appendChild(p);
    });
    await page.waitForTimeout(800);
    expect(page.url()).toBe('https://www.tcgplayer.com/search/all/product?q=asdfasdfas');
    expect(loads).toBe(1);
  });

  test('does nothing on SPA route changes when the setting is off', async () => {
    ({ ctx } = await launchWithExtension());
    const page = await ctx.newPage();
    await mockTCGplayer(page);
    await page.goto('https://www.tcgplayer.com/product/1');
    await waitReady(page);
    await page.evaluate(() => {
      history.pushState({}, '', '/product/2');
      document.body.appendChild(document.createElement('main'));
    });
    await page.waitForTimeout(800);
    expect(page.url()).toBe('https://www.tcgplayer.com/product/2');
  });
});
