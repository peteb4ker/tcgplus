// Generates the 1280x800 Chrome Web Store screenshot at docs/store/screenshot-1.png
// by loading the unpacked extension into Chromium with a richer fixture page than
// the e2e tests use (more sellers, mixed tiers, various chip states).
//
// Run: node tools/render-store-screenshot.js
//
// Reuses the same launchWithExtension + mockTCGplayer helpers the e2e suite uses
// so the screenshot stays in sync with the real extension behaviour.

const path = require('node:path');
const fs = require('node:fs/promises');
const { launchWithExtension, mockTCGplayer } = require('../e2e/helpers/load-extension.js');

async function main() {
  const { ctx } = await launchWithExtension();
  try {
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });

    const productHtml = await fs.readFile(path.join(__dirname, '..', 'e2e', 'fixtures', 'product-page.html'), 'utf8');

    // Add a few more listings so the screenshot looks like a real product page.
    const extraListings = [
      { seller: 'Bay Area Cards', key: 'dddddddd', city: 'Oakland, CA', price: '$9.50', shipping: '+ $1.31 Shipping' },
      { seller: 'Cascade TCG', key: 'eeeeeeee', city: 'Seattle, WA', price: '$10.50', shipping: '+ $1.31 Shipping' },
      {
        seller: 'High Plains Drifter',
        key: 'ffffffff',
        city: 'Denver, CO',
        price: '$10.99',
        shipping: '+ $3.99 Shipping',
      },
      {
        seller: 'Buckeye Singles',
        key: 'gggggggg',
        city: 'Columbus, OH',
        price: '$12.00',
        shipping: '+ $3.99 Shipping',
      },
    ];

    const richer = productHtml.replace(
      '</section>',
      extraListings
        .map(
          (l, i) => `
      <article class="listing-item" data-testid="listing-item--${i + 3}">
        <div class="listing-item__listing-data">
          <div class="listing-item__listing-data__seller">
            <div class="seller-info">
              <a class="seller-info__name" href="/sellers/x/${l.key}">${l.seller}</a>
              <div class="seller-info__content"></div>
            </div>
          </div>
          <div class="listing-item__listing-data__info">
            <h3 class="listing-item__listing-data__info__condition"><a href="#">Near Mint</a></h3>
            <div class="listing-item__listing-data__info__price">${l.price}</div>
            <span>${l.shipping}</span>
          </div>
        </div>
      </article>`
        )
        .join('') + '\n    </section>'
    );

    await mockTCGplayer(page, {
      productHtml: richer,
      sellers: {
        aaaaaaaa: { addressCity: 'Atascadero', addressTerritory: 'CA', addressCountryCode: 'US' },
        bbbbbbbb: { addressCity: 'Portland', addressTerritory: 'OR', addressCountryCode: 'US' },
        cccccccc: { addressCity: 'Austin', addressTerritory: 'TX', addressCountryCode: 'US' },
        dddddddd: { addressCity: 'Oakland', addressTerritory: 'CA', addressCountryCode: 'US' },
        eeeeeeee: { addressCity: 'Seattle', addressTerritory: 'WA', addressCountryCode: 'US' },
        ffffffff: { addressCity: 'Denver', addressTerritory: 'CO', addressCountryCode: 'US' },
        gggggggg: { addressCity: 'Columbus', addressTerritory: 'OH', addressCountryCode: 'US' },
      },
      cart: {
        itemCount: 1,
        itemSubtotal: 9.5,
        requestedTotalCost: 10.81,
        sellers: [{ sellerKey: 'dddddddd', productTotalCost: 9.5, shippingCost: 1.31 }],
      },
    });

    await page.goto('https://www.tcgplayer.com/product/1/test');
    // Wait for all listings to be tier-classified before screenshotting.
    await page.waitForFunction(() => document.querySelectorAll('.listing-item[data-tcgplus-tier]').length >= 7, null, {
      timeout: 8000,
    });
    // Give chip rendering one more tick to settle.
    await page.waitForTimeout(200);

    const out = path.join(__dirname, '..', 'docs', 'store', 'screenshot-1.png');
    await fs.mkdir(path.dirname(out), { recursive: true });
    await page.screenshot({ path: out, type: 'png' });
    console.log('Wrote', out);
  } finally {
    await ctx.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
