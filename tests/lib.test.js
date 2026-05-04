const { test } = require('node:test');
const assert = require('node:assert/strict');
const lib = require('../lib.js');

test('parsePrice extracts dollar amounts', () => {
  assert.equal(lib.parsePrice('$5.99'), 5.99);
  assert.equal(lib.parsePrice('  $ 12.34  '), 12.34);
  assert.equal(lib.parsePrice('+$0.10 (-17.9%)'), 0.1);
  assert.equal(lib.parsePrice('$1,234.56'), 1234.56);
});

test('parsePrice rejects invalid input', () => {
  assert.equal(lib.parsePrice(''), null);
  assert.equal(lib.parsePrice(null), null);
  assert.equal(lib.parsePrice('Free'), null);
  assert.equal(lib.parsePrice('$0'), null); // zero rejected; treated as missing
});

test('parseShippingCost: explicit "$X.XX Shipping"', () => {
  assert.equal(lib.parseShippingCost('+ $1.31 Shipping'), 1.31);
  assert.equal(lib.parseShippingCost('+$1.31 shipping'), 1.31);
  assert.equal(lib.parseShippingCost('$1.31 shipping'), 1.31);
  assert.equal(lib.parseShippingCost('+ $1.31 Shipping  Free Shipping on Orders Over $5'), 1.31);
});

test('parseShippingCost: rejects price-then-shipping conflation', () => {
  // A parent element containing both a listing price and the word "Shipping"
  // could trick a permissive regex into reading the listing price as
  // shipping cost. The anchor on parseShippingCost should refuse it.
  assert.equal(lib.parseShippingCost('Home Seller Near Mint $8.00 Shipping: Included'), 0);
  assert.equal(lib.parseShippingCost('Near Mint $8.00 + $1.31 Shipping'), null);
});

test('parseShippingCost: free / included', () => {
  assert.equal(lib.parseShippingCost('Shipping: Included'), 0);
  assert.equal(lib.parseShippingCost(' shipping:  included '), 0);
  assert.equal(lib.parseShippingCost('Free Shipping'), 0);
});

test('parseShippingCost: rejects bare "free shipping on orders over $X"', () => {
  assert.equal(lib.parseShippingCost('Free Shipping on Orders Over $5'), null);
  assert.equal(lib.parseShippingCost('FREE SHIPPING ON ORDERS OVER $25'), null);
});

test('parseShippingCost: nothing matches', () => {
  assert.equal(lib.parseShippingCost(''), null);
  assert.equal(lib.parseShippingCost(null), null);
  assert.equal(lib.parseShippingCost('Add to Cart'), null);
});

test('extractSellerKey from /sellers/<name>/<key>', () => {
  assert.equal(lib.extractSellerKey('/sellers/The-Poke-Farmer/b5a38050'), 'b5a38050');
  assert.equal(lib.extractSellerKey('https://www.tcgplayer.com/sellers/abc/123def456'), '123def456');
  assert.equal(lib.extractSellerKey(null), null);
  assert.equal(lib.extractSellerKey(''), null);
  assert.equal(lib.extractSellerKey('/products/foo'), null);
});

test('classifyState with home/nearby/other/intl', () => {
  const homeState = 'CA';
  const nearby = new Set(['OR', 'WA']);
  assert.equal(lib.classifyState('CA', homeState, nearby), 'home');
  assert.equal(lib.classifyState('OR', homeState, nearby), 'nearby');
  assert.equal(lib.classifyState('TX', homeState, nearby), 'other');
  assert.equal(lib.classifyState('', homeState, nearby), 'intl');
});

test('stateCodeFromInfo', () => {
  assert.equal(lib.stateCodeFromInfo({ addressCountryCode: 'US', addressTerritory: 'CA' }), 'CA');
  assert.equal(lib.stateCodeFromInfo({ addressCountryCode: 'US' }), '');
  assert.equal(lib.stateCodeFromInfo({ addressCountryCode: 'CA', addressTerritory: 'ON' }), '');
  assert.equal(lib.stateCodeFromInfo(null), '');
});

test('formatLocation prefers city, state for US', () => {
  assert.equal(
    lib.formatLocation({ addressCountryCode: 'US', addressTerritory: 'CA', addressCity: 'Atascadero' }),
    'Atascadero, CA'
  );
  assert.equal(lib.formatLocation({ addressCountryCode: 'US', addressTerritory: 'CA' }), 'CA');
  assert.equal(lib.formatLocation({ addressCountryCode: 'CA' }), 'CA');
  assert.equal(lib.formatLocation({ addressCountryCode: '', location: 'Tokyo' }), 'Tokyo');
  assert.equal(lib.formatLocation(null), 'Unknown');
});

test('chipColorForPct: green below market', () => {
  const c = lib.chipColorForPct(-5);
  assert.equal(c.bg, '#1e7e1e');
  assert.equal(c.fg, '#fff');
});

test('chipColorForPct: solid red at >= 10% over', () => {
  const c10 = lib.chipColorForPct(10);
  const c25 = lib.chipColorForPct(25);
  assert.equal(c10.bg, '#c62828');
  assert.equal(c25.bg, '#c62828');
});

test('chipColorForPct: gradient between 0 and 10', () => {
  const a = lib.chipColorForPct(2);
  const b = lib.chipColorForPct(7);
  // hue interpolated: at pct=2 → 60 - 12 = 48; at pct=7 → 60 - 42 = 18
  assert.match(a.bg, /hsl\(48/);
  assert.match(b.bg, /hsl\(18/);
});

test('chipColorForPct: neutral at parity', () => {
  const c = lib.chipColorForPct(0);
  assert.equal(c.bg, '#888');
});

test('chipForShipping: free / yellow / red', () => {
  assert.equal(lib.chipForShipping(0).text, 'Shipping: Included');
  assert.equal(lib.chipForShipping(0).bg, '#1e7e1e');
  assert.equal(lib.chipForShipping(1.31).text, '$1.31 shipping');
  assert.equal(lib.chipForShipping(1.31).bg, '#cc8c19');
  assert.equal(lib.chipForShipping(3.99).text, '$3.99 high shipping');
  assert.equal(lib.chipForShipping(3.99).bg, '#c62828');
  assert.equal(lib.chipForShipping(2).bg, '#c62828');
});

test('formatAbsDiff', () => {
  assert.equal(lib.formatAbsDiff(1.234), '+$1.23');
  assert.equal(lib.formatAbsDiff(-0.5), '-$0.50');
  assert.equal(lib.formatAbsDiff(0), '$0.00');
});

test('formatPctDiff', () => {
  assert.equal(lib.formatPctDiff(5), '+5.0%');
  assert.equal(lib.formatPctDiff(-3.456), '-3.5%');
  assert.equal(lib.formatPctDiff(0), '0.0%');
});

test('tierLabel uses home state name', () => {
  const names = { CA: 'California', OR: 'Oregon' };
  assert.equal(lib.tierLabel('home', 'CA', names), 'California');
  assert.equal(lib.tierLabel('home', 'XX', names), 'XX'); // fallback to code
  assert.equal(lib.tierLabel('nearby', 'CA', names), 'Nearby');
  assert.equal(lib.tierLabel('other', 'CA', names), 'Other US');
});

test('isOurNode catches tcgplus-* className', () => {
  const our = { nodeType: 1, className: 'tcgplus-loc tcgplus-home' };
  const theirs = { nodeType: 1, className: 'listing-item' };
  const text = { nodeType: 3 };
  const svg = { nodeType: 1, className: { baseVal: 'tcgplus-icon' } };
  assert.equal(lib.isOurNode(our), true);
  assert.equal(lib.isOurNode(theirs), false);
  assert.equal(lib.isOurNode(text), false);
  assert.equal(lib.isOurNode(svg), true);
  assert.equal(lib.isOurNode(null), false);
});

test('STATES is a list of [code, name] pairs covering 50 + DC', () => {
  assert.equal(lib.STATES.length, 51);
  assert.deepEqual(lib.STATE_NAMES.CA, 'California');
  assert.equal(lib.STATE_CODES.has('CA'), true);
  assert.equal(lib.STATE_CODES.has('XX'), false);
  assert.equal(lib.FREE_SHIP_THRESHOLD, 5.0);
});
