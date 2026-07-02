// @ts-check
const { test, expect } = require('@playwright/test');
const { launchWithExtension, mockTCGplayer } = require('./helpers/load-extension.js');

test.describe('Cart refresh coalescing (regression for #97)', () => {
  /** @type {import('@playwright/test').BrowserContext} */
  let ctx;
  /** @type {import('@playwright/test').Page} */
  let page;

  test.afterEach(async () => {
    if (ctx) await ctx.close();
  });

  test('a cart change during an in-flight fetch triggers one follow-up fetch', async () => {
    ({ ctx } = await launchWithExtension());
    page = await ctx.newPage();
    await mockTCGplayer(page);

    // Override mockTCGplayer's cart route (most recent registration wins).
    // Each call returns a subtotal equal to the call number, so the badge
    // text tells us exactly which fetch it came from. Calls after the first
    // respond slowly, giving the test a wide window to land a second cart
    // mutation while a fetch is in flight.
    let calls = 0;
    await page.route('**/v1/cart/**', async (route) => {
      calls++;
      const n = calls;
      if (n >= 2) await new Promise((r) => setTimeout(r, 600));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          errors: [],
          results: [{ itemCount: n, itemSubtotal: n, sellers: [] }],
        }),
      });
    });

    await page.goto('https://www.tcgplayer.com/product/1/test');
    const subtotal = page.locator('.mp-header__content__cart-count .tcgplus-cart-subtotal');
    // Bootstrap fetch (call 1) has fully settled once the badge shows $1.00.
    await expect(subtotal).toHaveText('$1.00');

    // First cart change: kicks off call 2, which responds after 600ms.
    await page.evaluate(() => {
      const chip = document.querySelector('.mp-header__content__cart-count__chip');
      if (chip) chip.textContent = '2';
    });
    // Second cart change while call 2 is still in flight. Pre-fix, this
    // joined call 2's promise and no further fetch ever ran, freezing the
    // badge at $2.00. Post-fix, it queues call 3 to run after call 2.
    await page.waitForTimeout(150);
    await page.evaluate(() => {
      const chip = document.querySelector('.mp-header__content__cart-count__chip');
      if (chip) chip.textContent = '3';
    });

    await expect(subtotal).toHaveText('$3.00', { timeout: 5000 });
    expect(calls).toBe(3);
  });
});
