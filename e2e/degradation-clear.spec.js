// @ts-check
// The "couldn't find a listing's price" warning must reflect the page the
// user is looking at now. It used to be marked and never cleared, so one
// unparseable listing pinned the warning for the whole tab lifetime —
// including after SPA navigation to products whose listings parse fine.

const { test, expect } = require('@playwright/test');
const { launchWithExtension, mockTCGplayer } = require('./helpers/load-extension.js');

/** @param {{ withPrice: boolean }} opts */
function productBody(opts) {
  const price = opts.withPrice ? '<div class="listing-item__listing-data__info__price">$8.00</div>' : '';
  return `
    <section class="price-points">
      <span class="price-points__upper__price">$10.00</span>
    </section>
    <section class="listings">
      <article class="listing-item">
        <div class="listing-item__listing-data">
          <div class="seller-info">
            <a class="seller-info__name" href="/sellers/Test/aaaaaaaa">Test Seller</a>
            <div class="seller-info__content"></div>
          </div>
          <div class="listing-item__listing-data__info">
            <h3 class="listing-item__listing-data__info__condition"><a href="#">Near Mint</a></h3>
            ${price}
            <span> Shipping: <a href="#"> Included </a></span>
          </div>
        </div>
      </article>
    </section>`;
}

test.describe('Listing-price degradation warning', () => {
  /** @type {import('@playwright/test').BrowserContext} */
  let ctx;

  test.afterEach(async () => {
    if (ctx) await ctx.close();
  });

  test('clears once the page no longer has an unparseable listing', async () => {
    ({ ctx } = await launchWithExtension());
    const page = await ctx.newPage();
    await mockTCGplayer(page, {
      productHtml: `<!doctype html><html><body>${productBody({ withPrice: false })}</body></html>`,
    });
    await page.goto('https://www.tcgplayer.com/product/1');

    const warning = page.locator('.tcgplus-panel-warning', { hasText: "Couldn't find a listing's price" });
    // Surfaces after the tracker's debounce window.
    await expect(warning).toHaveCount(1, { timeout: 5000 });

    // SPA → a product whose listing parses.
    await page.evaluate(
      ({ body }) => {
        history.pushState({}, '', '/product/2');
        document.body.innerHTML = body;
      },
      { body: productBody({ withPrice: true }) }
    );
    await expect(page.locator('.listing-item[data-tcgplus-chips="1"]')).toHaveCount(1, { timeout: 5000 });
    await expect(warning).toHaveCount(0, { timeout: 5000 });
  });
});
