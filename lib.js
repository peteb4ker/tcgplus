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

function parsePrice(text) {
  if (!text) return null;
  const m = text.replace(/,/g, '').match(/\$\s*(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const v = parseFloat(m[1]);
  return Number.isFinite(v) && v > 0 ? v : null;
}

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

function extractSellerKey(href) {
  if (!href) return null;
  const m = href.match(/\/sellers\/[^/]+\/([a-z0-9]+)/i);
  return m ? m[1] : null;
}

function classifyState(stateCode, homeState, nearbyStates) {
  if (!stateCode) return 'intl';
  if (stateCode === homeState) return 'home';
  if (nearbyStates && nearbyStates.has(stateCode)) return 'nearby';
  return 'other';
}

function stateCodeFromInfo(info) {
  if (!info) return '';
  return info.addressCountryCode === 'US' ? info.addressTerritory || '' : '';
}

function formatLocation(info) {
  if (!info) return 'Unknown';
  const city = info.addressCity || '';
  const state = info.addressTerritory || '';
  const country = info.addressCountryCode || '';
  if (country === 'US' && state) return city ? `${city}, ${state}` : state;
  return info.location || country || 'Unknown';
}

function chipColorForPct(pct) {
  if (pct < 0) return { bg: '#1e7e1e', fg: '#fff' };
  if (pct === 0) return { bg: '#888', fg: '#fff' };
  if (pct >= 10) return { bg: '#c62828', fg: '#fff' };
  const hue = 60 - (pct / 10) * 60;
  const fg = pct < 4 ? '#222' : '#fff';
  return { bg: `hsl(${hue}, 78%, 45%)`, fg };
}

function chipForShipping(cost) {
  if (cost === 0) return { bg: '#1e7e1e', fg: '#fff', text: 'Shipping: Included' };
  if (cost < 2) return { bg: '#cc8c19', fg: '#fff', text: `$${cost.toFixed(2)} shipping` };
  return { bg: '#c62828', fg: '#fff', text: `$${cost.toFixed(2)} high shipping` };
}

function formatAbsDiff(diff) {
  const sign = diff > 0 ? '+' : diff < 0 ? '-' : '';
  return `${sign}$${Math.abs(diff).toFixed(2)}`;
}

function formatPctDiff(pct) {
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

function tierLabel(tier, homeState, stateNames) {
  if (tier === 'home') return (stateNames && stateNames[homeState]) || homeState;
  if (tier === 'nearby') return 'Nearby';
  return 'Other US';
}

function isOurNode(n) {
  if (!n || n.nodeType !== 1) return false;
  const cn = typeof n.className === 'string' ? n.className : (n.className && n.className.baseVal) || '';
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
