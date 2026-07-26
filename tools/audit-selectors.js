// Live-site selector audit. Launches headless Chromium with the unpacked
// extension (same harness as the demo recorder and e2e suite), visits one
// canonical URL per page type, and evaluates every DOM selector the
// extension depends on plus extension-health checks. Prints a PASS/FAIL
// table per page and exits non-zero if any check fails.
//
// Run:  npm run audit:selectors
//
// This hits the real tcgplayer.com — on demand only, never CI. Cart and
// checkout pages can't be audited here (they need the user's session
// state); verify those manually after selector changes.
//
// KEEP IN SYNC: when a selector changes in content.js, update the CHECKS
// inventory below in the same PR. The audit is only as honest as this list.
//
// URLs go stale as sets rotate. If a page 404s or returns near-empty
// listings, swap in a current equivalent (any product with 10+ listings,
// any current set's search page) — the checks are page-shape-relative,
// not content-specific.

const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const { chromium } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '..');
const REAL_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

const PAGES = [
  {
    name: 'product-default',
    url: 'https://www.tcgplayer.com/product/632906/pokemon-sv10-destined-rivals-pokemon?Language=English&page=1',
    type: 'product',
  },
  {
    name: 'product-printing-filtered',
    url: 'https://www.tcgplayer.com/product/693557/pokemon-me04-chaos-rising-trubbish?Language=English&page=2&Printing=Reverse+Holofoil',
    type: 'product',
  },
  {
    name: 'search-grid',
    url: 'https://www.tcgplayer.com/search/pokemon/me-ascended-heroes?productLineName=pokemon&page=1&view=grid&ProductTypeName=Cards&setName=me-ascended-heroes',
    type: 'search',
  },
  {
    // URL is built at runtime: a seller key is discovered from the first
    // product page's listings, since seller keys aren't stable fixtures.
    name: 'single-seller-search',
    url: null,
    type: 'single-seller',
  },
];

// Each check: [label, selector, cmp] where cmp is '>=1' or '==0'.
// 'custom' checks are named branches evaluated in page context below.
const CHECKS = {
  product: [
    ['content script bootstrapped', 'html[data-tcgplus-ready="1"]', '>=1'],
    ['listing rows', '.listing-item', '>=1'],
    ['listing price', '.listing-item__listing-data__info__price', '>=1'],
    ['listing condition (new gen)', '.listing-item__condition', '>=1'],
    ['listing shipping message', '.listing-item__listing-data__info__shipping-message', '>=1'],
    ['seller name link', '.listing-item a.seller-info__name', '>=1'],
    ['seller content block', '.listing-item .seller-info__content', '>=1'],
    ['headline market price', 'custom:marketPrice', '>=1'],
    ['cart count in header', '.mp-header__content__cart-count', '>=1'],
    ['cart count chip', '.mp-header__content__cart-count__chip', '>=1'],
    ['TCGPlus panel', '.tcgplus-panel', '>=1'],
    ['TCGPlus location badges', '.listing-item .tcgplus-loc', '>=1'],
    ['TCGPlus listing chips', '.listing-item .tcgplus-price-chip', '>=1'],
    ['no degradation warnings', '.tcgplus-panel-warning', '==0'],
    ['no phantom chips on carousel tiles', '.product-card__product .tcgplus-price-chip', '==0'],
  ],
  search: [
    ['content script bootstrapped', 'html[data-tcgplus-ready="1"]', '>=1'],
    ['search-result tiles', '.search-result', '>=1'],
    ['product-card tiles', '.product-card__product', '>=1'],
    ['tile market price', '.product-card__market-price--value', '>=1'],
    ['tile price w/ shipping', '.inventory__price-with-shipping', '>=1'],
    ['results grid (OOS banner mount)', '.search-results', '>=1'],
    ['TCGPlus tile chips', '.product-card__product .tcgplus-price-chip', '>=1'],
    ['no panel on search grid', '.tcgplus-panel', '==0'],
  ],
  'single-seller': [
    ['content script bootstrapped', 'html[data-tcgplus-ready="1"]', '>=1'],
    // Banner class renamed in the 2026 redesign: .shop-by-seller-message
    // became the .shop-by-seller-banner family. Accept either generation.
    ['shop-by-seller banner', '.shop-by-seller-message, .shop-by-seller-banner', '>=1'],
    [
      'TCGPlus location badge in banner',
      '.shop-by-seller-message .tcgplus-loc, .shop-by-seller-banner .tcgplus-loc',
      '>=1',
    ],
  ],
};

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} type
 */
async function runChecks(page, type) {
  return page.evaluate((checks) => {
    const customs = {
      // Market price moved into the price-guide header table in the 2026
      // redesign ("Market Price" label cell + sibling value cell). The
      // old .price-points__upper__price is checked as a fallback so the
      // audit keeps passing if TCGplayer reverts.
      marketPrice: () => {
        if (document.querySelector('.price-points__upper__price')) return 1;
        const tds = document.querySelectorAll('.price-guide td, .price-guide th');
        for (const td of tds) {
          if (/^market price$/i.test((td.textContent || '').trim())) {
            const sib = td.nextElementSibling;
            if (sib && /\$\d/.test(sib.textContent || '')) return 1;
          }
        }
        return 0;
      },
    };
    return checks.map(([label, sel, cmp]) => {
      let count;
      try {
        count = sel.startsWith('custom:') ? customs[sel.slice(7)]() : document.querySelectorAll(sel).length;
      } catch {
        count = -1;
      }
      const pass = cmp === '==0' ? count === 0 : count >= 1;
      return { label, sel, cmp, count, pass };
    });
  }, CHECKS[type]);
}

(async () => {
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tcg-audit-'));
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    args: [
      '--headless=new',
      `--disable-extensions-except=${ROOT}`,
      `--load-extension=${ROOT}`,
      '--no-default-browser-check',
      '--no-first-run',
    ],
    viewport: { width: 1280, height: 720 },
    userAgent: REAL_UA,
  });
  const page = ctx.pages()[0] || (await ctx.newPage());

  let sellerKey = null;
  let failures = 0;

  for (const spec of PAGES) {
    let url = spec.url;
    if (spec.type === 'single-seller') {
      if (!sellerKey) {
        console.log(`\n## ${spec.name}: SKIPPED (no seller key discovered from product pages)`);
        failures++;
        continue;
      }
      url = `https://www.tcgplayer.com/search/pokemon/product?productLineName=pokemon&view=grid&seller=${sellerKey}`;
    }

    console.log(`\n## ${spec.name}`);
    console.log(`   ${url}`);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (e) {
      console.log(`   NAVIGATION FAILED: ${e.message}`);
      failures++;
      continue;
    }
    // Live TCGplayer hydrates over several seconds; the extension then
    // annotates behind its 200ms scan debounce. 6s covers both on a warm
    // connection without racing slow listings batches.
    await page.waitForTimeout(6000);

    const results = await runChecks(page, spec.type);
    for (const r of results) {
      const mark = r.pass ? 'PASS' : 'FAIL';
      if (!r.pass) failures++;
      console.log(`   ${mark}  ${r.label}  (${r.sel} ${r.cmp}, got ${r.count})`);
    }

    if (spec.type === 'product' && !sellerKey) {
      sellerKey = await page.evaluate(() => {
        const a = document.querySelector('.listing-item a.seller-info__name');
        const m = a && (a.getAttribute('href') || '').match(/\/sellers\/[^/]+\/([a-z0-9]+)/i);
        return m ? m[1] : null;
      });
    }
  }

  await ctx.close();
  await fs.rm(userDataDir, { recursive: true, force: true });

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  console.log('Cart and checkout pages need your logged-in session — verify those manually after selector changes.');
  process.exit(failures === 0 ? 0 : 1);
})();
