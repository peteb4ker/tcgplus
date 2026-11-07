// @ts-check
const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const { launchWithExtension, mockTCGplayer } = require('./helpers/load-extension.js');

test.describe('Floating panel and chips', () => {
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

  test('renders the panel with tier counts after listings load', async () => {
    await page.goto('https://www.tcgplayer.com/product/1/test');
    const panel = page.locator('.tcgplus-panel');
    await expect(panel).toBeVisible();

    // Default home is California; first listing is from CA, second OR (nearby), third TX (other).
    await expect(panel.locator('.tcgplus-row-home')).toContainText('California');
    await expect(panel.locator('.tcgplus-row-home b')).toHaveText('1');
    await expect(panel.locator('.tcgplus-row-nearby b')).toHaveText('1');
    await expect(panel.locator('.tcgplus-row-other b')).toHaveText('1');
  });

  test('steady-state scans leave the panel DOM untouched (regression for #101)', async () => {
    await page.goto('https://www.tcgplayer.com/product/1/test');
    const panel = page.locator('.tcgplus-panel');
    // Let everything settle: tier counts and chips rendered means no
    // further legitimate panel changes are coming.
    await expect(panel.locator('.tcgplus-row-home b')).toHaveText('1');
    await expect(page.locator('.listing-item[data-tcgplus-chips="1"]')).toHaveCount(3);

    // Tag a live panel child. An unconditional innerHTML rewrite would
    // replace the element and drop the expando; compare-before-set keeps
    // the same node.
    await page.evaluate(() => {
      const t = /** @type {any} */ (document.querySelector('.tcgplus-panel-title'));
      t.__tcgplusTestMarker = true;
    });

    // External mutation → debounced scan → renderPanel with unchanged data.
    await page.evaluate(() => {
      document.body.appendChild(document.createElement('div'));
    });
    await page.waitForTimeout(600); // scan debounce is 200ms; generous margin

    const kept = await page.evaluate(() => {
      const t = /** @type {any} */ (document.querySelector('.tcgplus-panel-title'));
      return t ? t.__tcgplusTestMarker === true : false;
    });
    expect(kept).toBe(true);
  });

  test('renders price + shipping chips on each listing', async () => {
    await page.goto('https://www.tcgplayer.com/product/1/test');
    await expect(page.locator('.tcgplus-price-chip').first()).toBeVisible();
    const chipTexts = await page.locator('.tcgplus-price-chip').allInnerTexts();
    // First listing: $8 vs $10 market = -$2.00 (-20.0%), free shipping → Deal
    expect(chipTexts).toContain('-$2.00 (-20.0%)');
    expect(chipTexts).toContain('Shipping: Included');
    // Deal chip uses CSS text-transform: uppercase, so allInnerTexts returns DEAL.
    expect(chipTexts).toContain('DEAL');
    // Second listing: $11 vs $10 = +$1.00 (+10.0%), $1.31 shipping
    expect(chipTexts).toContain('+$1.00 (+10.0%)');
    expect(chipTexts).toContain('$1.31 shipping');
    // Third listing: $15 vs $10 = +$5.00 (+50.0%), $3.99 high shipping
    expect(chipTexts).toContain('+$5.00 (+50.0%)');
    expect(chipTexts).toContain('$3.99 high shipping');
  });

  test('renders the cart subtotal next to the cart count', async () => {
    await page.goto('https://www.tcgplayer.com/product/1/test');
    const subtotal = page.locator('.tcgplus-cart-subtotal');
    await expect(subtotal).toHaveText('$8.00');
  });

  test('clicking a tier row filters the listings', async () => {
    await page.goto('https://www.tcgplayer.com/product/1/test');
    // Wait until all three listings are tier-classified so the CSS filter
    // rule can correctly identify the home listing.
    await expect(page.locator('.listing-item[data-tcgplus-tier]')).toHaveCount(3);

    await page.locator('.tcgplus-panel-row[data-tier="home"]').click();
    await expect(page.locator('html')).toHaveClass(/tcgplus-filter-home/);

    // Only the home listing stays visible.
    await expect(page.locator('.listing-item[data-tcgplus-tier="home"]')).toBeVisible();
    await expect(page.locator('.listing-item[data-tcgplus-tier="nearby"]')).toBeHidden();
    await expect(page.locator('.listing-item[data-tcgplus-tier="other"]')).toBeHidden();
  });

  test('tier rows are buttons exposing the filter state via aria-pressed', async () => {
    await page.goto('https://www.tcgplayer.com/product/1/test');
    await expect(page.locator('.listing-item[data-tcgplus-tier]')).toHaveCount(3);

    const rows = page.locator('.tcgplus-panel .tcgplus-panel-row');
    await expect(rows).toHaveCount(3);
    for (const tier of ['home', 'nearby', 'other']) {
      const row = page.locator(`.tcgplus-panel-row[data-tier="${tier}"]`);
      expect(await row.evaluate((el) => el.tagName)).toBe('BUTTON');
      await expect(row).toHaveAttribute('type', 'button');
      await expect(row).toHaveAttribute('aria-pressed', 'false');
      await expect(row).toBeEnabled();
    }
  });

  test('empty tier rows are disabled buttons', async () => {
    await mockTCGplayer(page, {
      sellers: {
        aaaaaaaa: { addressCity: 'Atascadero', addressTerritory: 'CA', addressCountryCode: 'US' },
        bbbbbbbb: { addressCity: 'Fresno', addressTerritory: 'CA', addressCountryCode: 'US' },
        cccccccc: { addressCity: 'Oakland', addressTerritory: 'CA', addressCountryCode: 'US' },
      },
    });
    await page.goto('https://www.tcgplayer.com/product/1/test');
    await expect(page.locator('.tcgplus-row-home b')).toHaveText('3');

    await expect(page.locator('.tcgplus-panel-row[data-tier="home"]')).toBeEnabled();
    for (const tier of ['nearby', 'other']) {
      const row = page.locator(`.tcgplus-panel-row[data-tier="${tier}"]`);
      await expect(row).toBeDisabled();
      await expect(row).toHaveClass(/tcgplus-panel-row-disabled/);
    }

    // The `disabled` boolean attribute must be generated in its serialised
    // form, or every scan's compare-before-set would rewrite the panel.
    const nearby = page.locator('.tcgplus-panel-row[data-tier="nearby"]');
    await nearby.evaluate((el) => {
      /** @type {any} */ (el).__tcgplusTestMarker = true;
    });
    await page.evaluate(() => document.body.appendChild(document.createElement('div')));
    await page.waitForTimeout(600); // scan debounce is 200ms; generous margin
    expect(await nearby.evaluate((el) => /** @type {any} */ (el).__tcgplusTestMarker === true)).toBe(true);
  });

  test('Enter and Space on a focused tier row toggle the filter', async () => {
    await page.goto('https://www.tcgplayer.com/product/1/test');
    await expect(page.locator('.listing-item[data-tcgplus-chips="1"]')).toHaveCount(3);

    const home = page.locator('.tcgplus-panel-row[data-tier="home"]');
    await home.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('html')).toHaveClass(/tcgplus-filter-home/);
    await expect(home).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.listing-item[data-tcgplus-tier="nearby"]')).toBeHidden();

    // The generated row HTML must round-trip through innerHTML so the
    // next scan's compare-before-set doesn't rebuild the panel (which
    // would also drop keyboard focus). Tag the row and force a scan.
    await home.evaluate((el) => {
      /** @type {any} */ (el).__tcgplusTestMarker = true;
    });
    await page.evaluate(() => document.body.appendChild(document.createElement('div')));
    await page.waitForTimeout(600); // scan debounce is 200ms; generous margin
    expect(await home.evaluate((el) => /** @type {any} */ (el).__tcgplusTestMarker === true)).toBe(true);
    await expect(home).toBeFocused();

    await page.keyboard.press('Space');
    await expect(page.locator('html')).not.toHaveClass(/tcgplus-filter-home/);
    await expect(home).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.listing-item[data-tcgplus-tier="nearby"]')).toBeVisible();

    // Space works to turn a filter on too, on a different row.
    const nearby = page.locator('.tcgplus-panel-row[data-tier="nearby"]');
    await nearby.focus();
    await page.keyboard.press('Space');
    await expect(page.locator('html')).toHaveClass(/tcgplus-filter-nearby/);
    await expect(nearby).toHaveAttribute('aria-pressed', 'true');
    await expect(home).toHaveAttribute('aria-pressed', 'false');
  });

  test('OOS hide rule hides search-result tiles carrying mp-oos-badge', async () => {
    const html = await fs.readFile(require('node:path').join(__dirname, 'fixtures', 'product-page.html'), 'utf8');
    const withOOS =
      html +
      `<div class="search-result"><div class="product-card"><span class="tcg-chip mp-oos-badge"><span class="tcg-chip__content">Out of Stock</span></span><div>OOS card</div></div></div>` +
      `<div class="search-result"><div class="product-card"><div>In stock card</div></div></div>`;
    await mockTCGplayer(page, { productHtml: withOOS });

    // Pre-set the storage flag via the extension's options page.
    await page.evaluate(async () => {
      // chrome is unavailable in main world. Round-trip via DOM event isn't
      // wired, so we set via document.cookie + reload? No — flip it via the
      // options page directly.
    });

    await page.goto('https://www.tcgplayer.com/product/1/test');
    // Both tiles initially visible.
    await expect(page.locator('.search-result').filter({ hasText: 'OOS card' })).toBeVisible();
    await expect(page.locator('.search-result').filter({ hasText: 'In stock card' })).toBeVisible();

    // Toggle the rule by injecting the same body class the extension uses.
    // (We don't drive the options page from this test; the OOS-hide CSS rule
    // is the part we want to verify here.)
    await page.evaluate(() => document.documentElement.classList.add('tcgplus-hide-oos'));
    await expect(page.locator('.search-result').filter({ hasText: 'OOS card' })).toBeHidden();
    await expect(page.locator('.search-result').filter({ hasText: 'In stock card' })).toBeVisible();
  });
});
