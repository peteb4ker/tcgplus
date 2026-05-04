// @ts-check
// Helpers for launching Chromium with the unpacked TCGPlus extension and
// intercepting tcgplayer.com / seller-stores-backend / mpgateway requests
// so tests run with no real network.

const path = require('node:path');
const fs = require('node:fs/promises');
const { chromium } = require('@playwright/test');

const EXT_PATH = path.resolve(__dirname, '..', '..');
const FIXTURES = path.resolve(__dirname, '..', 'fixtures');

/**
 * Launch a persistent Chromium context with the TCGPlus extension loaded.
 * Returns the context plus a helper to register tcgplayer.com routes on a
 * page. Each test should call ctx.close() when done.
 */
async function launchWithExtension() {
  const userDataDir = await fs.mkdtemp(path.join(require('node:os').tmpdir(), 'tcgplus-e2e-'));
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    args: [
      '--headless=new',
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
      '--no-default-browser-check',
      '--no-first-run',
    ],
  });
  return { ctx, userDataDir };
}

/**
 * Wire up route handlers so any TCGplayer fetch is served from a fixture
 * file or a small in-memory JSON stub. Pass a config to override defaults.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ productHtml?: string; sellers?: Record<string, object>; cart?: object | null }} [opts]
 */
async function mockTCGplayer(page, opts = {}) {
  const productHtml = opts.productHtml || (await fs.readFile(path.join(FIXTURES, 'product-page.html'), 'utf8'));
  const sellers = opts.sellers || {
    aaaaaaaa: { addressCity: 'Atascadero', addressTerritory: 'CA', addressCountryCode: 'US' },
    bbbbbbbb: { addressCity: 'Portland', addressTerritory: 'OR', addressCountryCode: 'US' },
    cccccccc: { addressCity: 'Austin', addressTerritory: 'TX', addressCountryCode: 'US' },
  };
  /** @type {object | null} */
  const cart =
    opts.cart === undefined
      ? {
          itemCount: 1,
          itemSubtotal: 8.0,
          requestedTotalCost: 8.0,
          sellers: [{ sellerKey: 'aaaaaaaa', productTotalCost: 8.0, shippingCost: 0 }],
        }
      : opts.cart;

  // Set the StoreCart cookie so getCartKey() finds something.
  await page.context().addCookies([
    {
      name: 'StoreCart_PRODUCTION',
      value: 'CK=deadbeefdeadbeefdeadbeefdeadbeef&Ignore=false',
      domain: '.tcgplayer.com',
      path: '/',
      secure: true,
      httpOnly: false,
      sameSite: 'Lax',
    },
  ]);

  await page.route('**/sm/seller/*', (route) => {
    const url = new URL(route.request().url());
    const key = url.pathname.split('/').pop() || '';
    const info = sellers[key] || null;
    route.fulfill({
      status: info ? 200 : 404,
      contentType: 'application/json',
      body: JSON.stringify(info),
    });
  });

  await page.route('**/v1/cart/**', (route) => {
    if (cart === null) {
      route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
      return;
    }
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ errors: [], results: [cart] }),
    });
  });

  await page.route('https://www.tcgplayer.com/product/**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: productHtml,
    });
  });
}

module.exports = { launchWithExtension, mockTCGplayer, EXT_PATH, FIXTURES };
