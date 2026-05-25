// @ts-check
// Regression coverage for #69: a single tile / page can show listings of
// multiple conditions under one headline market price (the Near Mint
// market price by default, or whatever the URL's Condition= param
// selects). Chips that depend on market — the price-vs-market delta
// chip and the DEAL chip — must only render for listings whose
// condition matches the headline. The shipping chip is independent of
// market and always renders.
const { test, expect } = require('@playwright/test');
const { launchWithExtension, mockTCGplayer } = require('./helpers/load-extension.js');

// Inline product-page-shaped fixture with three listings: NM, LP, MP.
// addPriceChips runs for every .listing-item regardless of search-list
// vs product-page layout, so testing on a product-page-shaped fixture
// exercises the same gating code that fixes the search-list-view bug.
const MULTI_CONDITION_HTML = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>multi-condition fixture</title></head>
  <body>
    <header>
      <button class="mp-header__content__cart-count" type="button" aria-label="Cart">
        <span class="tcg-badge mp-header__content__cart-count__chip">0</span>
      </button>
    </header>
    <section class="price-points">
      <div>Market Price:</div>
      <span class="price-points__upper__price">$10.00</span>
    </section>
    <section class="listings">
      <article class="listing-item" data-testid="listing-item--nm">
        <div class="listing-item__listing-data">
          <div class="listing-item__listing-data__seller">
            <div class="seller-info">
              <a class="seller-info__name" href="/sellers/Seller-A/aaaaaaaa">Seller A</a>
              <div class="seller-info__content"></div>
            </div>
          </div>
          <div class="listing-item__listing-data__info">
            <h3 class="listing-item__listing-data__info__condition"><a href="#">Near Mint</a></h3>
            <div class="listing-item__listing-data__info__price">$9.00</div>
            <span>+ $1.31 Shipping</span>
          </div>
        </div>
      </article>

      <article class="listing-item" data-testid="listing-item--lp">
        <div class="listing-item__listing-data">
          <div class="listing-item__listing-data__seller">
            <div class="seller-info">
              <a class="seller-info__name" href="/sellers/Seller-B/bbbbbbbb">Seller B</a>
              <div class="seller-info__content"></div>
            </div>
          </div>
          <div class="listing-item__listing-data__info">
            <h3 class="listing-item__listing-data__info__condition"><a href="#">Lightly Played</a></h3>
            <div class="listing-item__listing-data__info__price">$5.00</div>
            <span>+ $1.31 Shipping</span>
          </div>
        </div>
      </article>

      <article class="listing-item" data-testid="listing-item--mp">
        <div class="listing-item__listing-data">
          <div class="listing-item__listing-data__seller">
            <div class="seller-info">
              <a class="seller-info__name" href="/sellers/Seller-C/cccccccc">Seller C</a>
              <div class="seller-info__content"></div>
            </div>
          </div>
          <div class="listing-item__listing-data__info">
            <h3 class="listing-item__listing-data__info__condition"><a href="#">Moderately Played</a></h3>
            <div class="listing-item__listing-data__info__price">$3.50</div>
            <span> Shipping: <a href="#"> Included </a></span>
          </div>
        </div>
      </article>
    </section>
  </body>
</html>`;

test.describe('Per-condition chip gating (regression for #69)', () => {
  /** @type {import('@playwright/test').BrowserContext} */
  let ctx;
  /** @type {import('@playwright/test').Page} */
  let page;

  test.beforeEach(async () => {
    ({ ctx } = await launchWithExtension());
    page = await ctx.newPage();
    await mockTCGplayer(page, { productHtml: MULTI_CONDITION_HTML, cart: null });
  });

  test.afterEach(async () => {
    if (ctx) await ctx.close();
  });

  test('default Condition (Near Mint): only NM listing gets price-vs-market chip', async () => {
    await page.goto('https://www.tcgplayer.com/product/1/test');
    await expect(page.locator('.listing-item[data-tcgplus-chips="1"]')).toHaveCount(3);

    // NM listing: $9 vs $10 = -$1.00 (-10.0%), plus shipping chip.
    const nmChips = await page.locator('[data-testid="listing-item--nm"] .tcgplus-price-chip').allInnerTexts();
    expect(nmChips).toContain('-$1.00 (-10.0%)');
    expect(nmChips).toContain('$1.31 shipping');

    // LP listing: shipping chip ONLY. No price-vs-market, no DEAL — would
    // have been (-$5.00 (-50.0%)) against the NM market, misleading.
    const lpChips = await page.locator('[data-testid="listing-item--lp"] .tcgplus-price-chip').allInnerTexts();
    expect(lpChips).toEqual(['$1.31 shipping']);
    expect(lpChips.some((s) => /vs market/.test(s))).toBe(false);
    await expect(page.locator('[data-testid="listing-item--lp"] .tcgplus-deal-chip')).toHaveCount(0);

    // MP listing: shipping chip ONLY (free shipping flavour).
    const mpChips = await page.locator('[data-testid="listing-item--mp"] .tcgplus-price-chip').allInnerTexts();
    expect(mpChips).toEqual(['Shipping: Included']);
    await expect(page.locator('[data-testid="listing-item--mp"] .tcgplus-deal-chip')).toHaveCount(0);
  });

  test('Condition=Lightly+Played URL: only LP listing gets price-vs-market chip', async () => {
    await page.goto('https://www.tcgplayer.com/product/1/test?Condition=Lightly+Played');
    await expect(page.locator('.listing-item[data-tcgplus-chips="1"]')).toHaveCount(3);

    // NM listing now mismatches headline — shipping chip only.
    const nmChips = await page.locator('[data-testid="listing-item--nm"] .tcgplus-price-chip').allInnerTexts();
    expect(nmChips).toEqual(['$1.31 shipping']);

    // LP listing matches: $5 vs $10 = -$5.00 (-50.0%), plus shipping chip.
    const lpChips = await page.locator('[data-testid="listing-item--lp"] .tcgplus-price-chip').allInnerTexts();
    expect(lpChips).toContain('-$5.00 (-50.0%)');
    expect(lpChips).toContain('$1.31 shipping');
  });

  test('Condition=Near+Mint,Lightly+Played: NM and LP both match', async () => {
    // TCGplayer multi-select condition filters comma-join the URL value.
    await page.goto('https://www.tcgplayer.com/product/1/test?Condition=Near+Mint,Lightly+Played');
    await expect(page.locator('.listing-item[data-tcgplus-chips="1"]')).toHaveCount(3);

    const nmChips = await page.locator('[data-testid="listing-item--nm"] .tcgplus-price-chip').allInnerTexts();
    expect(nmChips).toContain('-$1.00 (-10.0%)');

    const lpChips = await page.locator('[data-testid="listing-item--lp"] .tcgplus-price-chip').allInnerTexts();
    expect(lpChips).toContain('-$5.00 (-50.0%)');

    // MP still mismatches.
    const mpChips = await page.locator('[data-testid="listing-item--mp"] .tcgplus-price-chip').allInnerTexts();
    expect(mpChips).toEqual(['Shipping: Included']);
  });
});
