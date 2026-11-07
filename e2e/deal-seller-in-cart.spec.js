// @ts-check
// TCGplayer charges one shipping fee per seller order (#186). A listing
// from a seller the user already has items from adds no shipping, so the
// Deal chip must judge it on its price alone, including when the cart
// changes after the chips first rendered.

const { test, expect } = require('@playwright/test');
const { launchWithExtension, mockTCGplayer } = require('./helpers/load-extension.js');

// Market $10, listing $9 + $1.49 shipping from seller bbbbbbbb.
// Shipping counted: $10.49 → no Deal. Shipping already paid: $9 → Deal.
const PRODUCT_HTML = `<!doctype html><html><body>
  <header>
    <button class="mp-header__content__cart-count">
      <span class="mp-header__content__cart-count__chip">1</span>
    </button>
  </header>
  <section class="price-points"><span class="price-points__upper__price">$10.00</span></section>
  <section class="listings">
    <article class="listing-item">
      <div class="listing-item__listing-data">
        <div class="seller-info">
          <a class="seller-info__name" href="/sellers/Nearby-Seller/bbbbbbbb">Nearby Seller</a>
          <div class="seller-info__content"></div>
        </div>
        <div class="listing-item__listing-data__info">
          <h3 class="listing-item__listing-data__info__condition"><a href="#">Near Mint</a></h3>
          <div class="listing-item__listing-data__info__price">$9.00</div>
          <div class="listing-item__listing-data__info__shipping">+ $1.49 Shipping</div>
        </div>
      </div>
    </article>
  </section>
</body></html>`;

/** @param {Array<{ sellerKey: string, productTotalCost: number }>} sellers */
function cartWith(sellers) {
  const total = sellers.reduce((sum, s) => sum + s.productTotalCost, 0);
  return { itemCount: sellers.length, itemSubtotal: total, requestedTotalCost: total, sellers };
}

test.describe('Deal chip: seller already in cart', () => {
  /** @type {import('@playwright/test').BrowserContext} */
  let ctx;

  test.afterEach(async () => {
    if (ctx) await ctx.close();
  });

  test('counts the listed shipping when the seller is not in the cart', async () => {
    ({ ctx } = await launchWithExtension());
    const page = await ctx.newPage();
    await mockTCGplayer(page, {
      productHtml: PRODUCT_HTML,
      cart: cartWith([{ sellerKey: 'aaaaaaaa', productTotalCost: 3 }]),
    });
    await page.goto('https://www.tcgplayer.com/product/1/test');
    await expect(page.locator('.listing-item[data-tcgplus-chips="1"]')).toHaveCount(1, { timeout: 5000 });
    await page.waitForTimeout(500); // let the cart fetch land and recompute
    await expect(page.locator('.tcgplus-deal-chip')).toHaveCount(0);
  });

  test('drops the shipping once the seller is in the cart', async () => {
    ({ ctx } = await launchWithExtension());
    const page = await ctx.newPage();
    await mockTCGplayer(page, {
      productHtml: PRODUCT_HTML,
      cart: cartWith([{ sellerKey: 'bbbbbbbb', productTotalCost: 2 }]),
    });
    await page.goto('https://www.tcgplayer.com/product/1/test');
    const deal = page.locator('.tcgplus-deal-chip');
    await expect(deal).toHaveCount(1, { timeout: 5000 });
    await expect(deal).toHaveAttribute('title', /already have \$2\.00 from this seller/);
  });

  test('re-evaluates when an item from that seller is added after render', async () => {
    ({ ctx } = await launchWithExtension());
    const page = await ctx.newPage();
    let cart = cartWith([{ sellerKey: 'aaaaaaaa', productTotalCost: 3 }]);
    await mockTCGplayer(page, { productHtml: PRODUCT_HTML });
    // Registered after mockTCGplayer, so this handler wins for the cart.
    await page.route('**/v1/cart/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [cart] }) })
    );
    await page.goto('https://www.tcgplayer.com/product/1/test');
    await expect(page.locator('.listing-item[data-tcgplus-chips="1"]')).toHaveCount(1, { timeout: 5000 });
    await page.waitForTimeout(500);
    await expect(page.locator('.tcgplus-deal-chip')).toHaveCount(0);

    // User adds something from seller bbbbbbbb; TCGplayer bumps the count.
    cart = cartWith([
      { sellerKey: 'aaaaaaaa', productTotalCost: 3 },
      { sellerKey: 'bbbbbbbb', productTotalCost: 1.5 },
    ]);
    await page.evaluate(() => {
      const chip = document.querySelector('.mp-header__content__cart-count__chip');
      if (chip) chip.textContent = '2';
    });
    await expect(page.locator('.tcgplus-deal-chip')).toHaveCount(1, { timeout: 5000 });
  });
});
