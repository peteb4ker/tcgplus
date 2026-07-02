// @ts-check
const { test, expect } = require('@playwright/test');
const { launchWithExtension } = require('./helpers/load-extension.js');

test.describe('Options page live sync (regression for #102)', () => {
  /** @type {import('@playwright/test').BrowserContext} */
  let ctx;

  test.afterEach(async () => {
    if (ctx) await ctx.close();
  });

  test('controls follow chrome.storage changes made elsewhere', async () => {
    ({ ctx } = await launchWithExtension());
    // Resolve the extension ID from the MV3 service worker URL.
    let [sw] = ctx.serviceWorkers();
    if (!sw) sw = await ctx.waitForEvent('serviceworker');
    const extId = new URL(sw.url()).host;

    const page = await ctx.newPage();
    await page.goto(`chrome-extension://${extId}/options/index.html`);

    const hideOOS = page.locator('#hide-oos');
    const homeSelect = page.locator('#home-state');
    await expect(hideOOS).not.toBeChecked();
    await expect(homeSelect).toHaveValue('CA');

    // Simulate a write from another surface (the search-page banner, a
    // second options tab). chrome.storage.onChanged fires identically for
    // same-page writes, so setting from this page's context exercises the
    // same listener path.
    await page.evaluate(
      () => new Promise((resolve) => chrome.storage.local.set({ 'tcgplus.hideOOS': true }, () => resolve(undefined)))
    );
    await expect(hideOOS).toBeChecked();

    await page.evaluate(
      () => new Promise((resolve) => chrome.storage.local.set({ 'tcgplus.homeState': 'TX' }, () => resolve(undefined)))
    );
    await expect(homeSelect).toHaveValue('TX');
    // The nearby grid re-rendered with the new home state disabled.
    await expect(page.locator('input[data-nearby="TX"]')).toBeDisabled();

    await page.evaluate(
      () =>
        new Promise((resolve) =>
          chrome.storage.local.set({ 'tcgplus.nearbyStates': ['OK', 'NM'] }, () => resolve(undefined))
        )
    );
    await expect(page.locator('input[data-nearby="OK"]')).toBeChecked();
    await expect(page.locator('input[data-nearby="NM"]')).toBeChecked();
    await expect(page.locator('input[data-nearby]:checked')).toHaveCount(2);
  });
});
