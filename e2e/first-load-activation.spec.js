// @ts-check
// Regression tests for #42: the extension must annotate listings after a
// soft (SPA) navigation from a non-listings page (e.g. tcgplayer.com home)
// to a product page, without requiring a manual refresh.
//
// Root cause: the content_scripts `matches` patterns previously listed only
// `/product/*` and `/search/*`. Chrome injects content scripts at document
// load time. TCGplayer's homepage navigates to product pages via history
// pushState (the same document — no new HTML request), so a content script
// that was never injected on the home page never gets a chance to run on
// the product page either. A manual reload triggers a hard navigation, the
// URL now matches, the script injects, and everything works. The fix is to
// broaden `matches` to `https://www.tcgplayer.com/*` so the script is alive
// on the home page and its MutationObserver picks up the SPA's DOM swap.

const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const { launchWithExtension, mockTCGplayer } = require('./helpers/load-extension.js');

/**
 * Build the HTML for a single listing-item used by several tests below.
 *
 * @param {{ id: string; sellerLabel: string; sellerKey: string; price: string; shipping: string }} opts
 */
function listingHtml(opts) {
  return `
    <article class="listing-item" data-testid="listing-item--${opts.id}">
      <div class="listing-item__listing-data">
        <div class="listing-item__listing-data__seller">
          <div class="seller-info">
            <a class="seller-info__name" href="/sellers/${opts.sellerLabel}/${opts.sellerKey}">${opts.sellerLabel}</a>
            <div class="seller-info__content"></div>
          </div>
        </div>
        <div class="listing-item__listing-data__info">
          <h3 class="listing-item__listing-data__info__condition"><a href="#">Near Mint</a></h3>
          <div class="listing-item__listing-data__info__price">${opts.price}</div>
          <span>${opts.shipping}</span>
        </div>
      </div>
    </article>
  `;
}

test.describe('First-load activation (regression for #42)', () => {
  /** @type {import('@playwright/test').BrowserContext} */
  let ctx;
  /** @type {import('@playwright/test').Page} */
  let page;

  test.afterEach(async () => {
    if (ctx) await ctx.close();
  });

  test('annotates a product page reached by SPA navigation from the homepage', async () => {
    // This is the test that actually traps the user-reported bug. Without
    // the manifest fix that broadens content_scripts matches to include
    // the homepage, the content script never injects on `/`, so the soft
    // navigation to `/product/*` (no new HTML) leaves the page un-annotated.
    ({ ctx } = await launchWithExtension());
    page = await ctx.newPage();
    const productHtml = await fs.readFile(path.join(__dirname, 'fixtures', 'product-page.html'), 'utf8');
    await mockTCGplayer(page, { productHtml });

    // Mock the homepage with a minimal shell that has a link to a product.
    await page.route('https://www.tcgplayer.com/', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: `<!doctype html><html><head><meta charset="utf-8"><title>Home</title></head>
          <body>
            <header>
              <button class="mp-header__content__cart-count">
                <span class="mp-header__content__cart-count__chip">0</span>
              </button>
            </header>
            <a id="product-link" href="/product/1">Go to product</a>
          </body></html>`,
      });
    });

    await page.goto('https://www.tcgplayer.com/');
    // The content script should now inject on the homepage (after the fix).
    // Wait for its load log so the subsequent SPA navigation is observed.
    await page.waitForEvent('console', (msg) => msg.text().includes('vendor location extension loaded'), {
      timeout: 5000,
    });

    // Simulate TCGplayer's SPA navigation: history.pushState + DOM swap.
    // The content script's MutationObserver should pick this up.
    const productBody = productHtml.replace(/^[\s\S]*?<body[^>]*>/, '').replace(/<\/body>[\s\S]*$/, '');
    await page.evaluate(
      ({ body }) => {
        history.pushState({}, '', '/product/1');
        document.body.innerHTML = body;
      },
      { body: productBody }
    );

    await expect(page.locator('.listing-item[data-tcgplus-chips="1"]')).toHaveCount(3, { timeout: 5000 });
    await expect(page.locator('.tcgplus-panel')).toBeVisible();
  });

  test('annotates listings injected after window.load (deferred hydration)', async () => {
    ({ ctx } = await launchWithExtension());
    page = await ctx.newPage();
    const html = await fs.readFile(path.join(__dirname, 'fixtures', 'product-page-deferred-hydration.html'), 'utf8');
    await mockTCGplayer(page, { productHtml: html });
    await page.goto('https://www.tcgplayer.com/product/1/test');
    // Fixture injects listings via setTimeout(50) on window.load.
    await expect(page.locator('.listing-item[data-tcgplus-chips="1"]')).toHaveCount(3, { timeout: 5000 });
    await expect(page.locator('.tcgplus-panel')).toBeVisible();
  });

  test('annotates listings injected very late (1500ms after load)', async () => {
    ({ ctx } = await launchWithExtension());
    page = await ctx.newPage();
    const html = await fs.readFile(path.join(__dirname, 'fixtures', 'product-page.html'), 'utf8');
    const shellHtml = html.replace(
      /<section class="listings">[\s\S]*?<\/section>/,
      '<section class="listings"></section>'
    );
    await mockTCGplayer(page, { productHtml: shellHtml });
    await page.goto('https://www.tcgplayer.com/product/1/test');
    await page.waitForEvent('console', (msg) => msg.text().includes('vendor location extension loaded'));
    await page.waitForTimeout(1500);
    await page.evaluate(
      ({ a, b, c }) => {
        const listings = document.querySelector('.listings');
        if (!listings) return;
        listings.innerHTML = a + b + c;
      },
      {
        a: listingHtml({
          id: '0',
          sellerLabel: 'Home-Seller',
          sellerKey: 'aaaaaaaa',
          price: '$8.00',
          shipping: ' Shipping: <a href="#"> Included </a>',
        }),
        b: listingHtml({
          id: '1',
          sellerLabel: 'Nearby-Seller',
          sellerKey: 'bbbbbbbb',
          price: '$11.00',
          shipping: '+ $1.31 Shipping',
        }),
        c: listingHtml({
          id: '2',
          sellerLabel: 'Other-Seller',
          sellerKey: 'cccccccc',
          price: '$15.00',
          shipping: '+ $3.99 Shipping',
        }),
      }
    );
    await expect(page.locator('.listing-item[data-tcgplus-chips="1"]')).toHaveCount(3, { timeout: 5000 });
    await expect(page.locator('.tcgplus-panel')).toBeVisible();
  });

  test('annotates listings when market price arrives after the listings', async () => {
    ({ ctx } = await launchWithExtension());
    page = await ctx.newPage();
    const html = await fs.readFile(path.join(__dirname, 'fixtures', 'product-page.html'), 'utf8');
    let shellHtml = html.replace(
      /<section class="price-points">[\s\S]*?<\/section>/,
      '<section class="price-points"></section>'
    );
    shellHtml = shellHtml.replace(
      /<section class="listings">[\s\S]*?<\/section>/,
      '<section class="listings"></section>'
    );
    await mockTCGplayer(page, { productHtml: shellHtml });
    await page.goto('https://www.tcgplayer.com/product/1/test');
    await page.waitForEvent('console', (msg) => msg.text().includes('vendor location extension loaded'));

    await page.evaluate(
      ({ a, b, c }) => {
        document.querySelector('.listings').innerHTML = a + b + c;
      },
      {
        a: listingHtml({
          id: '0',
          sellerLabel: 'Home-Seller',
          sellerKey: 'aaaaaaaa',
          price: '$8.00',
          shipping: ' Shipping: <a href="#"> Included </a>',
        }),
        b: listingHtml({
          id: '1',
          sellerLabel: 'Nearby-Seller',
          sellerKey: 'bbbbbbbb',
          price: '$11.00',
          shipping: '+ $1.31 Shipping',
        }),
        c: listingHtml({
          id: '2',
          sellerLabel: 'Other-Seller',
          sellerKey: 'cccccccc',
          price: '$15.00',
          shipping: '+ $3.99 Shipping',
        }),
      }
    );

    await expect(page.locator('.listing-item[data-tcgplus-tier]')).toHaveCount(3, { timeout: 5000 });

    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const pp = document.querySelector('.price-points');
      pp.innerHTML = '<div>Market Price:</div><span class="price-points__upper__price">$10.00</span>';
    });

    await expect(page.locator('.listing-item[data-tcgplus-chips="1"]')).toHaveCount(3, { timeout: 5000 });
    const chipTexts = await page.locator('.tcgplus-price-chip').allInnerTexts();
    expect(chipTexts).toContain('-$2.00 (-20.0%)');
  });
});
