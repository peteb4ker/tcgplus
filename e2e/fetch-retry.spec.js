// @ts-check
const { test, expect } = require('@playwright/test');
const { launchWithExtension, mockTCGplayer } = require('./helpers/load-extension.js');

const SELLERS = {
  aaaaaaaa: { addressCity: 'Atascadero', addressTerritory: 'CA', addressCountryCode: 'US' },
  bbbbbbbb: { addressCity: 'Portland', addressTerritory: 'OR', addressCountryCode: 'US' },
  cccccccc: { addressCity: 'Austin', addressTerritory: 'TX', addressCountryCode: 'US' },
};

test.describe('Transient fetch failure retry (regression for #98)', () => {
  /** @type {import('@playwright/test').BrowserContext} */
  let ctx;
  /** @type {import('@playwright/test').Page} */
  let page;

  test.afterEach(async () => {
    if (ctx) await ctx.close();
  });

  test('a seller fetch that 500s once succeeds on the next scan', async () => {
    ({ ctx } = await launchWithExtension());
    page = await ctx.newPage();
    await mockTCGplayer(page, { cart: null });

    // Override mockTCGplayer's seller route (most recent registration
    // wins): the FIRST request for each seller key 500s, every request
    // after that succeeds. Pre-fix, the null result was cached and the
    // listing marked data-tcgplus="error" forever, so no retry ever ran.
    /** @type {Map<string, number>} */
    const requests = new Map();
    await page.route('**/sm/seller/*', (route) => {
      const key = route.request().url().split('/').pop() || '';
      const n = (requests.get(key) || 0) + 1;
      requests.set(key, n);
      if (n === 1) return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
      const info = SELLERS[key] || null;
      return route.fulfill({
        status: info ? 200 : 404,
        contentType: 'application/json',
        body: JSON.stringify(info),
      });
    });

    await page.goto('https://www.tcgplayer.com/product/1/test');

    // Initial pass: all three seller fetches fail.
    await expect.poll(() => requests.size, { timeout: 5000 }).toBe(3);
    // Wait until the content script has handled those failures: no listing
    // is mid-fetch. A failed listing must be left re-scannable (marker
    // cleared), never pinned to "error". Don't assert that nothing is
    // "done" yet: any page mutation legitimately triggers a scan, and that
    // scan's retry can land before such an assertion runs. Asserting that
    // in-between state is what made this test flaky.
    await expect.poll(() => page.locator('.listing-item[data-tcgplus="pending"]').count(), { timeout: 5000 }).toBe(0);
    await expect(page.locator('.listing-item[data-tcgplus="error"]')).toHaveCount(0);

    // An external DOM mutation triggers the next scan, the retry cadence
    // (a no-op for listings an earlier scan already retried).
    await page.evaluate(() => {
      document.body.appendChild(document.createElement('div'));
    });

    // Retry succeeds: all three listings annotated with location badges,
    // and the panel shows real tier counts.
    await expect(page.locator('.listing-item[data-tcgplus="done"]')).toHaveCount(3, { timeout: 5000 });
    await expect(page.locator('.tcgplus-loc')).toHaveCount(3);
    await expect(page.locator('.tcgplus-panel')).toContainText('California: 1');
    // Every seller was actually retried: one failed fetch plus one success.
    expect([...requests.values()].every((n) => n >= 2)).toBe(true);
  });
});
