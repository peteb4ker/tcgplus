(async () => {
  'use strict';

  const SELLER_API = 'https://seller-stores-backend.tcgplayer.com/sm/seller/';

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
  /** @type {Promise<void> | null} */
  let cartFetchPromise = null;
  const CART_SUMMARY_URL = (key) => `https://mpgateway.tcgplayer.com/v1/cart/${key}/summary?mpfev=5106`;

  // -- Seller cache -------------------------------------------------------
  /** @type {Map<string, Promise<SellerInfo | null>>} */
  const sellerCache = new Map();
  function fetchSeller(sellerKey) {
    const cached = sellerCache.get(sellerKey);
    if (cached) return cached;
    const p = fetch(SELLER_API + encodeURIComponent(sellerKey), { credentials: 'omit' })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    sellerCache.set(sellerKey, p);
    return p;
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

  async function refreshCart() {
    const key = getCartKey();
    if (!key) {
      cartSubtotal = 0;
      cartSellerSubtotal.clear();
      renderCartBadge();
      return;
    }
    if (cartFetchPromise) return cartFetchPromise;
    cartFetchPromise = (async () => {
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
      cartFetchPromise = null;
    })();
    return cartFetchPromise;
  }

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
    return el ? parsePrice(el.textContent) : null;
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
   * three sibling chips) and the grid-view tile renderer (where it's the
   * only chip).
   */
  function buildDeltaChipHtml(price, market) {
    const diff = price - market;
    const pct = (diff / market) * 100;
    const colors = chipColorForPct(pct);
    return `<span class="tcgplus-price-chip" style="background:${colors.bg};color:${colors.fg};" title="vs market $${market.toFixed(2)}">${formatAbsDiff(diff)} (${formatPctDiff(pct)})</span>`;
  }

  function findListingCondition(item) {
    const el = item.querySelector('.listing-item__listing-data__info__condition');
    return el ? (el.textContent || '').trim() : null;
  }

  function addPriceChips(item, market) {
    if (item.dataset.tcgplusChips === '1') return;
    const priceEl = findListingPriceEl(item);
    if (!priceEl) return;
    const price = parsePrice(priceEl.textContent);
    if (!price) return;

    // The headline market price is for a single condition (Near Mint by
    // default, or whatever the URL's Condition= param selects). A
    // search-list-view tile can show listings of *other* conditions in
    // the same `.search-result`. Chipping a Lightly Played listing
    // against the Near Mint market is misleading (#69) — skip the
    // price-vs-market and DEAL chips for mismatched conditions but
    // keep the shipping chip, which doesn't depend on market.
    const listingCondition = findListingCondition(item);
    const headlineConditions = getUrlConditions(location.href);
    const conditionMatches = listingMatchesHeadlineCondition(listingCondition, headlineConditions);

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
      const market = findMarketPrice(el);
      if (market) addPriceChips(el, market);
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
    wrap.innerHTML = buildDeltaChipHtml(price, market);
    priceEl.appendChild(wrap);
    card.dataset.tcgplusChips = '1';
  }

  // -- Shop-by-seller banner ---------------------------------------------
  // When the search page is filtered to a single seller, TCGplayer renders a
  // banner with the store name. Surface the seller's location once in that
  // banner so the per-tile suppression doesn't lose information.

  async function enhanceShopBySellerBanner() {
    const banner = /** @type {HTMLElement | null} */ (document.querySelector('.shop-by-seller-message'));
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
      banner.dataset.tcgplus = 'error';
      return;
    }
    const stateCode = stateCodeFromInfo(info);
    const tier = classifyState(stateCode, homeState, nearbyStates);
    const text = formatLocation(info);
    const span = banner.querySelector('span') || banner;
    if (!span.querySelector('.tcgplus-loc')) {
      const badge = document.createElement('span');
      badge.className = `tcgplus-loc tcgplus-${tier}`;
      badge.style.marginLeft = '8px';
      badge.textContent = text;
      const strong = span.querySelector('strong');
      if (strong && strong.parentNode === span) {
        strong.insertAdjacentElement('afterend', badge);
      } else {
        span.appendChild(badge);
      }
    }
    banner.dataset.tcgplus = 'done';
  }

  // -- Panel --------------------------------------------------------------
  let panel;

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
    return !!document.querySelector('.shop-by-seller-message');
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
      item.dataset.tcgplus = 'error';
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

    const market = findMarketPrice(item);
    if (market) {
      clearDegraded('market-price');
      addPriceChips(item, market);
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
    panel.innerHTML = `<div class="tcgplus-panel-title">Vendor Locations${gear}</div>${warningsHtml}${rowsHtml}`;
  }

  function scan() {
    document.querySelectorAll('.listing-item:not([data-tcgplus])').forEach((el) => {
      annotate(el);
    });
    document.querySelectorAll('.product-card__product:not([data-tcgplus])').forEach((el) => {
      annotateProductCard(el);
    });
    enhanceShopBySellerBanner();
    backfillPriceChips();
    watchCartCount();
    renderCartBadge();
    // Re-render so the panel disappears on SPA navigation away from a
    // listings page (annotate() only triggers a re-render when adding new
    // listings; nothing else notices when listings are removed).
    renderPanel();
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

  console.log('[TCG+] vendor location extension loaded');
})();
