// @ts-check
// Regression test for #30: the page-level market price must not be cached
// across SPA-style DOM mutations. TCGplayer's content script lives across
// product navigation, and a cached marketPrice would feed the previous
// product's chip math into the new product's listings.

const { test, expect } = require('@playwright/test');
const { launchWithExtension, mockTCGplayer } = require('./helpers/load-extension.js');

test.describe('Market-price cache (regression for #30)', () => {
  /** @type {import('@playwright/test').BrowserContext} */
  let ctx;
  /** @type {import('@playwright/test').Page} */
  let page;

  test.beforeEach(async () => {
    ({ ctx } = await launchWithExtension());
    page = await ctx.newPage();
    await mockTCGplayer(page);
  });

  test.afterEach(async () => {
    if (ctx) await ctx.close();
  });

  test('chips reflect the current DOM market price after the value changes', async () => {
    await page.goto('https://www.tcgplayer.com/product/1/test');

    // Initial fixture: market $10, three listings ($8, $11, $15).
    // The first listing's chip should read -$2.00 (-20.0%).
    await expect(page.locator('.listing-item[data-tcgplus-chips="1"]')).toHaveCount(3);
    let chipTexts = await page.locator('.tcgplus-price-chip').allInnerTexts();
    expect(chipTexts).toContain('-$2.00 (-20.0%)');

    // Simulate an SPA navigation: same content-script instance, but the page
    // now has a different market price element value AND a freshly-injected
    // listing that hasn't been annotated yet.
    await page.evaluate(() => {
      const market = document.querySelector('.price-points__upper__price');
      if (market) market.textContent = '$5.00';
      const listings = document.querySelector('.listings');
      if (!listings) return;
      const article = document.createElement('article');
      article.className = 'listing-item';
      article.setAttribute('data-testid', 'listing-item--regression');
      article.innerHTML = `
        <div class="listing-item__listing-data">
          <div class="listing-item__listing-data__seller">
            <div class="seller-info">
              <a class="seller-info__name" href="/sellers/Regression/aaaaaaaa">Regression Seller</a>
              <div class="seller-info__content"></div>
            </div>
          </div>
          <div class="listing-item__listing-data__info">
            <h3 class="listing-item__listing-data__info__condition"><a href="#">Near Mint</a></h3>
            <div class="listing-item__listing-data__info__price">$3.00</div>
            <span> Shipping: <a href="#">Included</a></span>
          </div>
        </div>
      `;
      listings.appendChild(article);
    });

    // Wait for the content script's MutationObserver tick + annotation.
    const newListing = page.locator('[data-testid="listing-item--regression"]');
    await expect(newListing).toHaveAttribute('data-tcgplus-chips', '1', { timeout: 5000 });

    // New listing is $3 against the new market $5 → -$2.00 (-40.0%).
    // If the cache were leaking the original $10, we'd see -$7.00 (-70.0%).
    chipTexts = await newListing.locator('.tcgplus-price-chip').allInnerTexts();
    expect(chipTexts).toContain('-$2.00 (-40.0%)');
    expect(chipTexts).not.toContain('-$7.00 (-70.0%)');
  });
});
