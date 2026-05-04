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
  const explicit = text.match(/\+?\s*\$\s*(\d+(?:\.\d+)?)\s*shipping/i);
  if (explicit) {
    const v = parseFloat(explicit[1]);
    if (Number.isFinite(v) && v >= 0) return v;
  }
  if (/shipping:\s*included/i.test(text)) return 0;
  if (/free\s+shipping/i.test(text) && !/orders?\s+over/i.test(text)) return 0;
  return null;
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
  };
}
