// @ts-check
const { test, expect } = require('@playwright/test');
const { launchWithExtension, mockTCGplayer } = require('./helpers/load-extension.js');

// The header cart subtotal badge should only ever show a number we actually
// fetched from the cart summary endpoint. Before a summary has loaded, with
// no cart cookie, or with an empty cart, a "$0.00" badge is noise.
test.describe('Header cart subtotal badge', () => {
  /** @type {import('@playwright/test').BrowserContext} */
  let ctx;
  /** @type {import('@playwright/test').Page} */
  let page;

  test.beforeEach(async () => {
    ({ ctx } = await launchWithExtension());
    page = await ctx.newPage();
  });

  test.afterEach(async () => {
    if (ctx) await ctx.close();
  });

  const badge = () => page.locator('.mp-header__content__cart-count .tcgplus-cart-subtotal');

  /** Wait until the content script has fully processed the page, then
   * give a few more scan passes (debounce is 200ms) a chance to run. */
  async function settle() {
    await expect(page.locator('.listing-item[data-tcgplus-chips="1"]')).toHaveCount(3);
    await page.waitForTimeout(600);
  }

  test('no cart cookie → no badge', async () => {
    await mockTCGplayer(page);
    await ctx.clearCookies({ name: 'StoreCart_PRODUCTION' });
    await page.goto('https://www.tcgplayer.com/product/1/test');
    await settle();
    await expect(badge()).toHaveCount(0);
  });

  test('cart summary with items → badge shows the subtotal', async () => {
    await mockTCGplayer(page, {
      cart: {
        itemCount: 2,
        itemSubtotal: 12.34,
        sellers: [{ sellerKey: 'aaaaaaaa', productTotalCost: 12.34, shippingCost: 0 }],
      },
    });
    await page.goto('https://www.tcgplayer.com/product/1/test');
    await expect(badge()).toHaveText('$12.34');
  });

  test('no badge while the first cart summary fetch is still in flight', async () => {
    await mockTCGplayer(page);
    /** @type {() => void} */
    let release = () => {};
    const gate = new Promise((r) => (release = () => r(undefined)));
    await page.route('**/v1/cart/**', async (route) => {
      await gate;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          errors: [],
          results: [{ itemCount: 1, itemSubtotal: 8, sellers: [{ sellerKey: 'aaaaaaaa', productTotalCost: 8 }] }],
        }),
      });
    });
    await page.goto('https://www.tcgplayer.com/product/1/test');
    await settle();
    await expect(badge()).toHaveCount(0);

    release();
    await expect(badge()).toHaveText('$8.00');
  });

  test('empty cart → no badge', async () => {
    await mockTCGplayer(page, { cart: { itemCount: 0, itemSubtotal: 0, sellers: [] } });
    await page.goto('https://www.tcgplayer.com/product/1/test');
    await settle();
    await expect(badge()).toHaveCount(0);
  });

  test('cart summary fetch fails → no badge', async () => {
    await mockTCGplayer(page, { cart: null });
    await page.goto('https://www.tcgplayer.com/product/1/test');
    await settle();
    await expect(badge()).toHaveCount(0);
  });

  test('badge is removed when the cart empties', async () => {
    await mockTCGplayer(page);
    let subtotal = 8;
    await page.route('**/v1/cart/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          errors: [],
          results: [{ itemCount: subtotal ? 1 : 0, itemSubtotal: subtotal, sellers: [] }],
        }),
      })
    );
    await page.goto('https://www.tcgplayer.com/product/1/test');
    await expect(badge()).toHaveText('$8.00');

    subtotal = 0;
    await page.evaluate(() => {
      const chip = document.querySelector('.mp-header__content__cart-count__chip');
      if (chip) chip.textContent = '0';
    });
    await expect(badge()).toHaveCount(0);
  });
});
