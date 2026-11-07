// @ts-check
const { test, expect } = require('@playwright/test');
const { launchWithExtension } = require('./helpers/load-extension.js');

// The options page runs on the extension's own origin, whose localStorage
// never held the legacy tcgplus.* keys (those lived in tcgplayer.com's page
// localStorage). If the options page ran the migration it would find nothing
// and still set the "migrated" flag, permanently blocking the content script
// (the only context that can see the old keys) from migrating them.
test.describe('Options page does not run the localStorage migration', () => {
  /** @type {import('@playwright/test').BrowserContext} */
  let ctx;

  test.afterEach(async () => {
    if (ctx) await ctx.close();
  });

  test('loading the options page leaves the migrated flag unset', async () => {
    ({ ctx } = await launchWithExtension());
    let [sw] = ctx.serviceWorkers();
    if (!sw) sw = await ctx.waitForEvent('serviceworker');
    const extId = new URL(sw.url()).host;

    const page = await ctx.newPage();
    await page.goto(`chrome-extension://${extId}/options/index.html`);

    // The home-state select is populated only after the load path (which is
    // where the migration call used to live) has finished.
    await expect(page.locator('#home-state option')).not.toHaveCount(0);
    await expect(page.locator('#home-state')).toHaveValue('CA');

    const stored = await page.evaluate(
      () =>
        new Promise((resolve) =>
          chrome.storage.local.get('tcgplus.migratedFromLocalStorage', (items) => resolve(items))
        )
    );
    expect(stored).not.toHaveProperty(['tcgplus.migratedFromLocalStorage']);
  });
});
