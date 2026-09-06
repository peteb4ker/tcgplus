// @ts-check
// Coverage for #136: the cart page renders a BEFORE-TAX market verdict
// in every Cart Summary box. Fixture replays the real /cart DOM captured
// live: label-as-text-node rows ("Item Total <span>$34.00</span>"),
// the "Estimated Shipping" label, "Taxes calculated at checkout" in
// place of any tax row, and the SAME summary box rendered twice
// (desktop sidebar + mobile layout) — the verdict must appear in both.
const { test, expect } = require('@playwright/test');
const { launchWithExtension, mockTCGplayer } = require('./helpers/load-extension.js');

/**
 * One .package-item row shaped like the real cart (condition/price by
 * testid). Quantity, when given, renders as the real cart's <select>
 * control — confirmed live (#149): TCGplayer never embeds a multiplier
 * in the price text itself, so `priceText` is always a bare "$X.XX".
 *
 * @param {string} tid
 * @param {number} productId
 * @param {string} condition
 * @param {string} priceText
 * @param {number} [qty]  omit for a single-quantity row (no <select> at all)
 */
function cartRow(tid, productId, condition, priceText, qty) {
  const qtySelect =
    qty == null
      ? ''
      : `<select data-testid="mp-select__UpdateProductQuantity" aria-label="Card ${productId} cart quantity"><option value="${qty}">${qty}</option></select>`;
  return `
    <li>
      <section class="package-item" data-testid="${tid}">
        <section class="content">
          <div class="description">
            <a href="/product/${productId}/pokemon-test"><p class="name" data-testid="productName">Card ${productId}</p></a>
            <p class="condition" data-testid="txtItemCondition">${condition}</p>
            <p class="price" data-testid="txtItemPrice">${priceText}</p>
          </div>
        </section>
        <section class="item-actions">${qtySelect}</section>
      </section>
    </li>`;
}

/** The Cart Summary box, verbatim shape from the live cart. */
function cartSummaryBox() {
  return `
    <section class="shopping-cart__summary">
      <section class="cart-summary">
        <h3> Cart Summary </h3>
        <section class="items-breakdown">
          <p> Packages <span data-testid="txtPackageCount">1</span></p>
          <p> Items <span data-testid="txtNumberOfItems">4</span></p>
          <p> Item Total <span>$34.00</span></p>
          <p> Estimated Shipping <span data-testid="txtEstimatedShipping">$1.25</span></p>
          <div class="cart-subtotal">
            <p> Cart Subtotal <span class="subtotal-value"><span data-testid="txtCartSubtotal">$35.25</span></span></p>
            <span>Taxes calculated at checkout</span>
          </div>
        </section>
        <button type="button" data-testid="btnCheckout">Check Out</button>
      </section>
    </section>`;
}

const CART_HTML = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>cart · real-shape fixture</title></head>
  <body>
    <main>
      <h1>Shopping Cart</h1>
      <div class="package">
        <ul>
          ${cartRow('row--a', 701001, 'Near Mint Holofoil', '$8.00')}
          ${cartRow('row--b', 701002, 'Near Mint Holofoil', '$8.00')}
          ${cartRow('row--c', 701003, 'Near Mint Holofoil', '$10.00')}
          ${cartRow('row--d', 701004, 'Near Mint Holofoil', '$8.00')}
        </ul>
      </div>
      <!-- Desktop sidebar box -->
      ${cartSummaryBox()}
      <!-- Mobile layout box: same component rendered a second time -->
      ${cartSummaryBox()}
    </main>
  </body>
</html>`;

const SKUS = {
  701001: [{ sku: 811001, condition: 'Near Mint', variant: 'Holofoil', language: 'English' }],
  701002: [{ sku: 811002, condition: 'Near Mint', variant: 'Holofoil', language: 'English' }],
  701003: [{ sku: 811003, condition: 'Near Mint', variant: 'Holofoil', language: 'English' }],
  701004: [{ sku: 811004, condition: 'Near Mint', variant: 'Holofoil', language: 'English' }],
};
const SKU_PRICES = {
  811001: { marketPrice: 10.0 },
  811002: { marketPrice: 10.0 },
  811003: { marketPrice: 12.0 },
  811004: { marketPrice: 10.0 },
};

test.describe('Cart-page before-tax market verdict (#136)', () => {
  /** @type {import('@playwright/test').BrowserContext} */
  let ctx;
  /** @type {import('@playwright/test').Page} */
  let page;

  test.beforeEach(async () => {
    ({ ctx } = await launchWithExtension());
    page = await ctx.newPage();
    await mockTCGplayer(page, {
      cartHtml: CART_HTML,
      productSkus: SKUS,
      skuMarketPrices: SKU_PRICES,
      cart: null,
    });
  });

  test.afterEach(async () => {
    if (ctx) await ctx.close();
  });

  test('renders the before-tax verdict in BOTH cart-summary boxes', async () => {
    await page.goto('https://www.tcgplayer.com/cart');
    // Rows annotate first (verdict aggregates their datasets).
    await expect(page.locator('.package-item[data-tcgplus-chips="1"]')).toHaveCount(4);

    const verdicts = page.locator('.tcgplus-checkout-verdict');
    await expect(verdicts).toHaveCount(2);
    await expect(page.locator('.cart-summary .items-breakdown > .tcgplus-checkout-verdict')).toHaveCount(2);

    for (const i of [0, 1]) {
      const v = verdicts.nth(i);
      // Market: 10 + 10 + 12 + 10 = $42.00. Items $34.00 (-$8.00),
      // shipping $1.25, NO tax row, all-in 35.25 vs 42.00 →
      // -$6.75 (-16.1%).
      await expect(v).toContainText('Market value (4 items)');
      await expect(v).toContainText('$42.00');
      await expect(v).toContainText('$34.00 (-$8.00)');
      await expect(v).toContainText('+ Shipping$1.25');
      await expect(v).not.toContainText('Est. tax');
      await expect(v).toContainText('All-in vs market (before tax)');
      await expect(v.locator('.tcgplus-price-chip')).toHaveText('-$6.75 (-16.1%)');
    }
  });

  test('no verdict when the cart summary lacks a readable Item Total row', async () => {
    const gutted = CART_HTML.replace(/<p> Item Total <span>\$34\.00<\/span><\/p>/g, '');
    await mockTCGplayer(page, { cartHtml: gutted, productSkus: SKUS, skuMarketPrices: SKU_PRICES, cart: null });
    await page.goto('https://www.tcgplayer.com/cart');
    await expect(page.locator('.package-item[data-tcgplus-chips="1"]')).toHaveCount(4);
    await expect(page.locator('.tcgplus-checkout-verdict')).toHaveCount(0);
  });

  test('shows a coverage warning instead of a misleading verdict when a row is unreadable (regression for #149)', async () => {
    // Blank out one row's price element. That row's price never parses,
    // so annotateCartItem never stashes a data-tcgplus-unit-price for it
    // and it's silently absent from the aggregation — while the Cart
    // Summary box still (correctly) reports the full $34.00 Item Total.
    // Replays the live bug: our computed total undercounts the page's
    // own total, and the old code rendered a misleading verdict off the
    // incomplete row set instead of noticing the gap.
    const mismatched = CART_HTML.replace(
      /(data-testid="row--a"[\s\S]*?<p class="price" data-testid="txtItemPrice">)\$8\.00(<\/p>)/,
      '$1$2'
    );
    await mockTCGplayer(page, { cartHtml: mismatched, productSkus: SKUS, skuMarketPrices: SKU_PRICES, cart: null });
    await page.goto('https://www.tcgplayer.com/cart');
    // 3 of 4 rows still chip normally.
    await expect(page.locator('.package-item[data-tcgplus-chips="1"]')).toHaveCount(3);

    const verdicts = page.locator('.tcgplus-checkout-verdict');
    await expect(verdicts).toHaveCount(2);
    for (const i of [0, 1]) {
      const v = verdicts.nth(i);
      await expect(v).toContainText("Couldn't total this cart reliably");
      // No numbers, no verdict chip — the whole point of the fix.
      await expect(v).not.toContainText('Market value');
      await expect(v.locator('.tcgplus-price-chip')).toHaveCount(0);
    }
  });

  test('reads quantity from the real <select> control, not the price text (regression for #149 root cause)', async () => {
    // Replays the live cart exactly: every row's price cell is a bare
    // "$X.XX" (no "N × $" multiplier ever appears there — that pattern
    // was never real), and each row's true quantity lives in its own
    // quantity <select>. Before the fix, quantity always fell back to
    // its default of 1, undercounting both unitCount and marketValue —
    // and, once the #149 coverage check existed, tripping a permanent
    // "couldn't total this cart" notice on any cart with a qty > 1 row.
    const qtyHtml = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>cart · multi-qty fixture</title></head>
  <body>
    <main>
      <h1>Shopping Cart</h1>
      <div class="package">
        <ul>
          ${cartRow('row--a', 701001, 'Near Mint Holofoil', '$0.27', 4)}
          ${cartRow('row--b', 701002, 'Near Mint Holofoil', '$0.32', 2)}
          ${cartRow('row--c', 701003, 'Near Mint Holofoil', '$1.20', 1)}
        </ul>
      </div>
      <section class="shopping-cart__summary">
        <section class="cart-summary">
          <h3> Cart Summary </h3>
          <section class="items-breakdown">
            <p> Items <span data-testid="txtNumberOfItems">7</span></p>
            <p> Item Total <span>$2.92</span></p>
            <p> Estimated Shipping <span data-testid="txtEstimatedShipping">$1.49</span></p>
            <div class="cart-subtotal">
              <p> Cart Subtotal <span class="subtotal-value"><span data-testid="txtCartSubtotal">$4.41</span></span></p>
              <span>Taxes calculated at checkout</span>
            </div>
          </section>
        </section>
      </section>
    </main>
  </body>
</html>`;
    // 4×$0.27 + 2×$0.32 + 1×$1.20 = 1.08 + 0.64 + 1.20 = $2.92 ≈ $3.00
    // (rounding), well inside tolerance — coverage holds, a real verdict
    // renders instead of the mismatch notice.
    await mockTCGplayer(page, { cartHtml: qtyHtml, productSkus: SKUS, skuMarketPrices: SKU_PRICES, cart: null });
    await page.goto('https://www.tcgplayer.com/cart');
    await expect(page.locator('.package-item[data-tcgplus-chips="1"]')).toHaveCount(3);

    const verdict = page.locator('.tcgplus-checkout-verdict');
    await expect(verdict).toBeVisible();
    await expect(verdict).not.toContainText("Couldn't total this cart reliably");
    await expect(verdict).toContainText('Market value (7 items)');
  });
});
