// Pure helpers shared between the content script and unit tests.
// Loaded as a content script before content.js (see manifest.json), so its
// top-level declarations are available to content.js in the same isolated
// world. Also exported via CommonJS for `node --test`.

const STATES = [
  ['AL', 'Alabama'],
  ['AK', 'Alaska'],
  ['AZ', 'Arizona'],
  ['AR', 'Arkansas'],
  ['CA', 'California'],
  ['CO', 'Colorado'],
  ['CT', 'Connecticut'],
  ['DE', 'Delaware'],
  ['DC', 'District of Columbia'],
  ['FL', 'Florida'],
  ['GA', 'Georgia'],
  ['HI', 'Hawaii'],
  ['ID', 'Idaho'],
  ['IL', 'Illinois'],
  ['IN', 'Indiana'],
  ['IA', 'Iowa'],
  ['KS', 'Kansas'],
  ['KY', 'Kentucky'],
  ['LA', 'Louisiana'],
  ['ME', 'Maine'],
  ['MD', 'Maryland'],
  ['MA', 'Massachusetts'],
  ['MI', 'Michigan'],
  ['MN', 'Minnesota'],
  ['MS', 'Mississippi'],
  ['MO', 'Missouri'],
  ['MT', 'Montana'],
  ['NE', 'Nebraska'],
  ['NV', 'Nevada'],
  ['NH', 'New Hampshire'],
  ['NJ', 'New Jersey'],
  ['NM', 'New Mexico'],
  ['NY', 'New York'],
  ['NC', 'North Carolina'],
  ['ND', 'North Dakota'],
  ['OH', 'Ohio'],
  ['OK', 'Oklahoma'],
  ['OR', 'Oregon'],
  ['PA', 'Pennsylvania'],
  ['RI', 'Rhode Island'],
  ['SC', 'South Carolina'],
  ['SD', 'South Dakota'],
  ['TN', 'Tennessee'],
  ['TX', 'Texas'],
  ['UT', 'Utah'],
  ['VT', 'Vermont'],
  ['VA', 'Virginia'],
  ['WA', 'Washington'],
  ['WV', 'West Virginia'],
  ['WI', 'Wisconsin'],
  ['WY', 'Wyoming'],
];
const STATE_NAMES = Object.fromEntries(STATES);
const STATE_CODES = new Set(STATES.map(([c]) => c));
const DEFAULT_NEARBY = ['OR', 'WA', 'NV', 'AZ', 'ID', 'UT', 'MT', 'WY', 'CO', 'NM', 'AK', 'HI'];
const VALID_TIERS = new Set(['home', 'nearby', 'other']);
const FREE_SHIP_THRESHOLD = 5.0;

/**
 * Extract a positive dollar amount from arbitrary text.
 * Returns null when no amount is present or when the amount is zero
 * (zero is treated as missing because TCGplayer never lists $0 prices).
 *
 * @param {string | null | undefined} text
 * @returns {number | null}
 */
function parsePrice(text) {
  if (!text) return null;
  const m = text.replace(/,/g, '').match(/\$\s*(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const v = parseFloat(m[1]);
  return Number.isFinite(v) && v > 0 ? v : null;
}

/**
 * Parse a shipping cost from a TCGplayer shipping cell.
 * Recognises explicit "$X.XX Shipping", "Shipping: Included", and bare
 * "Free Shipping" (but rejects "Free Shipping on Orders Over $5", which is
 * a per-seller promo, not actually-free shipping for a single listing).
 *
 * @param {string | null | undefined} text
 * @returns {number | null} cost in dollars, 0 for free shipping, null when unknown.
 */
function parseShippingCost(text) {
  if (!text) return null;
  // Anchor every branch to the start of the trimmed text. Without anchoring,
  // a generic-span/div fallback in findListingShipping can land on an outer
  // container whose text contains "Shipping: Included" or "Free Shipping"
  // somewhere in the middle (alongside the seller name, condition, listing
  // price). addPriceChips would then wipe that container's innerHTML and
  // delete the listing's seller / price / condition along with the shipping
  // cell. See #65.
  const trimmed = text.replace(/^\s+/, '');
  const explicit = trimmed.match(/^\+?\s*\$\s*(\d+(?:\.\d+)?)\s*shipping/i);
  if (explicit) {
    const v = parseFloat(explicit[1]);
    if (Number.isFinite(v) && v >= 0) return v;
  }
  if (/^shipping\s*:\s*included/i.test(trimmed)) return 0;
  if (/^free\s+shipping/i.test(trimmed) && !/orders?\s+over/i.test(trimmed)) return 0;
  return null;
}

/**
 * The five TCGplayer condition tiers, ordered best-to-worst. Two things
 * depend on this ordering: prefix matching in parseConditionAndVariant
 * (longer names must be tested before any shorter prefix of them), and
 * the monotonicity walk in capConditionMarkets (best condition first).
 */
const TCG_CONDITIONS = ['Near Mint', 'Lightly Played', 'Moderately Played', 'Heavily Played', 'Damaged'];

/**
 * Cache key for a per-SKU market price: lowercased `condition|variant`,
 * with 'Normal' as the default variant (the API's name for the base SKU).
 *
 * @param {string | null | undefined} condition
 * @param {string | null | undefined} variant
 * @returns {string}
 */
function skuLookupKey(condition, variant) {
  return `${(condition || '').trim().toLowerCase()}|${(variant || 'Normal').trim().toLowerCase()}`;
}

/**
 * Enforce condition monotonicity on a per-SKU market-price map (keys from
 * `skuLookupKey`): within each variant, a worse-condition copy of the same
 * card can never be worth more than a better-condition one. TCGplayer's
 * per-condition market prices break this on thin data — low-volume tiers
 * recalculate days later than Near Mint, so on a falling card the stale
 * Lightly Played "market" can sit above the fresh Near Mint one, and any
 * listing under the stale figure earns a bogus DEAL chip.
 *
 * Walks TCG_CONDITIONS best→worst per variant carrying a running minimum
 * and caps each tier's market at it. Missing tiers don't update the
 * minimum. Returns a new Map; the input is not mutated.
 *
 * @param {Map<string, number>} markets
 * @returns {Map<string, number>}
 */
function capConditionMarkets(markets) {
  const out = new Map(markets);
  const variants = new Set();
  for (const key of out.keys()) {
    const sep = key.indexOf('|');
    if (sep !== -1) variants.add(key.slice(sep + 1));
  }
  for (const variant of variants) {
    let runningMin = Infinity;
    for (const c of TCG_CONDITIONS) {
      const key = `${c.toLowerCase()}|${variant}`;
      const v = out.get(key);
      if (!Number.isFinite(v)) continue;
      const capped = Math.min(v, runningMin);
      out.set(key, capped);
      runningMin = capped;
    }
  }
  return out;
}

/**
 * Split a TCGplayer listing's condition text into a `{condition, variant}`
 * pair. The condition cell renders the variant inline as a suffix:
 *
 *   - "Near Mint"                  → { condition: 'Near Mint', variant: 'Normal' }
 *   - "Near Mint Holofoil"         → { condition: 'Near Mint', variant: 'Holofoil' }
 *   - "Lightly Played Reverse Holofoil"
 *                                 → { condition: 'Lightly Played', variant: 'Reverse Holofoil' }
 *
 * Returns `{ condition: null, variant: null }` when the text doesn't
 * start with a known TCGplayer condition tier — caller falls back to
 * the headline market price in that case (preserves existing behaviour
 * if TCGplayer adds a new condition tier).
 *
 * The variant name matches what `mp-search-api`'s product/details
 * endpoint returns under `skus[].variant`, including 'Normal' for the
 * base SKU.
 *
 * @param {string | null | undefined} text
 * @returns {{ condition: string | null, variant: string | null }}
 */
function parseConditionAndVariant(text) {
  if (!text) return { condition: null, variant: null };
  const trimmed = text.trim();
  if (!trimmed) return { condition: null, variant: null };
  for (const c of TCG_CONDITIONS) {
    const lower = trimmed.toLowerCase();
    const cLower = c.toLowerCase();
    if (lower === cLower) return { condition: c, variant: 'Normal' };
    if (lower.startsWith(cLower + ' ')) {
      const variant = trimmed.slice(c.length).trim();
      return { condition: c, variant: variant || 'Normal' };
    }
  }
  return { condition: null, variant: null };
}

/**
 * Get the conditions selected via a TCGplayer URL's `Condition` query
 * parameter. TCGplayer's headline market price (the one we read for
 * chip math) is for a single condition — Near Mint by default, or the
 * URL-selected condition when one is set. A search-list-view tile can
 * show listings of *other* conditions inside it, and chipping a
 * Lightly Played listing against the Near Mint market gives misleading
 * intel (see #69). Callers use this together with
 * `listingMatchesHeadlineCondition` to decide whether a given
 * listing's price-vs-market chip is trustworthy.
 *
 * @param {string | URL | null | undefined} url
 * @returns {string[]} One or more condition names. Defaults to
 *   `['Near Mint']` when the URL has no `Condition` param or the URL
 *   can't be parsed.
 */
function getUrlConditions(url) {
  if (!url) return ['Near Mint'];
  try {
    const u = typeof url === 'string' ? new URL(url) : url;
    const raw = u.searchParams.get('Condition');
    if (!raw) return ['Near Mint'];
    const parts = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return parts.length ? parts : ['Near Mint'];
  } catch {
    return ['Near Mint'];
  }
}

/**
 * Check whether a listing's condition string matches one of the
 * conditions the headline market price is "for". Comparison is
 * case-insensitive and tolerates a trailing parenthetical (e.g.
 * `"Near Mint (Foil)"`) so a future TCGplayer DOM tweak doesn't
 * silently start suppressing every chip.
 *
 * Returns `true` when the listing condition is unknown (null/empty),
 * preserving existing behaviour if TCGplayer renames the condition
 * class — the chip may be wrong, but the user keeps seeing chips and
 * the degradation tracker can surface the problem instead.
 *
 * @param {string | null | undefined} listingCondition
 * @param {string[]} headlineConditions  As returned by `getUrlConditions`.
 * @returns {boolean}
 */
function listingMatchesHeadlineCondition(listingCondition, headlineConditions) {
  if (!Array.isArray(headlineConditions) || !headlineConditions.length) return true;
  if (!listingCondition) return true;
  const norm = listingCondition
    .trim()
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim()
    .toLowerCase();
  if (!norm) return true;
  return headlineConditions.some((h) => h.trim().toLowerCase() === norm);
}

/**
 * Parse a positive dollar amount from text, accepting $0.00. Unlike
 * parsePrice (which treats zero as missing because listings never cost
 * $0), summary rows like Shipping and Est. Tax are legitimately $0.00.
 *
 * @param {string | null | undefined} text
 * @returns {number | null}
 */
function parseUsdAmount(text) {
  if (!text) return null;
  const m = text.replace(/,/g, '').match(/\$\s*(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const v = parseFloat(m[1]);
  return Number.isFinite(v) ? v : null;
}

/**
 * Parse the quantity multiplier from a cart row's price text, e.g.
 * "2 × $0.25" → 2. Single-quantity rows render without a multiplier;
 * default to 1. Accepts '×' or a plain 'x'.
 *
 * @param {string | null | undefined} text
 * @returns {number}
 */
function parseCartQuantity(text) {
  if (!text) return 1;
  const m = text.match(/(\d+)\s*[×x]\s*\$/i);
  if (!m) return 1;
  const q = parseInt(m[1], 10);
  return Number.isFinite(q) && q > 0 ? q : 1;
}

/**
 * Aggregate a checkout cart into an all-in vs market verdict.
 *
 * The benchmark: buying these exact cards at market price in person
 * (card show) costs the sum of per-SKU market prices with no shipping
 * or tax. Online you pay items + shipping + tax. The verdict says how
 * far the all-in checkout total sits from that market baseline.
 *
 * Items whose market couldn't be resolved count at their listed price —
 * a zero contribution to the delta — and are tallied in
 * `unresolvedCount` so the caller can disclose partial coverage.
 *
 * `items` is only as complete as the caller's row scrape: a row whose
 * quantity or price didn't parse is silently absent from the array
 * rather than counted wrong, so `marketValue`/`unitCount` can quietly
 * undercount a cart that has more units than we read. Reconciled
 * against `opts.itemsTotal` (the page's own reported total, independent
 * of our row scrape) when provided: if our computed items total
 * disagrees by more than rounding, some rows were missed or
 * mis-quantified, and `coverageOk` is false — the caller should not
 * present the verdict as trustworthy (#149).
 *
 * @param {{
 *   items: Array<{ price: number, qty?: number, market?: number | null }>,
 *   itemsTotal?: number | null,  // DOM "Items Total" when known; falls back to computed
 *   shipping?: number | null,
 *   tax?: number | null,
 * }} opts
 * @returns {{
 *   marketValue: number,
 *   itemsTotal: number,
 *   shipping: number,
 *   tax: number,
 *   allIn: number,
 *   delta: number,
 *   pct: number,
 *   unitCount: number,
 *   unresolvedCount: number,
 *   coverageOk: boolean,
 * } | null}  null when there's nothing to aggregate.
 */
function computeCartVerdict(opts) {
  const items = opts && Array.isArray(opts.items) ? opts.items : [];
  if (!items.length) return null;
  let computedItemsTotal = 0;
  let marketValue = 0;
  let unitCount = 0;
  let unresolvedCount = 0;
  for (const it of items) {
    if (!it || !Number.isFinite(it.price)) continue;
    const qty = Number.isFinite(it.qty) && /** @type {number} */ (it.qty) > 0 ? Math.floor(it.qty) : 1;
    computedItemsTotal += it.price * qty;
    unitCount += qty;
    if (Number.isFinite(it.market)) {
      marketValue += /** @type {number} */ (it.market) * qty;
    } else {
      marketValue += it.price * qty;
      unresolvedCount++;
    }
  }
  if (unitCount === 0 || marketValue <= 0) return null;
  const domItemsTotal = Number.isFinite(opts.itemsTotal) ? /** @type {number} */ (opts.itemsTotal) : null;
  // Tolerance is the larger of 2 cents (float/rounding noise) or 1% of
  // the page's total, so a real coverage gap trips this but a rounding
  // difference doesn't.
  const tolerance = domItemsTotal == null ? Infinity : Math.max(0.02, domItemsTotal * 0.01);
  const coverageOk = domItemsTotal == null || Math.abs(computedItemsTotal - domItemsTotal) <= tolerance;
  const itemsTotal = domItemsTotal != null ? domItemsTotal : computedItemsTotal;
  const shipping = Number.isFinite(opts.shipping) ? /** @type {number} */ (opts.shipping) : 0;
  const tax = Number.isFinite(opts.tax) ? /** @type {number} */ (opts.tax) : 0;
  const allIn = itemsTotal + shipping + tax;
  const delta = allIn - marketValue;
  const pct = (delta / marketValue) * 100;
  return { marketValue, itemsTotal, shipping, tax, allIn, delta, pct, unitCount, unresolvedCount, coverageOk };
}

/**
 * Pull the alphanumeric seller key out of a TCGplayer seller URL like
 * `/sellers/<name>/<key>`.
 *
 * @param {string | null | undefined} href
 * @returns {string | null}
 */
function extractSellerKey(href) {
  if (!href) return null;
  const m = href.match(/\/sellers\/[^/]+\/([a-z0-9]+)/i);
  return m ? m[1] : null;
}

/**
 * @typedef {'home' | 'nearby' | 'other' | 'intl'} Tier
 */

/**
 * Classify a US state code into one of the four tiers used by the panel.
 *
 * @param {string} stateCode  Two-letter USPS code; empty means non-US/intl.
 * @param {string} homeState  Two-letter USPS code of the user's home state.
 * @param {Set<string>} [nearbyStates]  Set of two-letter codes considered nearby.
 * @returns {Tier}
 */
function classifyState(stateCode, homeState, nearbyStates) {
  if (!stateCode) return 'intl';
  if (stateCode === homeState) return 'home';
  if (nearbyStates && nearbyStates.has(stateCode)) return 'nearby';
  return 'other';
}

/**
 * @typedef {object} SellerInfo
 * @property {string=} addressCity
 * @property {string=} addressTerritory
 * @property {string=} addressCountryCode
 * @property {string=} location
 */

/**
 * Pull the two-letter state code from a seller-info record. Empty string for
 * non-US sellers (callers treat empty as "international").
 *
 * @param {SellerInfo | null | undefined} info
 * @returns {string}
 */
function stateCodeFromInfo(info) {
  if (!info) return '';
  return info.addressCountryCode === 'US' ? info.addressTerritory || '' : '';
}

/**
 * Human-readable single-line location label for a seller.
 *
 * @param {SellerInfo | null | undefined} info
 * @returns {string}
 */
function formatLocation(info) {
  if (!info) return 'Unknown';
  const city = info.addressCity || '';
  const state = info.addressTerritory || '';
  const country = info.addressCountryCode || '';
  if (country === 'US' && state) return city ? `${city}, ${state}` : state;
  return info.location || country || 'Unknown';
}

/**
 * @typedef {object} ChipColor
 * @property {string} bg
 * @property {string} fg
 */

/**
 * Background/foreground colors for the price-vs-market chip.
 * Solid green below market, neutral at parity, yellow→red gradient as the
 * percentage climbs to 10%, capped at solid red.
 *
 * @param {number} pct
 * @returns {ChipColor}
 */
function chipColorForPct(pct) {
  if (pct < 0) return { bg: '#1e7e1e', fg: '#fff' };
  if (pct === 0) return { bg: '#888', fg: '#fff' };
  if (pct >= 10) return { bg: '#c62828', fg: '#fff' };
  const hue = 60 - (pct / 10) * 60;
  const fg = pct < 4 ? '#222' : '#fff';
  return { bg: `hsl(${hue}, 78%, 45%)`, fg };
}

/**
 * @typedef {ChipColor & { text: string }} ShippingChip
 */

/**
 * Color and label for the shipping chip given a numeric cost.
 *
 * @param {number} cost
 * @returns {ShippingChip}
 */
function chipForShipping(cost) {
  if (cost === 0) return { bg: '#1e7e1e', fg: '#fff', text: 'Shipping: Included' };
  if (cost < 2) return { bg: '#cc8c19', fg: '#fff', text: `$${cost.toFixed(2)} shipping` };
  return { bg: '#c62828', fg: '#fff', text: `$${cost.toFixed(2)} high shipping` };
}

/**
 * Format a signed dollar diff as "+$1.23" / "-$1.23" / "$0.00".
 *
 * @param {number} diff
 * @returns {string}
 */
function formatAbsDiff(diff) {
  const sign = diff > 0 ? '+' : diff < 0 ? '-' : '';
  return `${sign}$${Math.abs(diff).toFixed(2)}`;
}

/**
 * Format a signed percentage as "+12.3%" / "-4.5%" / "0.0%".
 *
 * @param {number} pct
 * @returns {string}
 */
function formatPctDiff(pct) {
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

/**
 * Display label for the panel row corresponding to a tier.
 *
 * @param {Tier} tier
 * @param {string} homeState
 * @param {Record<string, string>} [stateNames]
 * @returns {string}
 */
function tierLabel(tier, homeState, stateNames) {
  if (tier === 'home') return (stateNames && stateNames[homeState]) || homeState;
  if (tier === 'nearby') return 'Nearby';
  return 'Other US';
}

/**
 * True when a node is one of TCGPlus's own elements (its className contains
 * "tcgplus-"). Used by the page-level MutationObserver to ignore changes that
 * we caused ourselves.
 *
 * @param {Node | null | undefined} n
 * @returns {boolean}
 */
function isOurNode(n) {
  if (!n || n.nodeType !== 1) return false;
  const el = /** @type {Element} */ (n);
  const cn =
    typeof el.className === 'string'
      ? el.className
      : (el.className && /** @type {SVGAnimatedString} */ (/** @type {unknown} */ (el.className)).baseVal) || '';
  return cn.indexOf('tcgplus-') !== -1;
}

/**
 * Build a degradation tracker that defers marking so transient hydration
 * races (listings landing before the market price element, an in-flight
 * cart fetch racing the next page tick, etc.) don't spam the console.
 * `mark(key, message)` schedules a delayed mark; if `clear(key)` runs first,
 * the timer is cancelled and nothing is logged or surfaced.
 *
 * @param {{
 *   debounceMs?: number,
 *   onChange?: () => void,
 *   log?: (msg: string) => void,
 *   setTimeoutFn?: typeof setTimeout,
 *   clearTimeoutFn?: typeof clearTimeout,
 * }} [opts]
 */
function createDegradationTracker(opts) {
  const o = opts || {};
  const debounceMs = typeof o.debounceMs === 'number' ? o.debounceMs : 1500;
  const onChange = o.onChange || (() => {});
  const log = o.log || ((msg) => console.warn(msg));
  const setT = o.setTimeoutFn || setTimeout;
  const clearT = o.clearTimeoutFn || clearTimeout;
  /** @type {Map<string, string>} */
  const entries = new Map();
  /** @type {Map<string, ReturnType<typeof setTimeout>>} */
  const pending = new Map();

  function mark(key, message) {
    // Already surfaced with this exact message? Nothing to do.
    if (entries.get(key) === message) return;
    // Replace any earlier pending mark for this key — latest message wins.
    const existing = pending.get(key);
    if (existing) clearT(existing);
    const timer = setT(() => {
      pending.delete(key);
      entries.set(key, message);
      log(`[TCG+] degraded: ${message}`);
      onChange();
    }, debounceMs);
    pending.set(key, timer);
  }

  function clear(key) {
    // Cancel a pending mark before it fires — this is the path that turns
    // a transient race into a no-op rather than a console warning.
    const existing = pending.get(key);
    if (existing) {
      clearT(existing);
      pending.delete(key);
    }
    if (!entries.has(key)) return;
    entries.delete(key);
    onChange();
  }

  return { mark, clear, entries };
}

/**
 * Memoise an async fetcher in `cache` by `key`, treating `null` as a
 * transient failure: the entry is evicted when the promise resolves
 * null, so the next call retries instead of pinning the failure for the
 * cache's lifetime. Concurrent callers share the in-flight promise, so
 * a burst of lookups for the same key still costs one fetch. Fetcher
 * rejections resolve to null (and evict) — callers never see a rejected
 * promise.
 *
 * Fetchers must reserve `null` for genuine failures (network error,
 * non-OK response) and return a non-null sentinel (empty Map, empty
 * object) for "fetched fine, nothing there" — otherwise legitimately
 * empty data gets re-fetched on every call.
 *
 * @template V
 * @param {Map<any, Promise<V | null>>} cache
 * @param {any} key
 * @param {() => Promise<V | null> | V | null} fetcher
 * @returns {Promise<V | null>}
 */
function cacheUntilNull(cache, key, fetcher) {
  const cached = cache.get(key);
  if (cached) return cached;
  const p = Promise.resolve()
    .then(fetcher)
    .catch(() => null);
  cache.set(key, p);
  p.then((v) => {
    if (v === null && cache.get(key) === p) cache.delete(key);
  });
  return p;
}

/**
 * Wrap an async function so overlapping triggers coalesce instead of
 * being dropped. While a run is in flight, any number of triggers mark
 * it dirty; when the run settles, exactly one follow-up run fires. This
 * guarantees the final run starts *after* the last trigger, so state
 * refreshed by `fn` can't go stale when triggers arrive mid-flight
 * (e.g. two cart changes in quick succession — the second used to join
 * the first's in-flight fetch and read a response that predated it).
 *
 * The returned promise resolves after the triggering run AND any
 * follow-up it queued have settled. `fn` rejections are swallowed —
 * callers fire-and-forget; error surfacing is `fn`'s own job.
 *
 * @param {() => Promise<void> | void} fn
 * @returns {() => Promise<void>}
 */
function createCoalescedRunner(fn) {
  /** @type {Promise<void> | null} */
  let inFlight = null;
  let queued = false;
  function trigger() {
    if (inFlight) {
      queued = true;
      return inFlight;
    }
    inFlight = Promise.resolve()
      .then(fn)
      .catch(() => {})
      .then(() => {
        inFlight = null;
        if (queued) {
          queued = false;
          return trigger();
        }
      });
    return inFlight;
  }
  return trigger;
}

/**
 * Compose the text and toggle button for the banner that mounts above the
 * search-grid tile list. Returns null when there's nothing to surface (no
 * tiles on the page carry TCGplayer's "Out of Stock" badge).
 *
 * The badge name is misleading: TCGplayer flags a tile when no listings
 * match the active URL filters (typically language + condition), not when
 * the product is genuinely unavailable. The banner copy reflects what's
 * actually true — a Japanese card on a Language=English search ends up
 * here, even though listings exist if you relax the language filter.
 *
 * Branches purely on the toggle state:
 *   - hide on  → "X tiles hidden ..." + button to show
 *   - hide off → "X tiles with no ..." + button to hide
 *
 * The button label and the target setting value are returned together so
 * the click handler in content.js can just persist `nextHide` without any
 * extra branching.
 *
 * @param {number} oosCount  number of `.search-result:has(.mp-oos-badge)` tiles
 * @param {boolean} hideOOS  current value of the hide-OOS setting
 * @returns {{ text: string, button: string, nextHide: boolean } | null}
 */
function describeOosBanner(oosCount, hideOOS) {
  if (!Number.isFinite(oosCount) || oosCount <= 0) return null;
  const n = Math.floor(oosCount);
  const tile = n === 1 ? 'tile' : 'tiles';
  if (hideOOS) {
    return {
      text: `${n} ${tile} hidden — no listings match your filters`,
      button: 'Show them',
      nextHide: false,
    };
  }
  return {
    text: `${n} ${tile} with no listings matching your filters`,
    button: 'Hide them',
    nextHide: true,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    STATES,
    STATE_NAMES,
    STATE_CODES,
    DEFAULT_NEARBY,
    VALID_TIERS,
    FREE_SHIP_THRESHOLD,
    parsePrice,
    parseShippingCost,
    parseUsdAmount,
    parseCartQuantity,
    computeCartVerdict,
    TCG_CONDITIONS,
    skuLookupKey,
    capConditionMarkets,
    parseConditionAndVariant,
    getUrlConditions,
    listingMatchesHeadlineCondition,
    extractSellerKey,
    classifyState,
    stateCodeFromInfo,
    formatLocation,
    chipColorForPct,
    chipForShipping,
    formatAbsDiff,
    formatPctDiff,
    tierLabel,
    isOurNode,
    createDegradationTracker,
    createCoalescedRunner,
    cacheUntilNull,
    describeOosBanner,
  };
}
