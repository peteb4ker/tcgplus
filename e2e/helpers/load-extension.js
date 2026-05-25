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
 * @param {{
 *   productHtml?: string;
 *   cartHtml?: string;
 *   sellers?: Record<string, object>;
 *   cart?: object | null;
 *   productSkus?: Record<number, Array<{ sku: number; condition: string; variant: string; language?: string }>>;
 *   skuMarketPrices?: Record<number, { marketPrice: number | null; lowestPrice?: number; highestPrice?: number }>;
 * }} [opts]
 */
async function mockTCGplayer(page, opts = {}) {
  const productHtml = opts.productHtml || (await fs.readFile(path.join(FIXTURES, 'product-page.html'), 'utf8'));
  const sellers = opts.sellers || {
    aaaaaaaa: { addressCity: 'Atascadero', addressTerritory: 'CA', addressCountryCode: 'US' },
    bbbbbbbb: { addressCity: 'Portland', addressTerritory: 'OR', addressCountryCode: 'US' },
    cccccccc: { addressCity: 'Austin', addressTerritory: 'TX', addressCountryCode: 'US' },
  };
  const productSkus = opts.productSkus || {};
  const skuMarketPrices = opts.skuMarketPrices || {};
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

  // /cart is a separate fixture when the test wants to exercise the
  // cart-page chips path. Not all tests need it.
  if (opts.cartHtml) {
    await page.route('https://www.tcgplayer.com/cart**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: opts.cartHtml,
      });
    });
  }

  // mp-search-api: per-product SKU list (variant + condition catalog).
  // Returns empty `skus` when the product isn't in opts.productSkus, which
  // makes the extension's per-SKU lookup return null and fall back to the
  // headline market price — the legacy code path tests already exercise.
  await page.route('https://mp-search-api.tcgplayer.com/v2/product/*/details*', (route) => {
    const url = new URL(route.request().url());
    const m = url.pathname.match(/\/product\/(\d+)\//);
    const productId = m ? Number(m[1]) : null;
    const skus = (productId != null && productSkus[productId]) || [];
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ productId, skus }),
    });
  });

  // mpgateway: per-SKU market prices. The real endpoint expects a POST
  // body with { skuIds: [...] }; we honour that by returning a row for
  // each requested skuId, looking up opts.skuMarketPrices for the value.
  await page.route('https://mpgateway.tcgplayer.com/v1/pricepoints/marketprice/skus/search*', async (route) => {
    let skuIds = [];
    try {
      const body = JSON.parse(route.request().postData() || '{}');
      if (Array.isArray(body.skuIds)) skuIds = body.skuIds;
    } catch {
      // empty/malformed body → empty response
    }
    const rows = skuIds.map((skuId) => ({
      skuId,
      marketPrice: skuMarketPrices[skuId] ? skuMarketPrices[skuId].marketPrice : null,
      lowestPrice: skuMarketPrices[skuId] ? (skuMarketPrices[skuId].lowestPrice ?? null) : null,
      highestPrice: skuMarketPrices[skuId] ? (skuMarketPrices[skuId].highestPrice ?? null) : null,
    }));
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(rows),
    });
  });
}

module.exports = { launchWithExtension, mockTCGplayer, EXT_PATH, FIXTURES };
