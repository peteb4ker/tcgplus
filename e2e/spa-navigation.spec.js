// @ts-check
// Regression tests for the realistic SPA navigation flow on TCGplayer:
// the user lands on the homepage, clicks a product, clicks back, clicks
// another product, etc. The content script stays alive across all of it
// (single document, just pushState route changes), so all the per-page
// state must reset between products.
//
// Closes the consecutive-nav and product→product coverage gaps from #56,
// and the cart-staleness fix from #45.

const { test, expect } = require('@playwright/test');
const { launchWithExtension, mockTCGplayer } = require('./helpers/load-extension.js');

/** Minimal homepage shell (no listings, no market price). */
function homepageBody() {
  return `
    <header>
      <button class="mp-header__content__cart-count">
        <span class="mp-header__content__cart-count__chip">0</span>
      </button>
    </header>
    <main>Welcome to TCGplayer</main>
  `;
}

/**
 * Inline product-page body with one listing and a tunable market price.
 * Avoids reusing the disk fixture so each test can vary the market.
 *
 * @param {{ marketPrice: string; listingPrice: string; sellerKey?: string }} opts
 */
function productBody(opts) {
  const sellerKey = opts.sellerKey || 'aaaaaaaa';
  return `
    <header>
      <button class="mp-header__content__cart-count">
        <span class="mp-header__content__cart-count__chip">0</span>
      </button>
    </header>
    <section class="price-points">
      <div>Market Price:</div>
      <span class="price-points__upper__price">${opts.marketPrice}</span>
    </section>
    <section class="listings">
      <article class="listing-item" data-testid="listing-item--0">
        <div class="listing-item__listing-data">
          <div class="listing-item__listing-data__seller">
            <div class="seller-info">
              <a class="seller-info__name" href="/sellers/Test/${sellerKey}">Test Seller</a>
              <div class="seller-info__content"></div>
            </div>
          </div>
          <div class="listing-item__listing-data__info">
            <h3 class="listing-item__listing-data__info__condition"><a href="#">Near Mint</a></h3>
            <div class="listing-item__listing-data__info__price">${opts.listingPrice}</div>
            <span> Shipping: <a href="#"> Included </a></span>
          </div>
        </div>
      </article>
    </section>
  `;
}

test.describe('SPA navigation across products and home', () => {
  /** @type {import('@playwright/test').BrowserContext} */
  let ctx;
  /** @type {import('@playwright/test').Page} */
  let page;

  test.afterEach(async () => {
    if (ctx) await ctx.close();
  });

  test('home → product A → home → product B keeps panel + chip state in sync', async () => {
    ({ ctx } = await launchWithExtension());
    page = await ctx.newPage();
    await mockTCGplayer(page);
    await page.route('https://www.tcgplayer.com/', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: `<!doctype html><html><body>${homepageBody()}</body></html>`,
      })
    );

    await page.goto('https://www.tcgplayer.com/');
    await page.waitForEvent('console', (m) => m.text().includes('vendor location extension loaded'), {
      timeout: 5000,
    });
    // Step 1: homepage — no panel.
    await expect(page.locator('.tcgplus-panel')).toHaveCount(0);

    // Step 2: SPA → product A (market $10, listing $8 → -$2.00 (-20.0%)).
    await page.evaluate(
      ({ body }) => {
        history.pushState({}, '', '/product/1');
        document.body.innerHTML = body;
      },
      { body: productBody({ marketPrice: '$10.00', listingPrice: '$8.00' }) }
    );
    await expect(page.locator('.listing-item[data-tcgplus-chips="1"]')).toHaveCount(1, { timeout: 5000 });
    await expect(page.locator('.tcgplus-panel')).toBeVisible();
    let chips = await page.locator('.tcgplus-price-chip').allInnerTexts();
    expect(chips).toContain('-$2.00 (-20.0%)');

    // Step 3: SPA → home. Panel must tear down again.
    await page.evaluate(
      ({ body }) => {
        history.pushState({}, '', '/');
        document.body.innerHTML = body;
      },
      { body: homepageBody() }
    );
    await expect(page.locator('.tcgplus-panel')).toHaveCount(0, { timeout: 5000 });

    // Step 4: SPA → product B (market $20, listing $15 → -$5.00 (-25.0%)).
    // The point is that product B's chips must use B's market, not A's
    // $10. If the market-price cache leaked we'd see different numbers.
    await page.evaluate(
      ({ body }) => {
        history.pushState({}, '', '/product/2');
        document.body.innerHTML = body;
      },
      { body: productBody({ marketPrice: '$20.00', listingPrice: '$15.00' }) }
    );
    await expect(page.locator('.listing-item[data-tcgplus-chips="1"]')).toHaveCount(1, { timeout: 5000 });
    await expect(page.locator('.tcgplus-panel')).toBeVisible();
    chips = await page.locator('.tcgplus-price-chip').allInnerTexts();
    expect(chips).toContain('-$5.00 (-25.0%)');
    expect(chips).not.toContain('-$2.00 (-20.0%)'); // No stale chip from product A
  });

  test('product A → product B (no homepage between) refreshes chips against B`s market', async () => {
    ({ ctx } = await launchWithExtension());
    page = await ctx.newPage();
    await mockTCGplayer(page);

    // Initial page load on product A.
    await page.route('https://www.tcgplayer.com/product/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: `<!doctype html><html><body>${productBody({ marketPrice: '$10.00', listingPrice: '$8.00' })}</body></html>`,
      })
    );
    await page.goto('https://www.tcgplayer.com/product/1');
    await expect(page.locator('.listing-item[data-tcgplus-chips="1"]')).toHaveCount(1, { timeout: 5000 });
    let chips = await page.locator('.tcgplus-price-chip').allInnerTexts();
    expect(chips).toContain('-$2.00 (-20.0%)');

    // SPA-nav directly to product B without visiting home. Different
    // market price, different listing price.
    await page.evaluate(
      ({ body }) => {
        history.pushState({}, '', '/product/2');
        document.body.innerHTML = body;
      },
      { body: productBody({ marketPrice: '$20.00', listingPrice: '$15.00' }) }
    );

    // Wait for B's chip to appear. Using a hasText filter keeps the locator
    // unambiguous (the chip row has three chips: Deal/delta/shipping).
    await expect(page.locator('.tcgplus-price-chip', { hasText: '-$5.00' })).toBeVisible({ timeout: 5000 });
    chips = await page.locator('.tcgplus-price-chip').allInnerTexts();
    expect(chips).toContain('-$5.00 (-25.0%)');
    expect(chips).not.toContain('-$2.00 (-20.0%)');

    // Listings count is still 1 (B has one listing, not A's leaking through).
    await expect(page.locator('.listing-item[data-tcgplus-chips="1"]')).toHaveCount(1);
  });

  test('cart subtotal updates after an SPA-induced cart-count remount (regression for #45)', async () => {
    ({ ctx } = await launchWithExtension());
    page = await ctx.newPage();

    await mockTCGplayer(page);
    // Override the cart route from mockTCGplayer with a closure-captured
    // value so we can vary the subtotal between fetches and prove the
    // post-SPA mutation actually triggered a fresh fetch. Playwright runs
    // the most recently registered matching handler first, so this wins.
    let currentSubtotal = 8;
    await page.route('**/v1/cart/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          errors: [],
          results: [
            {
              itemCount: 1,
              itemSubtotal: currentSubtotal,
              sellers: [{ sellerKey: 'aaaaaaaa', productTotalCost: currentSubtotal, shippingCost: 0 }],
            },
          ],
        }),
      })
    );

    await page.goto('https://www.tcgplayer.com/product/1/test');
    const subtotal = page.locator('.mp-header__content__cart-count .tcgplus-cart-subtotal');
    await expect(subtotal).toHaveText('$8.00');

    // SPA-nav with a body swap that REPLACES the cart-count chip element
    // wholesale. After this, the old cart-count chip is detached. If the
    // observer was attached to the old element and never re-attaches, the
    // cart subtotal will stay frozen at $8.00 even when the chip changes.
    currentSubtotal = 25;
    await page.evaluate(
      ({ body }) => {
        history.pushState({}, '', '/product/2');
        document.body.innerHTML = body;
      },
      { body: productBody({ marketPrice: '$20.00', listingPrice: '$15.00' }) }
    );
    // Wait for the content script to re-scan + re-attach the cart observer
    // and render the new cart badge from the cart fetch.
    await expect(page.locator('.mp-header__content__cart-count .tcgplus-cart-subtotal')).toHaveText('$25.00', {
      timeout: 5000,
    });

    // Now simulate the user adding an item to the cart on this new product
    // page. TCGplayer mutates the chip's text. With the fix, our observer
    // is attached to the *new* chip element and fires refreshCart.
    currentSubtotal = 42;
    await page.evaluate(() => {
      const chip = document.querySelector('.mp-header__content__cart-count__chip');
      if (chip) chip.textContent = '3';
    });
    await expect(page.locator('.mp-header__content__cart-count .tcgplus-cart-subtotal')).toHaveText('$42.00', {
      timeout: 5000,
    });
  });
});
