// @ts-check
// Coverage for #72: cart-page rows get a price-vs-market chip computed
// from the per-SKU pricing endpoints. Two rows of different variants
// (Holofoil and Reverse Holofoil) of the same product, exercising the
// path that #71 introduced — the headline market we'd normally fall
// back to doesn't exist on a cart page.
const { test, expect } = require('@playwright/test');
const { launchWithExtension, mockTCGplayer } = require('./helpers/load-extension.js');

const PRODUCT_ID = 516695;

// Cart page fixture: two .package-item rows, both for Ditto 151
// (productId 516695), one Holofoil NM at $0.20, one Reverse Holofoil
// NM at $3.20. Mirrors the live TCGplayer cart DOM observed in the
// probe — the chip selectors and link patterns are exactly what
// findCartProductId / findCartConditionText / findCartPriceEl read.
const CART_HTML = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>cart fixture</title></head>
  <body>
    <header>
      <button class="mp-header__content__cart-count" type="button" aria-label="Cart">
        <span class="tcg-badge mp-header__content__cart-count__chip">2</span>
      </button>
    </header>
    <main>
      <h1>Shopping Cart</h1>
      <div id="package-aaaaaaaa" class="package">
        <article class="package-tab-container" data-testid="packageContainerFor-Seller-A">
          <section class="tab-content non-direct-package" data-testid="nonDirectPackage-aaaaaaaa">
            <ul>
              <li>
                <section class="package-item" data-testid="cart-row--holo">
                  <section class="content">
                    <div class="image-wrapper">
                      <a href="/product/${PRODUCT_ID}/pokemon-ditto"><img alt="Ditto" /></a>
                    </div>
                    <div class="expanded-details-container">
                      <section class="expanded-details">
                        <a href="/product/${PRODUCT_ID}/pokemon-ditto">
                          <p class="name" data-testid="productName">Ditto</p>
                        </a>
                        <section class="item-sales-info">
                          <p class="condition" data-testid="txtItemCondition">Near Mint Holofoil</p>
                          <p class="price" data-testid="txtItemPrice">$0.20</p>
                        </section>
                      </section>
                    </div>
                  </section>
                </section>
              </li>
              <li>
                <section class="package-item" data-testid="cart-row--rh">
                  <section class="content">
                    <div class="image-wrapper">
                      <a href="/product/${PRODUCT_ID}/pokemon-ditto"><img alt="Ditto" /></a>
                    </div>
                    <div class="expanded-details-container">
                      <section class="expanded-details">
                        <a href="/product/${PRODUCT_ID}/pokemon-ditto">
                          <p class="name" data-testid="productName">Ditto</p>
                        </a>
                        <section class="item-sales-info">
                          <p class="condition" data-testid="txtItemCondition">Near Mint Reverse Holofoil</p>
                          <p class="price" data-testid="txtItemPrice">$3.20</p>
                        </section>
                      </section>
                    </div>
                  </section>
                </section>
              </li>
            </ul>
          </section>
        </article>
      </div>
    </main>
  </body>
</html>`;

const SKUS = [
  { sku: 7432254, condition: 'Near Mint', variant: 'Holofoil', language: 'English' },
  { sku: 7432259, condition: 'Near Mint', variant: 'Reverse Holofoil', language: 'English' },
];
const SKU_PRICES = {
  7432254: { marketPrice: 0.53 },
  7432259: { marketPrice: 4.67 },
};

test.describe('Cart-page price chips (#72)', () => {
  /** @type {import('@playwright/test').BrowserContext} */
  let ctx;
  /** @type {import('@playwright/test').Page} */
  let page;

  test.beforeEach(async () => {
    ({ ctx } = await launchWithExtension());
    page = await ctx.newPage();
    await mockTCGplayer(page, {
      cartHtml: CART_HTML,
      productSkus: { [PRODUCT_ID]: SKUS },
      skuMarketPrices: SKU_PRICES,
      cart: null,
    });
  });

  test.afterEach(async () => {
    if (ctx) await ctx.close();
  });

  test('each cart row gets a per-SKU price-vs-market chip', async () => {
    await page.goto('https://www.tcgplayer.com/cart');
    await expect(page.locator('.package-item[data-tcgplus-chips="1"]')).toHaveCount(2);

    // Holofoil NM at $0.20 vs Holofoil-NM market $0.53 → -$0.33 (-62.3%).
    const holoChip = page.locator('[data-testid="cart-row--holo"] .tcgplus-price-chip');
    await expect(holoChip).toHaveCount(1);
    await expect(holoChip).toHaveText('-$0.33 (-62.3%)');
    await expect(holoChip).toHaveAttribute('title', 'vs market $0.53');

    // Reverse Holofoil NM at $3.20 vs RH-NM market $4.67 → -$1.47 (-31.5%).
    // The headline-fallback path doesn't help here — there's no
    // .price-points__upper__price on the cart — so this only works
    // because per-SKU pricing is wired in.
    const rhChip = page.locator('[data-testid="cart-row--rh"] .tcgplus-price-chip');
    await expect(rhChip).toHaveCount(1);
    await expect(rhChip).toHaveText('-$1.47 (-31.5%)');
    await expect(rhChip).toHaveAttribute('title', 'vs market $4.67');

    // Layout invariant: the chip is a SIBLING of the price element, not
    // a child. Putting it inside the price <p> widens that element and
    // breaks its right-alignment in the cart-row column. The chip wrap
    // lives directly inside .item-sales-info, immediately after the
    // price <p>.
    const holoRow = page.locator('[data-testid="cart-row--holo"]');
    await expect(holoRow.locator('[data-testid="txtItemPrice"] .tcgplus-price-chips')).toHaveCount(0);
    await expect(holoRow.locator('.item-sales-info > .tcgplus-price-chips--cart')).toHaveCount(1);
  });

  test('chip re-renders after TCGplayer wipes .item-sales-info (responsive layout re-render)', async () => {
    // TCGplayer's cart layout strips .item-sales-info's children at
    // narrow viewport breakpoints and rebuilds them on the way back to
    // wide. Without the re-entry path the chip is gone after that
    // detour because the outer .package-item retains its stale
    // data-tcgplus="done" / data-tcgplus-chips="1" attrs.
    await page.goto('https://www.tcgplayer.com/cart');
    await expect(page.locator('.package-item[data-tcgplus-chips="1"]')).toHaveCount(2);
    await expect(page.locator('.package-item .tcgplus-price-chip')).toHaveCount(2);

    // Simulate the responsive wipe: empty .item-sales-info on the holo
    // row, then rebuild its condition + price children just like
    // TCGplayer does. The .package-item element itself is preserved.
    await page.evaluate(() => {
      const row = document.querySelector('[data-testid="cart-row--holo"]');
      if (!row) throw new Error('cart-row--holo not found');
      const salesInfo = row.querySelector('.item-sales-info');
      if (!salesInfo) throw new Error('.item-sales-info not found');
      salesInfo.replaceChildren();
      // Rebuild like TCGplayer's wide layout would.
      const cond = document.createElement('p');
      cond.className = 'condition';
      cond.setAttribute('data-testid', 'txtItemCondition');
      cond.textContent = 'Near Mint Holofoil';
      const price = document.createElement('p');
      price.className = 'price';
      price.setAttribute('data-testid', 'txtItemPrice');
      price.textContent = '$0.20';
      salesInfo.append(cond, price);
    });

    // Chip should come back via the MutationObserver → scan() →
    // annotateCartItem path. Allow up to the 200ms scan-debounce + the
    // async pricing cache lookup (already warm from initial render).
    await expect(page.locator('[data-testid="cart-row--holo"] .tcgplus-price-chips--cart')).toHaveCount(1, {
      timeout: 3000,
    });
    await expect(page.locator('[data-testid="cart-row--holo"] .tcgplus-price-chip')).toHaveText('-$0.33 (-62.3%)');
  });

  test('no chip rendered when per-SKU pricing is unavailable', async () => {
    // Re-mock with no SKU catalog — per-SKU returns null and there's
    // no headline market on the cart page to fall back to, so nothing
    // should be injected. Better than guessing.
    await mockTCGplayer(page, {
      cartHtml: CART_HTML,
      productSkus: {},
      skuMarketPrices: {},
      cart: null,
    });
    await page.goto('https://www.tcgplayer.com/cart');
    // The annotator still marks rows as 'done' to avoid re-trying them
    // on every observer tick, but no chip element is injected.
    await expect(page.locator('.package-item[data-tcgplus="done"]')).toHaveCount(2);
    await expect(page.locator('.package-item .tcgplus-price-chip')).toHaveCount(0);
  });
});
