(async () => {
  'use strict';

  const SELLER_API = 'https://seller-stores-backend.tcgplayer.com/sm/seller/';
  const PRODUCT_DETAILS_API = (id) => `https://mp-search-api.tcgplayer.com/v2/product/${id}/details?mpfev=5199`;
  const SKU_MARKET_PRICE_API = 'https://mpgateway.tcgplayer.com/v1/pricepoints/marketprice/skus/search?mpfev=5199';

  // -- Settings state -----------------------------------------------------
  // Defaults; overridden in `loadSettings()` from chrome.storage.local.
  let homeState = 'CA';
  let nearbyStates = new Set(DEFAULT_NEARBY);
  let activeFilter = null;
  let forceNearMint = false;
  let hideOOS = false;

  const HIDE_TOGGLES = [
    { id: 'breakdown', storageKey: STORAGE_KEYS.hideBreakdown, bodyClass: 'tcgplus-hide-breakdown' },
    {
      id: 'recommendations',
      storageKey: STORAGE_KEYS.hideRecommendations,
      bodyClass: 'tcgplus-hide-recommendations',
    },
    { id: 'footer', storageKey: STORAGE_KEYS.hideFooter, bodyClass: 'tcgplus-hide-footer' },
  ];
  /** @type {Record<string, boolean>} */
  const hideState = { breakdown: false, recommendations: false, footer: false };

  function applyHideToggles() {
    const cl = document.documentElement.classList;
    for (const t of HIDE_TOGGLES) cl.toggle(t.bodyClass, !!hideState[t.id]);
  }

  function applyHideOOS() {
    document.documentElement.classList.toggle('tcgplus-hide-oos', hideOOS);
    renderOosBanner();
  }

  /**
   * Apply a settings snapshot (from chrome.storage.local) to local state.
   * Migrates pre-rename activeFilter values ('ca' -> 'home', 'west' -> 'nearby').
   *
   * @param {Record<string, unknown>} stored
   */
  function applySettings(stored) {
    const h = /** @type {string | undefined} */ (stored[STORAGE_KEYS.homeState]);
    if (h && STATE_CODES.has(h)) homeState = h;
    const n = stored[STORAGE_KEYS.nearbyStates];
    if (Array.isArray(n)) {
      nearbyStates = new Set(n.filter((c) => typeof c === 'string' && STATE_CODES.has(c) && c !== homeState));
    }
    let f = /** @type {string | undefined} */ (stored[STORAGE_KEYS.activeFilter]);
    if (f === 'ca') f = 'home';
    else if (f === 'west') f = 'nearby';
    activeFilter = f && VALID_TIERS.has(f) ? f : null;
    forceNearMint = stored[STORAGE_KEYS.forceNearMint] === true;
    hideOOS = stored[STORAGE_KEYS.hideOOS] === true;
    for (const t of HIDE_TOGGLES) hideState[t.id] = stored[t.storageKey] === true;
  }

  // -- Cart state ---------------------------------------------------------
  /** @type {Map<string, number>} */
  const cartSellerSubtotal = new Map();
  let cartSubtotal = 0;
  const CART_SUMMARY_URL = (key) => `https://mpgateway.tcgplayer.com/v1/cart/${key}/summary?mpfev=5106`;

  // -- Seller cache -------------------------------------------------------
  // Null results (network blip, non-OK status) are evicted so the next
  // scan retries, instead of pinning the failure for the page lifetime
  // and leaving every listing from that seller unannotated (#98).
  /** @type {Map<string, Promise<SellerInfo | null>>} */
  const sellerCache = new Map();
  function fetchSeller(sellerKey) {
    return cacheUntilNull(sellerCache, sellerKey, () =>
      fetch(SELLER_API + encodeURIComponent(sellerKey), { credentials: 'omit' }).then((r) => (r.ok ? r.json() : null))
    );
  }

  // -- Per-product per-SKU market-price cache -----------------------------
  // The headline market price on a search-list tile or product page is for
  // one (condition, variant, language) SKU — Normal × Near Mint × English
  // by default. A tile can show listings spanning other variants
  // (Holofoil, Reverse Holofoil) and other conditions whose true market
  // prices differ significantly. We resolve each listing to its own SKU
  // via TCGplayer's own two endpoints (the same ones the official site
  // uses): product/details for the SKU list, then a POST to
  // pricepoints/marketprice/skus/search for the per-SKU market price.
  //
  // Cache by productId for the life of the page — pricing updates on a
  // multi-minute cadence, and a single search-list view rarely has more
  // than ~20 products visible.

  /** @type {Map<number, Promise<Map<string, number> | null>>} */
  const productSkuPricingCache = new Map();

  // Null (evicted, retried next scan) is reserved for fetch failures.
  // A product that legitimately has no usable SKUs resolves to an empty
  // Map, which stays cached — re-fetching "nothing there" every scan
  // would hammer the API on pages full of non-English products (#98).
  function fetchProductSkuPricing(productId) {
    if (!Number.isFinite(productId)) return Promise.resolve(null);
    return cacheUntilNull(productSkuPricingCache, productId, async () => {
      const dResp = await fetch(PRODUCT_DETAILS_API(productId), {
        credentials: 'omit',
        headers: { accept: 'application/json' },
      });
      if (!dResp.ok) return null;
      const details = await dResp.json();
      const skus = Array.isArray(details && details.skus) ? details.skus : [];
      const skuIds = skus.map((s) => s && s.sku).filter((x) => Number.isFinite(x));
      if (!skuIds.length) return new Map();
      const pResp = await fetch(SKU_MARKET_PRICE_API, {
        method: 'POST',
        credentials: 'omit',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ skuIds }),
      });
      if (!pResp.ok) return null;
      const prices = await pResp.json();
      const skuMeta = new Map();
      for (const s of skus) skuMeta.set(s.sku, s);
      const out = new Map();
      const rows = Array.isArray(prices) ? prices : [];
      for (const row of rows) {
        if (!row || typeof row.marketPrice !== 'number') continue;
        const meta = skuMeta.get(row.skuId);
        if (!meta) continue;
        // Only English for now — the listing's language column is
        // independent and we don't read it yet. English is the
        // overwhelming majority of TCGplayer listings.
        if (meta.language && meta.language !== 'English') continue;
        out.set(skuLookupKey(meta.condition, meta.variant), row.marketPrice);
      }
      // TCGplayer's thin-data condition tiers can price a worse condition
      // above a better one (stale recalculation on a moving card), which
      // makes cheap LP listings look like deals against a market that no
      // longer exists. Cap each tier at the best condition above it (#111).
      return capConditionMarkets(out);
    });
  }

  /** Pull the productId from a listing's surrounding context. */
  function getProductIdForItem(item) {
    if (item) {
      const tile = item.closest('.search-result');
      if (tile) {
        const link = tile.querySelector('a[href*="/product/"]');
        const href = link && link.getAttribute('href');
        if (href) {
          const m = href.match(/\/product\/(\d+)/);
          if (m) return Number(m[1]);
        }
      }
    }
    const pageMatch = location.pathname.match(/\/product\/(\d+)/);
    return pageMatch ? Number(pageMatch[1]) : null;
  }

  // -- Setters that also persist -----------------------------------------
  function setActiveFilter(value) {
    activeFilter = value;
    if (value) saveSetting(STORAGE_KEYS.activeFilter, value);
    else removeSetting(STORAGE_KEYS.activeFilter);
  }

  // -- Near Mint URL enforcement -----------------------------------------
  function enforceNearMint() {
    if (!forceNearMint) return;
    if (!/\/(product|search)\//.test(location.pathname)) return;
    const url = new URL(location.href);
    if (url.searchParams.get('Condition') === 'Near Mint') return;
    url.searchParams.set('Condition', 'Near Mint');
    location.replace(url.toString());
  }

  // -- Cart fetch ---------------------------------------------------------
  function getCartKey() {
    const m = document.cookie.match(/StoreCart_PRODUCTION=CK=([a-f0-9]+)/);
    return m ? m[1] : null;
  }

  // Coalesced: a refresh requested while a fetch is in flight queues
  // exactly one follow-up fetch after the current one settles, so the
  // subtotal always reflects a response requested *after* the last cart
  // change. Without this, two quick cart changes left the badge showing
  // the first change's total until some future mutation (#97).
  const refreshCart = createCoalescedRunner(async () => {
    const key = getCartKey();
    if (!key) {
      cartSubtotal = 0;
      cartSellerSubtotal.clear();
      renderCartBadge();
      return;
    }
    try {
      const r = await fetch(CART_SUMMARY_URL(key), {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      if (r.ok) {
        const json = await r.json();
        const cart = json && json.results && json.results[0];
        cartSellerSubtotal.clear();
        if (cart) {
          for (const s of cart.sellers || []) {
            if (s.sellerKey) cartSellerSubtotal.set(s.sellerKey, Number(s.productTotalCost) || 0);
          }
          cartSubtotal = Number(cart.itemSubtotal) || 0;
        } else {
          cartSubtotal = 0;
        }
        clearDegraded('cart');
      } else {
        markDegraded('cart', "Couldn't load your cart. The Deal chip will fall back to ignoring cart context.");
      }
    } catch (_) {
      markDegraded('cart', "Couldn't load your cart. The Deal chip will fall back to ignoring cart context.");
    }
    renderCartBadge();
    recomputeDealChips();
  });

  function renderCartBadge() {
    const countEl = document.querySelector('.mp-header__content__cart-count');
    if (!countEl) return;
    let label = countEl.querySelector('.tcgplus-cart-subtotal');
    if (!label) {
      label = document.createElement('span');
      label.className = 'tcgplus-cart-subtotal';
      countEl.appendChild(label);
    }
    const text = `$${cartSubtotal.toFixed(2)}`;
    if (label.textContent !== text) label.textContent = text;
  }

  let cartCountObserver = null;
  /** @type {Element | null} */
  let cartCountObservedEl = null;
  function watchCartCount() {
    const countEl = document.querySelector('.mp-header__content__cart-count__chip');
    if (!countEl) return;
    // Already observing this exact element? Nothing to do.
    if (cartCountObservedEl === countEl) return;
    // Either no observer yet, or the SPA replaced the header subtree out from
    // under us (route change). Detach the stale observer and attach to the
    // new element. Without this re-attach, adding items to the cart after an
    // SPA nav wouldn't update the header subtotal until a hard reload (#45).
    const isReattach = cartCountObservedEl !== null;
    if (cartCountObserver) cartCountObserver.disconnect();
    cartCountObserver = new MutationObserver(() => refreshCart());
    cartCountObserver.observe(countEl, { childList: true, characterData: true, subtree: true });
    cartCountObservedEl = countEl;
    // Re-attach (not first attach) means we lost observation for some
    // window during the SPA route swap. Refresh once so the badge reflects
    // anything that changed while we weren't watching.
    if (isReattach) refreshCart();
  }

  // -- Listing chip helpers ----------------------------------------------
  const MARKET_PRICE_SELECTOR = '.price-points__upper__price';
  const LISTING_PRICE_SELECTORS = [
    '.listing-item__listing-data__info__price',
    '.listing-item__price',
    '[data-testid="listing-price"]',
  ];
  const LISTING_SHIPPING_SELECTORS = [
    '.listing-item__listing-data__info__shipping',
    // 2026 product-page redesign appends "-message" and folds the
    // free-shipping promo text into the same span (#117).
    '.listing-item__listing-data__info__shipping-message',
    '.listing-item__shipping',
    '[data-testid="shipping"]',
  ];
  let listingPriceWarned = false;

  function hasFreeShippingPromo(item) {
    if (item.querySelector('.free-shipping-over-min')) return true;
    return /free\s+shipping\s+on\s+orders?\s+over/i.test(item.textContent || '');
  }

  function findListingShipping(item) {
    for (const sel of LISTING_SHIPPING_SELECTORS) {
      const el = item.querySelector(sel);
      if (!el) continue;
      const cost = parseShippingCost(el.textContent);
      if (cost != null) return { el, cost };
    }
    const candidates = item.querySelectorAll('span, div, p');
    for (const el of candidates) {
      if (el.children.length > 2) continue;
      const text = (el.textContent || '').trim();
      if (!/shipping/i.test(text)) continue;
      const cost = parseShippingCost(text);
      if (cost != null) return { el, cost };
    }
    return null;
  }

  // 2026 redesign: the product page's market price moved from
  // .price-points__upper__price into the price-guide header table, a
  // label cell + value cell pair with no stable class or testid (#117).
  // Located by label text, same approach as the checkout Order Summary.
  // The header follows the URL's Printing= filter, so it stays
  // variant-aware on filtered pages.
  function findPriceGuideMarket() {
    const cells = document.querySelectorAll('.price-guide td, .price-guide th');
    for (const cell of cells) {
      if (!/^market price$/i.test((cell.textContent || '').trim())) continue;
      const sib = cell.nextElementSibling;
      const v = sib && parsePrice(sib.textContent);
      if (v) return v;
    }
    return null;
  }

  function findMarketPrice(item) {
    if (item) {
      const tile = item.closest('.search-result');
      if (tile) {
        const tileEl = tile.querySelector('.product-info__market-price--value, .product-card__market-price--value');
        const v = tileEl && parsePrice(tileEl.textContent);
        if (v) return v;
      }
    }
    // Don't cache: TCGplayer is an SPA and the same content-script instance
    // sees multiple products as the user navigates. A cached value would
    // leak the previous product's market price into chips on the new one.
    const el = document.querySelector(MARKET_PRICE_SELECTOR);
    const v = el ? parsePrice(el.textContent) : null;
    if (v) return v;
    return findPriceGuideMarket();
  }

  function findListingPriceEl(item) {
    for (const sel of LISTING_PRICE_SELECTORS) {
      const el = item.querySelector(sel);
      if (el && parsePrice(el.textContent)) return el;
    }
    if (!listingPriceWarned) {
      console.warn('[TCG+] could not find listing price element; share this DOM:', item.outerHTML.slice(0, 1500));
      listingPriceWarned = true;
    }
    markDegraded('listing-price', "Couldn't find a listing's price. Chips for that listing won't render.");
    return null;
  }

  /**
   * Build the HTML string for a single price-vs-market chip.
   * Shared between the list-view tile renderer (where it's the middle of
   * three sibling chips), the grid-view tile renderer (where it's the
   * only chip), and the cart-row renderer.
   *
   * @param {number} price
   * @param {number} market
   * @param {{ titleNote?: string }} [opts]  extra tooltip text appended
   *   after the market figure, e.g. a note that the compared price
   *   includes shipping (grid tiles show only a shipping-inclusive price).
   */
  function buildDeltaChipHtml(price, market, opts) {
    const diff = price - market;
    const pct = (diff / market) * 100;
    const colors = chipColorForPct(pct);
    const note = opts && opts.titleNote ? ` ${opts.titleNote}` : '';
    return `<span class="tcgplus-price-chip" style="background:${colors.bg};color:${colors.fg};" title="vs market $${market.toFixed(2)}${note}">${formatAbsDiff(diff)} (${formatPctDiff(pct)})</span>`;
  }

  function findListingCondition(item) {
    // Old-gen class first, then the 2026 redesign's .listing-item__condition.
    // Both carry the variant inline ("Near Mint Reverse Holofoil"), so
    // parseConditionAndVariant is unaffected by the rename (#117).
    const el = item.querySelector('.listing-item__listing-data__info__condition, .listing-item__condition');
    return el ? (el.textContent || '').trim() : null;
  }

  /**
   * Look up the per-SKU market price for a listing via TCGplayer's own
   * pricing endpoints. Returns null if we can't resolve the listing's
   * variant or the API call fails — caller falls back to the headline
   * market price (with a condition-match gate to avoid misleading intel).
   */
  async function findPerSkuMarket(item) {
    const productId = getProductIdForItem(item);
    if (!productId) return null;
    const text = findListingCondition(item);
    if (!text) return null;
    const { condition, variant } = parseConditionAndVariant(text);
    if (!condition) return null;
    const pricing = await fetchProductSkuPricing(productId);
    if (!pricing) return null;
    const v = pricing.get(skuLookupKey(condition, variant));
    return Number.isFinite(v) ? v : null;
  }

  /**
   * @param {HTMLElement} item
   * @param {number} market
   * @param {{ perSku?: boolean }} [opts]
   */
  function addPriceChips(item, market, opts) {
    if (item.dataset.tcgplusChips === '1') return;
    const priceEl = findListingPriceEl(item);
    if (!priceEl) return;
    const price = parsePrice(priceEl.textContent);
    if (!price) return;

    // When the market price came from the per-SKU lookup, it's already
    // condition+variant specific — no gate needed. When we fell back to
    // the page's headline market, gate on the FULL listing condition
    // text (including any variant suffix) so a "Near Mint Holofoil"
    // listing in a Near-Mint-Normal-headlined tile doesn't get a
    // misleading delta. See #69.
    let conditionMatches = true;
    if (!(opts && opts.perSku)) {
      const text = findListingCondition(item);
      const headlineConditions = getUrlConditions(location.href);
      conditionMatches = listingMatchesHeadlineCondition(text, headlineConditions);
    }

    const deltaChipHtml = conditionMatches ? buildDeltaChipHtml(price, market) : '';

    const wrap = document.createElement('span');
    wrap.className = 'tcgplus-price-chips';

    const shipping = findListingShipping(item);
    if (shipping) {
      const sc = chipForShipping(shipping.cost);
      const shipChipHtml = `<span class="tcgplus-price-chip tcgplus-ship-chip" style="background:${sc.bg};color:${sc.fg};">${sc.text}</span>`;
      if (conditionMatches) {
        const promoFree = hasFreeShippingPromo(item);
        item.dataset.tcgplusPrice = String(price);
        item.dataset.tcgplusShipping = String(shipping.cost);
        item.dataset.tcgplusPromo = promoFree ? '1' : '0';
        item.dataset.tcgplusMarket = String(market);
        const dealChipHtml = renderDealChipHtml(item);
        wrap.innerHTML = dealChipHtml + deltaChipHtml + shipChipHtml;
      } else {
        // No data attributes set, so recomputeDealChips won't try to
        // render a DEAL chip on this listing later either.
        wrap.innerHTML = shipChipHtml;
      }
      shipping.el.dataset.tcgplusOriginalText = shipping.el.textContent.trim();
      shipping.el.innerHTML = '';
      shipping.el.appendChild(wrap);
    } else if (conditionMatches) {
      wrap.innerHTML = deltaChipHtml;
      priceEl.appendChild(wrap);
    }
    // else: condition mismatch and no shipping cell — nothing trustworthy
    // to render, leave the listing as-is.

    item.dataset.tcgplusChips = '1';
  }

  /**
   * Try the per-SKU market price first; fall back to the headline market
   * price if per-SKU resolution fails. Single point of entry for the
   * chip-rendering pipeline so both callers (backfill + main handler)
   * stay consistent.
   */
  async function addPriceChipsWithMarket(item) {
    if (item.dataset.tcgplusChips === '1') return false;
    const perSku = await findPerSkuMarket(item);
    if (Number.isFinite(perSku)) {
      addPriceChips(item, perSku, { perSku: true });
      return true;
    }
    const headline = findMarketPrice(item);
    if (Number.isFinite(headline)) {
      addPriceChips(item, headline);
      return true;
    }
    return false;
  }

  function renderDealChipHtml(item) {
    const price = parseFloat(item.dataset.tcgplusPrice || '0');
    const shipping = parseFloat(item.dataset.tcgplusShipping || '0');
    const market = parseFloat(item.dataset.tcgplusMarket || '0');
    const promoFree = item.dataset.tcgplusPromo === '1';
    const sellerKey = item.dataset.tcgplusSellerKey || '';
    if (!price || !market) return '';
    const sellerCart = sellerKey ? cartSellerSubtotal.get(sellerKey) || 0 : 0;
    const promoQualifies = promoFree && sellerCart + price >= FREE_SHIP_THRESHOLD;
    const effectiveShipping = promoQualifies ? 0 : shipping;
    const total = price + effectiveShipping;
    if (total >= market) return '';
    const note = promoQualifies
      ? `Total $${total.toFixed(2)} (free-shipping promo applies: $${sellerCart.toFixed(2)} already with this seller + $${price.toFixed(2)} clears the $${FREE_SHIP_THRESHOLD.toFixed(2)} threshold)`
      : `Total $${total.toFixed(2)} is below market $${market.toFixed(2)}`;
    return `<span class="tcgplus-price-chip tcgplus-deal-chip" title="${note}">Deal</span>`;
  }

  function recomputeDealChips() {
    document.querySelectorAll('.listing-item[data-tcgplus-chips="1"]').forEach((item) => {
      const wrap = item.querySelector('.tcgplus-price-chips');
      if (!wrap) return;
      const existing = wrap.querySelector('.tcgplus-deal-chip');
      const html = renderDealChipHtml(item);
      if (!html) {
        if (existing) existing.remove();
        return;
      }
      if (existing) {
        const tmp = document.createElement('span');
        tmp.innerHTML = html;
        wrap.replaceChild(tmp.firstChild, existing);
      } else {
        const tmp = document.createElement('span');
        tmp.innerHTML = html;
        wrap.insertBefore(tmp.firstChild, wrap.firstChild);
      }
    });
  }

  function backfillPriceChips() {
    document.querySelectorAll('.listing-item[data-tcgplus="done"]:not([data-tcgplus-chips])').forEach((el) => {
      // Fire-and-forget — backfill is best-effort; the next pass picks
      // up anything that's still un-chipped.
      addPriceChipsWithMarket(/** @type {HTMLElement} */ (el)).catch(() => {});
    });
  }

  // -- Grid-view product cards -------------------------------------------
  // The search page in grid mode renders `.product-card__product` tiles
  // without a `.listing-item`. Each tile shows one product with its cheapest
  // listing price and a per-tile market price; there's no per-tile shipping
  // info, so only a delta chip applies (no shipping, no Deal).

  function extractSellerKeyFromCard(card) {
    const anchor = card.closest('a') || card.querySelector('a');
    const href = anchor && anchor.getAttribute('href');
    if (!href) return '';
    const u = new URL(href, location.origin);
    return u.searchParams.get('seller') || '';
  }

  function findCardMarketPrice(card) {
    const el = card.querySelector('.product-card__market-price--value');
    return el ? parsePrice(el.textContent) : null;
  }

  function findCardPriceEl(card) {
    return card.querySelector('.inventory__price-with-shipping');
  }

  async function annotateProductCard(card) {
    if (card.dataset.tcgplus) return;

    // Tiles flagged out-of-stock by TCGplayer have no buyable price —
    // the seller fetch and price-element hunt are wasted work, and a
    // missing market element on these tiles would mark a spurious
    // market-price degradation (the tile just has no listings matching
    // the filters, not selector drift). See #100.
    if (card.querySelector('.mp-oos-badge')) {
      card.dataset.tcgplus = 'done';
      return;
    }
    card.dataset.tcgplus = 'pending';

    const sellerKey = extractSellerKeyFromCard(card);
    if (sellerKey) {
      // Best-effort tier classification for consistency with the panel; we
      // don't render a per-tile location badge in single-seller mode and
      // the grid tile has no good place to put one anyway.
      const info = await fetchSeller(sellerKey);
      if (info) {
        const stateCode = stateCodeFromInfo(info);
        const tier = classifyState(stateCode, homeState, nearbyStates);
        card.dataset.tcgplusSellerKey = sellerKey;
        card.dataset.tcgplusState = stateCode;
        card.dataset.tcgplusTier = tier;
      }
    }
    card.dataset.tcgplus = 'done';

    const market = findCardMarketPrice(card);
    const priceEl = findCardPriceEl(card);
    if (!market || !priceEl) {
      if (!market) {
        markDegraded('market-price', "Couldn't find this page's market price. Price-vs-market chips won't render.");
      }
      return;
    }
    clearDegraded('market-price');
    const price = parsePrice(priceEl.textContent);
    if (!price) return;

    const wrap = document.createElement('span');
    wrap.className = 'tcgplus-price-chips tcgplus-price-chips--card';
    // Grid tiles only show TCGplayer's shipping-inclusive cheapest-listing
    // price, so this delta compares an all-in price against market and
    // reads slightly worse than the list-view delta for the same listing.
    // Say so in the tooltip. Keep the README's grid-view paragraph in
    // sync with this note (#99).
    wrap.innerHTML = buildDeltaChipHtml(price, market, { titleNote: '(tile price includes shipping)' });
    priceEl.appendChild(wrap);
    card.dataset.tcgplusChips = '1';
  }

  // -- Cart-page rows -----------------------------------------------------
  // The cart page renders each line item as a `.package-item` inside a
  // `.package` grouped by seller. The condition cell carries the full
  // "Near Mint Holofoil"-style string that parseConditionAndVariant
  // handles, and the productId is in the row's product link. Per-SKU
  // pricing already gives us the right market for any variant/condition
  // combo — wire it in so users can see whether items they've added to
  // the cart are still a good deal before they check out (#72).

  function findCartProductId(item) {
    const link = item.querySelector('a[href*="/product/"]');
    const href = link && link.getAttribute('href');
    if (!href) return null;
    const m = href.match(/\/product\/(\d+)/);
    return m ? Number(m[1]) : null;
  }

  function findCartConditionText(item) {
    const el = item.querySelector('[data-testid="txtItemCondition"], .item-sales-info .condition');
    return el ? (el.textContent || '').trim() : null;
  }

  function findCartPriceEl(item) {
    return item.querySelector('[data-testid="txtItemPrice"], .item-sales-info .price');
  }

  async function annotateCartItem(item) {
    // pending = a fetch is already in flight for this row; don't double-up.
    if (item.dataset.tcgplus === 'pending') return;
    // Chip already present and intact — no work needed.
    if (item.querySelector('.tcgplus-price-chips--cart')) return;

    // From here on we're either annotating a fresh row, or RE-annotating
    // a row whose chip TCGplayer destroyed. TCGplayer's responsive cart
    // layout wipes .item-sales-info's children at narrow breakpoints and
    // rebuilds them on the way back to wide, taking our chip with it but
    // leaving the outer .package-item element (and our stale data-*
    // attributes) intact. Without this re-entry path the chip never
    // returns after a narrow detour. Reset state so a fresh fetch +
    // injection runs cleanly.
    delete item.dataset.tcgplus;
    delete item.dataset.tcgplusChips;
    item.dataset.tcgplus = 'pending';

    const productId = findCartProductId(item);
    const conditionText = findCartConditionText(item);
    const priceEl = findCartPriceEl(item);
    if (!priceEl) {
      item.dataset.tcgplus = 'done';
      return;
    }
    const price = parsePrice(priceEl.textContent);
    if (!price) {
      item.dataset.tcgplus = 'done';
      return;
    }
    // Stash unit price + quantity as soon as they're known, market or
    // not — the checkout verdict aggregates from these datasets, and a
    // row with no market data still contributes at its listed price.
    item.dataset.tcgplusUnitPrice = String(price);
    item.dataset.tcgplusQty = String(parseCartQuantity(priceEl.textContent));
    if (!productId || !conditionText) {
      item.dataset.tcgplus = 'done';
      renderCheckoutVerdict();
      return;
    }
    const { condition, variant } = parseConditionAndVariant(conditionText);
    if (!condition) {
      // Unknown condition tier — can't resolve to a SKU. No fallback on
      // cart rows: there's no headline market price to gate against, so a
      // chip would be a guess. Better to skip.
      item.dataset.tcgplus = 'done';
      renderCheckoutVerdict();
      return;
    }
    const pricing = await fetchProductSkuPricing(productId);
    item.dataset.tcgplus = 'done';
    const market = pricing ? pricing.get(skuLookupKey(condition, variant)) : undefined;
    if (!Number.isFinite(market)) {
      renderCheckoutVerdict();
      return;
    }
    item.dataset.tcgplusCartMarket = String(market);
    // Datasets changed without any childList mutation (attribute writes
    // don't wake the observer), so refresh the verdict directly. It's
    // idempotent; the chip injection below re-triggers it via scan too.
    renderCheckoutVerdict();

    // Inject the chip as a sibling AFTER the price element rather than
    // a child. The cart-row layout right-aligns the price `<p>`; widening
    // it with an inline chip throws off that alignment so $0.12 ends up
    // looking centred instead of flush right. A sibling block lets the
    // price keep its original width and gets its own right-aligned
    // .item-sales-info row.
    const parent = priceEl.parentElement;
    if (!parent) return;
    // Belt-and-suspenders: an async fetch could race with another scan
    // pass; bail if a sibling chip slipped in while we were awaiting.
    if (parent.querySelector(':scope > .tcgplus-price-chips--cart')) {
      item.dataset.tcgplusChips = '1';
      return;
    }
    const wrap = document.createElement('div');
    wrap.className = 'tcgplus-price-chips tcgplus-price-chips--cart';
    wrap.innerHTML = buildDeltaChipHtml(price, market);
    priceEl.insertAdjacentElement('afterend', wrap);
    item.dataset.tcgplusChips = '1';
  }

  // -- Shop-by-seller banner ---------------------------------------------
  // When the search page is filtered to a single seller, TCGplayer renders a
  // banner with the store name. Surface the seller's location once in that
  // banner so the per-tile suppression doesn't lose information.

  // Matches both generations: .shop-by-seller-message (pre-2026) and the
  // .shop-by-seller-banner family from the redesign (#117).
  const SELLER_BANNER_SELECTOR = '.shop-by-seller-message, .shop-by-seller-banner';

  async function enhanceShopBySellerBanner() {
    const banner = /** @type {HTMLElement | null} */ (document.querySelector(SELLER_BANNER_SELECTOR));
    if (!banner || banner.dataset.tcgplus) return;
    banner.dataset.tcgplus = 'pending';

    const url = new URL(location.href);
    const sellerKey = url.searchParams.get('seller') || '';
    if (!sellerKey) {
      banner.dataset.tcgplus = 'no-key';
      return;
    }
    const info = await fetchSeller(sellerKey);
    if (!info) {
      // Same retry contract as annotate(): clear so the next scan retries.
      delete banner.dataset.tcgplus;
      return;
    }
    const stateCode = stateCodeFromInfo(info);
    const tier = classifyState(stateCode, homeState, nearbyStates);
    const text = formatLocation(info);
    if (!banner.querySelector('.tcgplus-loc')) {
      const badge = document.createElement('span');
      badge.className = `tcgplus-loc tcgplus-${tier}`;
      badge.style.marginLeft = '8px';
      badge.textContent = text;
      // Anchor after the store-name element of whichever generation is
      // present; fall back to appending to the message text / banner.
      const store = banner.querySelector('.shop-by-seller-banner__store, strong');
      if (store) {
        store.insertAdjacentElement('afterend', badge);
      } else {
        const span = banner.querySelector('.shop-by-seller-banner__message-text, span') || banner;
        span.appendChild(badge);
      }
    }
    banner.dataset.tcgplus = 'done';
  }

  // -- Panel --------------------------------------------------------------
  let panel;
  /** @type {HTMLElement | null} */
  let oosBanner = null;

  // Many "degraded" states are actually transient during normal page hydration:
  // the listing-item DOM lands before the market-price element, the cart fetch
  // races with another listings batch, etc. The tracker defers each mark so a
  // quick clear cancels it silently — only states that persist past the
  // debounce window surface in the console + panel.
  const degradationTracker = createDegradationTracker({
    onChange: () => renderPanel(),
  });
  const degradations = degradationTracker.entries;
  const markDegraded = degradationTracker.mark;
  const clearDegraded = degradationTracker.clear;

  function computeStats() {
    const counts = { home: 0, nearby: 0, other: 0 };
    document.querySelectorAll('.listing-item[data-tcgplus-tier]').forEach((el) => {
      const t = /** @type {HTMLElement} */ (el).dataset.tcgplusTier;
      if (t && t in counts) counts[/** @type {keyof typeof counts} */ (t)]++;
    });
    return counts;
  }

  function applyFilter() {
    const root = document.documentElement;
    root.classList.remove('tcgplus-filter-home', 'tcgplus-filter-nearby', 'tcgplus-filter-other');
    if (activeFilter) root.classList.add(`tcgplus-filter-${activeFilter}`);
    if (panel) {
      panel.querySelectorAll('.tcgplus-panel-row').forEach((r) => {
        r.classList.toggle('tcgplus-panel-row-active', r.dataset.tier === activeFilter);
      });
    }
  }

  function reclassifyAll() {
    document.querySelectorAll('.listing-item[data-tcgplus="done"]').forEach((rawEl) => {
      const el = /** @type {HTMLElement} */ (rawEl);
      const stateCode = el.dataset.tcgplusState || '';
      const tier = classifyState(stateCode, homeState, nearbyStates);
      const oldTier = el.dataset.tcgplusTier;
      if (tier === oldTier) return;
      el.dataset.tcgplusTier = tier;
      el.classList.remove('tcgplus-row-home', 'tcgplus-row-nearby', 'tcgplus-row-other', 'tcgplus-row-intl');
      el.classList.add(`tcgplus-row-${tier}`);
      const badge = el.querySelector('.tcgplus-loc');
      if (badge) {
        badge.classList.remove('tcgplus-home', 'tcgplus-nearby', 'tcgplus-other', 'tcgplus-intl');
        badge.classList.add(`tcgplus-${tier}`);
      }
    });
    renderPanel();
  }

  function isSingleSellerMode() {
    return !!document.querySelector(SELLER_BANNER_SELECTOR);
  }

  async function annotate(item) {
    if (item.dataset.tcgplus) return;
    item.dataset.tcgplus = 'pending';

    const link = item.querySelector('a.seller-info__name');
    const key = link && extractSellerKey(link.getAttribute('href'));
    if (!key) {
      item.dataset.tcgplus = 'no-key';
      return;
    }

    const info = await fetchSeller(key);
    if (!info) {
      // Transient fetch failure (the cache entry was evicted too).
      // Clear the marker so the next mutation-driven scan retries —
      // scans are the retry cadence, so a hard-down endpoint costs at
      // most one fetch per seller per scan pass.
      delete item.dataset.tcgplus;
      return;
    }

    item.dataset.tcgplusSellerKey = key;
    const stateCode = stateCodeFromInfo(info);
    const tier = classifyState(stateCode, homeState, nearbyStates);

    // In single-seller mode the "You are shopping from: <store>" banner already
    // surfaces the seller's location; per-tile badges are redundant noise.
    if (!isSingleSellerMode()) {
      const text = formatLocation(info);
      const row = document.createElement('div');
      row.className = 'tcgplus-loc-row';
      const badge = document.createElement('span');
      badge.className = `tcgplus-loc tcgplus-${tier}`;
      badge.textContent = text;
      row.appendChild(badge);
      const content = item.querySelector('.seller-info__content');
      (content || link.parentElement).appendChild(row);
    }
    item.classList.add(`tcgplus-row-${tier}`);
    item.dataset.tcgplusState = stateCode;
    item.dataset.tcgplusTier = tier;
    item.dataset.tcgplus = 'done';

    const chipped = await addPriceChipsWithMarket(item);
    if (chipped) {
      clearDegraded('market-price');
    } else {
      markDegraded('market-price', "Couldn't find this page's market price. Price-vs-market chips won't render.");
    }

    renderPanel();
  }

  function renderPanel() {
    // Drop a stale panel reference if the SPA replaced the body subtree
    // out from under us. A new panel will be created below if appropriate.
    if (panel && !document.body.contains(panel)) {
      panel = null;
    }

    // The panel only makes sense on pages that have per-seller listings to
    // summarise. On the TCGplayer homepage, search-grid view, /cart, /content
    // articles, etc. there are no `.listing-item` elements so the panel
    // would just show a row of zeroes (and any cart-fetch warning would lack
    // context). Tear it down if it's already up.
    if (!document.querySelector('.listing-item')) {
      if (panel) {
        panel.remove();
        panel = null;
      }
      return;
    }

    if (!panel) {
      panel = document.createElement('aside');
      panel.className = 'tcgplus-panel';
      panel.addEventListener('click', (e) => {
        const target = /** @type {Element | null} */ (e.target);
        if (!target) return;
        if (target.closest('.tcgplus-settings-toggle')) {
          chrome.runtime.sendMessage({ type: 'tcgplus.openOptionsPage' });
          return;
        }
        const row = /** @type {HTMLElement | null} */ (target.closest('.tcgplus-panel-row'));
        if (!row || row.classList.contains('tcgplus-panel-row-disabled')) return;
        const tier = row.dataset.tier;
        setActiveFilter(activeFilter === tier ? null : tier);
        applyFilter();
      });
      document.body.appendChild(panel);
    }
    const counts = computeStats();
    /** @type {Tier[]} */
    const tiers = ['home', 'nearby', 'other'];
    const rowsHtml = tiers
      .map((tier) => {
        const count = counts[tier];
        const isActive = activeFilter === tier;
        const disabled = count === 0 && !isActive ? ' tcgplus-panel-row-disabled' : '';
        const active = isActive ? ' tcgplus-panel-row-active' : '';
        const label = tierLabel(tier, homeState, STATE_NAMES);
        return `<div class="tcgplus-panel-row tcgplus-row-${tier}${disabled}${active}" data-tier="${tier}">${label}: <b>${count}</b></div>`;
      })
      .join('');
    const gear = `<button type="button" class="tcgplus-settings-toggle" aria-label="Open TCGPlus settings" title="Open TCGPlus settings">⚙</button>`;
    const warningsHtml =
      degradations.size > 0
        ? `<div class="tcgplus-panel-warnings">${[...degradations.values()].map((m) => `<div class="tcgplus-panel-warning">${m}</div>`).join('')}</div>`
        : '';
    const wantHtml = `<div class="tcgplus-panel-title">Vendor Locations${gear}</div>${warningsHtml}${rowsHtml}`;
    // Compare before set (same pattern as renderOosBanner): renderPanel
    // runs on every debounced scan, and an unconditional innerHTML write
    // rebuilds the panel DOM each time — churn, plus it kills in-panel
    // text selection while the user reads a warning. See #101.
    if (panel.innerHTML !== wantHtml) {
      panel.innerHTML = wantHtml;
    }
  }

  // Mount a banner above the search-grid tile list whenever the page
  // contains at least one tile carrying TCGplayer's out-of-stock badge.
  // The banner doubles as a toggle for the hide-OOS setting so a user
  // searching for a specific card can spot when tiles have been hidden
  // and put them back without leaving the page. Idempotent: re-runs from
  // the MutationObserver and from the storage listener; only writes when
  // the rendered text or button label needs to change.
  function renderOosBanner() {
    // Drop a stale reference if the SPA replaced the body subtree under us.
    if (oosBanner && !document.body.contains(oosBanner)) {
      oosBanner = null;
    }

    const grid = document.querySelector('.search-results');
    const oosCount = grid ? grid.querySelectorAll('.search-result:has(.mp-oos-badge)').length : 0;
    const description = grid ? describeOosBanner(oosCount, hideOOS) : null;

    // Nothing to surface: tear down any existing banner and bail.
    if (!description) {
      if (oosBanner) {
        oosBanner.remove();
        oosBanner = null;
      }
      return;
    }

    if (!oosBanner) {
      oosBanner = document.createElement('div');
      oosBanner.className = 'tcgplus-oos-banner';
      oosBanner.setAttribute('role', 'status');
      oosBanner.addEventListener('click', (e) => {
        const target = /** @type {Element | null} */ (e.target);
        if (!target || !target.closest('.tcgplus-oos-banner__toggle')) return;
        const next = oosBanner && oosBanner.dataset.nextHide === '1';
        // Persist; the storage listener flips local `hideOOS` and re-renders.
        saveSetting(STORAGE_KEYS.hideOOS, next);
      });
    }

    // Insert as previous sibling of `.search-results` so the banner appears
    // between TCGplayer's result-count toolbar and the tile grid. Only mount
    // if not already in place to avoid layout churn.
    if (grid && grid.parentNode && oosBanner.parentNode !== grid.parentNode) {
      grid.parentNode.insertBefore(oosBanner, grid);
    } else if (grid && oosBanner.nextSibling !== grid) {
      // The grid moved (Vue re-render); reposition.
      grid.parentNode.insertBefore(oosBanner, grid);
    }

    const wantHtml =
      `<span class="tcgplus-oos-banner__icon" aria-hidden="true">⊘</span>` +
      `<span class="tcgplus-oos-banner__text">${description.text}</span>` +
      `<button type="button" class="tcgplus-oos-banner__toggle">${description.button}</button>`;
    if (oosBanner.innerHTML !== wantHtml) {
      oosBanner.innerHTML = wantHtml;
    }
    const wantNext = description.nextHide ? '1' : '0';
    if (oosBanner.dataset.nextHide !== wantNext) {
      oosBanner.dataset.nextHide = wantNext;
    }
  }

  // -- Cart/checkout all-in vs market verdict ------------------------------
  // At a card show you'd pay the sum of the cards' market prices — no
  // shipping, no tax. The verdict compares that baseline to what the cart
  // actually costs (#113). Two anchor kinds (#136):
  //   - Checkout's Order Summary, found via its "Est. Tax" row →
  //     tax-inclusive all-in verdict.
  //   - Every .cart-summary box on /cart ("Taxes calculated at checkout",
  //     no tax row) → before-tax variant. TCGplayer keeps TWO of these
  //     boxes in the DOM (desktop sidebar + mobile layout), so the
  //     verdict upserts per-container rather than tracking one element.

  /**
   * Find an Order Summary ROW by its label and extract its amount.
   * Matched by label text rather than class names — the checkout DOM's
   * class names are unverified, and label text survives reorganisation
   * better.
   *
   * TCGplayer's real rows put the label in a bare TEXT NODE next to the
   * value span — `<div>Est. Tax <span>$3.20</span></div>` — so there is
   * no element whose text is only the label (#122). Match instead on
   * elements whose normalized text STARTS with the label; the length
   * and child caps are what keep this precise — a container holding
   * several rows ("Items 5 Items Total $29.81 Shipping…") blows past
   * both and can't shadow the row it contains.
   *
   * Amount: from the row's own text ("FREE" counts as $0), falling back
   * to the next sibling for flat layouts where a label-only element
   * matched (`<span>Est. Tax</span><span>$3.20</span>`).
   *
   * @param {RegExp} labelRe
   * @param {ParentNode} [scope]  container to search within; defaults to
   *   the whole document. Callers pass the Est. Tax row's parent so the
   *   left-column package box (which has its own "Item Total" and
   *   "Shipping FREE" rows) can't shadow the Order Summary's values.
   * @returns {{ row: Element, amount: number } | null}
   */
  function findOrderSummaryRow(labelRe, scope) {
    const candidates = (scope || document).querySelectorAll('div, span, p, dt, td, li, tr, h3, h4');
    for (const el of candidates) {
      const own = (el.textContent || '').trim().replace(/\s+/g, ' ');
      if (own.length > 40 || el.childElementCount > 3 || !labelRe.test(own)) continue;
      let amount = parseUsdAmount(own);
      if (amount == null && /\bfree\b/i.test(own)) amount = 0;
      if (amount == null) {
        const sib = el.nextElementSibling;
        const sibText = sib ? (sib.textContent || '').trim() : '';
        amount = parseUsdAmount(sibText);
        if (amount == null && /\bfree\b/i.test(sibText)) amount = 0;
      }
      if (amount != null) return { row: el, amount };
    }
    return null;
  }

  /**
   * @param {ReturnType<typeof computeCartVerdict>} verdict
   * @param {boolean} preTax
   */
  function buildVerdictHtml(verdict, preTax) {
    if (!verdict) return '';
    if (!verdict.coverageOk) {
      // Our own price×qty sum for the rows we could read disagrees with
      // the cart's own reported items total — some rows were missed or
      // their quantity mis-parsed (#149). Showing the breakdown anyway
      // would present an all-in number computed from an incomplete
      // cart, which reads as a real (and often wildly wrong) verdict.
      // Say so instead of guessing.
      return (
        `<div class="tcgplus-checkout-verdict__title">TCGPlus · vs market</div>` +
        `<div class="tcgplus-checkout-verdict__note">Couldn't total this cart reliably — some items' price or quantity didn't match the cart's own total. No verdict shown; try refreshing the page.</div>`
      );
    }
    const colors = chipColorForPct(verdict.pct);
    const itemsDelta = verdict.itemsTotal - verdict.marketValue;
    const taxRowHtml = preTax
      ? ''
      : `<div class="tcgplus-checkout-verdict__row"><span>+ Est. tax</span><span>$${verdict.tax.toFixed(2)}</span></div>`;
    const totalLabel = preTax ? 'All-in vs market (before tax)' : 'All-in vs market';
    const noteHtml =
      verdict.unresolvedCount > 0
        ? `<div class="tcgplus-checkout-verdict__note">${verdict.unresolvedCount} item${verdict.unresolvedCount === 1 ? '' : 's'} counted at listed price (no market data)</div>`
        : '';
    return (
      `<div class="tcgplus-checkout-verdict__title">TCGPlus · vs market</div>` +
      `<div class="tcgplus-checkout-verdict__row"><span>Market value (${verdict.unitCount} item${verdict.unitCount === 1 ? '' : 's'})</span><span>$${verdict.marketValue.toFixed(2)}</span></div>` +
      `<div class="tcgplus-checkout-verdict__row"><span>Items total</span><span>$${verdict.itemsTotal.toFixed(2)} (${formatAbsDiff(itemsDelta)})</span></div>` +
      `<div class="tcgplus-checkout-verdict__row"><span>+ Shipping</span><span>$${verdict.shipping.toFixed(2)}</span></div>` +
      taxRowHtml +
      `<div class="tcgplus-checkout-verdict__total"><span>${totalLabel}</span><span class="tcgplus-price-chip" style="background:${colors.bg};color:${colors.fg};" title="$${verdict.allIn.toFixed(2)} all-in vs $${verdict.marketValue.toFixed(2)} market">${formatAbsDiff(verdict.delta)} (${formatPctDiff(verdict.pct)})</span></div>` +
      noteHtml
    );
  }

  function renderCheckoutVerdict() {
    const rows = document.querySelectorAll('.package-item');
    /** @type {Array<{ price: number, qty: number, market: number | null }>} */
    const items = [];
    rows.forEach((rawEl) => {
      const el = /** @type {HTMLElement} */ (rawEl);
      const price = parseFloat(el.dataset.tcgplusUnitPrice || '');
      if (!Number.isFinite(price)) return;
      const qty = parseInt(el.dataset.tcgplusQty || '1', 10) || 1;
      const market = parseFloat(el.dataset.tcgplusCartMarket || '');
      items.push({ price, qty, market: Number.isFinite(market) ? market : null });
    });

    // Collect anchors. Each entry renders one verdict block inside
    // `container`, with amount lookups scoped to `scope`.
    /** @type {Array<{ container: Element, scope: Element, tax: number | null, preTax: boolean }>} */
    const anchors = [];

    // Checkout: the Order Summary, found via its Est. Tax row. Amount
    // lookups scope to that row's container so the left-column package
    // box (its own "Item Total" / "Shipping FREE" rows) can't shadow the
    // Order Summary's values (#122).
    const taxHit = findOrderSummaryRow(/^est\.?\s*tax\b/i);
    if (taxHit && taxHit.row.parentElement) {
      anchors.push({
        container: taxHit.row.parentElement,
        scope: taxHit.row.parentElement,
        tax: taxHit.amount,
        preTax: false,
      });
    }

    // Cart: every Cart Summary box. TCGplayer renders one for the desktop
    // sidebar and one for the mobile layout, both present in the DOM —
    // inject into each so the verdict shows at every breakpoint (#136).
    document.querySelectorAll('.cart-summary').forEach((box) => {
      const container = box.querySelector('.items-breakdown') || box;
      anchors.push({ container, scope: box, tax: null, preTax: true });
    });

    /** @type {Set<Element>} */
    const wanted = new Set();
    for (const anchor of anchors) {
      const itemsTotalHit = findOrderSummaryRow(/^items?\s*total\b/i, anchor.scope);
      const shippingHit = findOrderSummaryRow(/^(estimated\s+)?shipping\b/i, anchor.scope);
      // A cart box with no readable Item Total row isn't a summary we
      // can honestly extend — skip rather than render half-empty math.
      if (anchor.preTax && !itemsTotalHit) continue;
      const verdict = computeCartVerdict({
        items,
        itemsTotal: itemsTotalHit ? itemsTotalHit.amount : null,
        shipping: shippingHit ? shippingHit.amount : null,
        tax: anchor.tax,
      });
      if (!verdict) continue;
      let el = anchor.container.querySelector(':scope > .tcgplus-checkout-verdict');
      if (!el) {
        el = document.createElement('div');
        el.className = 'tcgplus-checkout-verdict';
        anchor.container.appendChild(el);
      }
      wanted.add(el);
      const wantHtml = buildVerdictHtml(verdict, anchor.preTax);
      if (el.innerHTML !== wantHtml) {
        el.innerHTML = wantHtml;
      }
    }

    // Tear down verdicts whose anchor no longer qualifies (SPA nav away,
    // cart emptied, summary re-rendered elsewhere).
    document.querySelectorAll('.tcgplus-checkout-verdict').forEach((el) => {
      if (!wanted.has(el)) el.remove();
    });
  }

  function scan() {
    document.querySelectorAll('.listing-item:not([data-tcgplus])').forEach((el) => {
      annotate(el);
    });
    // Grid tiles are chip targets only on search pages. The 2026 redesign
    // renders the product page's recommendations carousel with
    // .product-card__product markup too — chipping those tiles against
    // their own tile market is unrequested intel on a page whose focus
    // is the current product's listings (#117).
    if (/\/search\//.test(location.pathname)) {
      document.querySelectorAll('.product-card__product:not([data-tcgplus])').forEach((el) => {
        annotateProductCard(el);
      });
    }
    // Always process every .package-item, not just un-annotated ones.
    // TCGplayer's responsive cart layout strips our chip at narrow
    // breakpoints without removing the .package-item itself, so a row
    // can be marked `data-tcgplus="done"` but have no chip; the function
    // is idempotent and will re-render only when the chip is actually
    // missing.
    document.querySelectorAll('.package-item').forEach((el) => {
      annotateCartItem(/** @type {HTMLElement} */ (el));
    });
    enhanceShopBySellerBanner();
    backfillPriceChips();
    watchCartCount();
    renderCartBadge();
    // Re-render so the panel disappears on SPA navigation away from a
    // listings page (annotate() only triggers a re-render when adding new
    // listings; nothing else notices when listings are removed).
    renderPanel();
    renderOosBanner();
    renderCheckoutVerdict();
  }

  let scanTimer = null;
  const observer = new MutationObserver((mutations) => {
    if (scanTimer) return;
    const externalChange = mutations.some((m) => {
      const target = /** @type {Element | null} */ (m.target);
      if (target && target.closest && target.closest('.tcgplus-panel')) return false;
      const added = m.addedNodes;
      const removed = m.removedNodes;
      if (!added.length && !removed.length) return false;
      for (const n of added) if (!isOurNode(n)) return true;
      for (const n of removed) if (!isOurNode(n)) return true;
      return false;
    });
    if (!externalChange) return;
    scanTimer = setTimeout(() => {
      scanTimer = null;
      scan();
    }, 200);
  });

  // -- Storage change reaction --------------------------------------------
  // Apply settings updates from the options page (or other contexts) live.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    let needsReclassify = false;
    let needsHide = false;
    let needsHideOOS = false;
    let needsNearMint = false;
    if (changes[STORAGE_KEYS.homeState]) {
      const v = changes[STORAGE_KEYS.homeState].newValue;
      if (typeof v === 'string' && STATE_CODES.has(v) && v !== homeState) {
        homeState = v;
        if (nearbyStates.has(v)) nearbyStates.delete(v);
        needsReclassify = true;
      }
    }
    if (changes[STORAGE_KEYS.nearbyStates]) {
      const v = changes[STORAGE_KEYS.nearbyStates].newValue;
      if (Array.isArray(v)) {
        nearbyStates = new Set(v.filter((c) => typeof c === 'string' && STATE_CODES.has(c) && c !== homeState));
        needsReclassify = true;
      }
    }
    if (changes[STORAGE_KEYS.activeFilter]) {
      let v = changes[STORAGE_KEYS.activeFilter].newValue;
      if (v === 'ca') v = 'home';
      else if (v === 'west') v = 'nearby';
      activeFilter = typeof v === 'string' && VALID_TIERS.has(v) ? v : null;
      applyFilter();
      renderPanel();
    }
    for (const t of HIDE_TOGGLES) {
      if (changes[t.storageKey]) {
        hideState[t.id] = changes[t.storageKey].newValue === true;
        needsHide = true;
      }
    }
    if (changes[STORAGE_KEYS.forceNearMint]) {
      forceNearMint = changes[STORAGE_KEYS.forceNearMint].newValue === true;
      needsNearMint = true;
    }
    if (changes[STORAGE_KEYS.hideOOS]) {
      hideOOS = changes[STORAGE_KEYS.hideOOS].newValue === true;
      needsHideOOS = true;
    }
    if (needsHide) applyHideToggles();
    if (needsHideOOS) applyHideOOS();
    if (needsReclassify) reclassifyAll();
    if (needsNearMint) enforceNearMint();
  });

  // -- Bootstrap ----------------------------------------------------------
  await migrateFromLocalStorageIfNeeded();
  applySettings(await loadAllSettings());
  applyHideToggles();
  applyHideOOS();
  applyFilter();
  enforceNearMint();
  observer.observe(document.body, { childList: true, subtree: true });
  scan();
  refreshCart();

  // Readiness marker for the e2e suite (and anyone else who needs to know
  // the content script finished bootstrapping) — replaces the old
  // console.log so a healthy page load produces no console output.
  document.documentElement.dataset.tcgplusReady = '1';
})();
