// @ts-check
// Coverage for #113: the checkout page gets a cart-level "all-in vs
// market" breakdown inside the Order Summary. Fixture replays the
// reported screenshot: 5 units across 4 products, $29.81 items +
// $1.99 shipping + $3.20 est. tax = $35.00 all-in vs $38.14 market.
const { test, expect } = require('@playwright/test');
const { launchWithExtension, mockTCGplayer } = require('./helpers/load-extension.js');

/** One .package-item row in the checkout's Items in Cart column. */
function cartRow(tid, productId, condition, priceText) {
  return `
    <li>
      <section class="package-item" data-testid="${tid}">
        <section class="content">
          <div class="expanded-details-container">
            <section class="expanded-details">
              <a href="/product/${productId}/pokemon-test"><p class="name" data-testid="productName">Card ${productId}</p></a>
              <section class="item-sales-info">
                <p class="condition" data-testid="txtItemCondition">${condition}</p>
                <p class="price" data-testid="txtItemPrice">${priceText}</p>
              </section>
            </section>
          </div>
        </section>
      </section>
    </li>`;
}

const CHECKOUT_HTML = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>checkout fixture</title></head>
  <body>
    <main>
      <h1>Items in Cart</h1>
      <div class="package">
        <ul>
          ${cartRow('row--energy', 601001, 'Near Mint Holofoil', '2 × $0.25')}
          ${cartRow('row--ceruledge', 601002, 'Near Mint Holofoil', '$11.58')}
          ${cartRow('row--flygon', 601003, 'Near Mint Holofoil', '$7.71')}
          ${cartRow('row--toxtricity', 601004, 'Near Mint Holofoil', '$10.02')}
        </ul>
      </div>
      <!-- Left-column per-package subtotal box, replayed from the real
           checkout DOM (#122). Deliberately carries CONFLICTING "Item
           Total" and "Shipping" values and sits before the Order Summary
           in document order — the verdict's lookups must be scoped to
           the Est. Tax row's container and never read these. -->
      <section class="package-summary-container">
        <section class="package-summary full-width">
          <section class="subtotal-section">
            <h2>Subtotal:</h2>
            <span data-testid="packageSubtotal">$11.92</span>
          </section>
          <section class="items-breakdown">
            <div>Items <span data-testid="packageItemCount">20</span></div>
            <div>Item Total <span data-testid="packageItemTotal">$11.92</span></div>
            <div>Shipping <span data-testid="packageShipping">FREE</span></div>
          </section>
        </section>
      </section>
      <!-- Order Summary rows use TCGplayer's real shape: label as a bare
           text node beside the value span (#122). -->
      <aside class="order-summary">
        <h2>Order Summary</h2>
        <div class="order-summary__details">
          <div class="summary-row">Packages <span>1</span></div>
          <div class="summary-row">Items <span>5</span></div>
          <div class="summary-row">Items Total <span>$29.81</span></div>
          <div class="summary-row">Shipping <span>$1.99</span></div>
          <div class="summary-row">Est. Tax <span>$3.20</span></div>
        </div>
      </aside>
    </main>
  </body>
</html>`;

const SKUS = {
  601001: [{ sku: 801001, condition: 'Near Mint', variant: 'Holofoil', language: 'English' }],
  601002: [{ sku: 801002, condition: 'Near Mint', variant: 'Holofoil', language: 'English' }],
  601003: [{ sku: 801003, condition: 'Near Mint', variant: 'Holofoil', language: 'English' }],
  601004: [{ sku: 801004, condition: 'Near Mint', variant: 'Holofoil', language: 'English' }],
};
const SKU_PRICES = {
  801001: { marketPrice: 1.31 },
  801002: { marketPrice: 13.6 },
  801003: { marketPrice: 9.64 },
  801004: { marketPrice: 12.28 },
};

test.describe('Checkout all-in vs market verdict (#113)', () => {
  /** @type {import('@playwright/test').BrowserContext} */
  let ctx;
  /** @type {import('@playwright/test').Page} */
  let page;

  /** @param {Record<string, any>} skus @param {Record<string, any>} prices */
  async function setup(skus, prices) {
    ({ ctx } = await launchWithExtension());
    page = await ctx.newPage();
    await mockTCGplayer(page, { productSkus: skus, skuMarketPrices: prices, cart: null });
    await page.route('https://www.tcgplayer.com/checkout**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: CHECKOUT_HTML })
    );
  }

  test.afterEach(async () => {
    if (ctx) await ctx.close();
  });

  test('renders the breakdown with quantity-aware market value', async () => {
    await setup(SKUS, SKU_PRICES);
    await page.goto('https://www.tcgplayer.com/checkout');

    const verdict = page.locator('.tcgplus-checkout-verdict');
    await expect(verdict).toBeVisible();
    // Mounted inside the Order Summary details block.
    await expect(page.locator('.order-summary__details .tcgplus-checkout-verdict')).toHaveCount(1);

    // Market value multiplies the 2× energy row: 2×1.31 + 13.60 + 9.64 + 12.28 = 38.14.
    await expect(verdict).toContainText('Market value (5 items)');
    await expect(verdict).toContainText('$38.14');
    await expect(verdict).toContainText('$29.81 (-$8.33)');
    await expect(verdict).toContainText('$1.99');
    await expect(verdict).toContainText('$3.20');

    // All-in verdict: $35.00 vs $38.14 → -$3.14 (-8.2%), green (below market).
    const chip = verdict.locator('.tcgplus-price-chip');
    await expect(chip).toHaveText('-$3.14 (-8.2%)');
    await expect(chip).toHaveAttribute('title', '$35.00 all-in vs $38.14 market');
    // No partial-coverage note when everything resolved.
    await expect(verdict.locator('.tcgplus-checkout-verdict__note')).toHaveCount(0);
  });

  test('discloses items counted at listed price when market is missing', async () => {
    // Toxtricity (601004) has no SKU catalog: counted at its $10.02
    // listed price. Market = 2.62 + 13.60 + 9.64 + 10.02 = 35.88;
    // all-in 35.00 → -$0.88 (-2.5%).
    const partialSkus = { ...SKUS };
    delete partialSkus[601004];
    await setup(partialSkus, SKU_PRICES);
    await page.goto('https://www.tcgplayer.com/checkout');

    const verdict = page.locator('.tcgplus-checkout-verdict');
    await expect(verdict).toBeVisible();
    await expect(verdict).toContainText('$35.88');
    await expect(verdict.locator('.tcgplus-price-chip')).toHaveText('-$0.88 (-2.5%)');
    await expect(verdict.locator('.tcgplus-checkout-verdict__note')).toHaveText(
      '1 item counted at listed price (no market data)'
    );
  });

  test('handles FREE shipping and the singular "Item Total" label', async () => {
    ({ ctx } = await launchWithExtension());
    page = await ctx.newPage();
    const freeHtml = CHECKOUT_HTML.replace(
      /<div class="summary-row">Items Total[\s\S]*?<div class="summary-row">Est\. Tax/,
      `<div class="summary-row">Item Total <span>$29.81</span></div>
          <div class="summary-row">Shipping <span>FREE</span></div>
          <div class="summary-row">Est. Tax`
    );
    await mockTCGplayer(page, { productSkus: SKUS, skuMarketPrices: SKU_PRICES, cart: null });
    await page.route('https://www.tcgplayer.com/checkout**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: freeHtml })
    );
    await page.goto('https://www.tcgplayer.com/checkout');

    const verdict = page.locator('.tcgplus-checkout-verdict');
    await expect(verdict).toBeVisible();
    // FREE → $0.00 shipping; all-in 29.81 + 0 + 3.20 = 33.01 vs 38.14
    // → -5.13/38.14 = -13.45% → -13.5% at one decimal.
    await expect(verdict).toContainText('+ Shipping$0.00');
    await expect(verdict.locator('.tcgplus-price-chip')).toHaveText('-$5.13 (-13.5%)');
  });

  test('does not render on the cart page (no Est. Tax row)', async () => {
    ({ ctx } = await launchWithExtension());
    page = await ctx.newPage();
    // Same rows, but no Order Summary: the /cart page has package-items
    // and no Est. Tax row, so the gate must keep the verdict out.
    const cartHtml = CHECKOUT_HTML.replace(/<aside class="order-summary">[\s\S]*?<\/aside>/, '');
    await mockTCGplayer(page, { productSkus: SKUS, skuMarketPrices: SKU_PRICES, cart: null, cartHtml });
    await page.goto('https://www.tcgplayer.com/cart');

    // Rows annotate (chips render) but no verdict block appears.
    await expect(page.locator('.package-item[data-tcgplus="done"]')).toHaveCount(4);
    await expect(page.locator('.tcgplus-checkout-verdict')).toHaveCount(0);
  });
});
