(() => {
  'use strict';

  const SELLER_API = 'https://seller-stores-backend.tcgplayer.com/sm/seller/';

  const STATES = [
    ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'],
    ['CA', 'California'], ['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'],
    ['DC', 'District of Columbia'], ['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'],
    ['ID', 'Idaho'], ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'],
    ['KS', 'Kansas'], ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'],
    ['MD', 'Maryland'], ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'],
    ['MS', 'Mississippi'], ['MO', 'Missouri'], ['MT', 'Montana'], ['NE', 'Nebraska'],
    ['NV', 'Nevada'], ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'],
    ['NY', 'New York'], ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'],
    ['OK', 'Oklahoma'], ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'],
    ['SC', 'South Carolina'], ['SD', 'South Dakota'], ['TN', 'Tennessee'], ['TX', 'Texas'],
    ['UT', 'Utah'], ['VT', 'Vermont'], ['VA', 'Virginia'], ['WA', 'Washington'],
    ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming'],
  ];
  const STATE_NAMES = Object.fromEntries(STATES);
  const STATE_CODES = new Set(STATES.map(([c]) => c));

  const HOME_STATE_KEY = 'tcgplus.homeState';
  const NEARBY_STATES_KEY = 'tcgplus.nearbyStates';
  const ACTIVE_FILTER_KEY = 'tcgplus.activeFilter';
  const DEFAULT_NEARBY = ['OR', 'WA', 'NV', 'AZ', 'ID', 'UT', 'MT', 'WY', 'CO', 'NM', 'AK', 'HI'];
  const VALID_TIERS = new Set(['home', 'nearby', 'other']);

  let homeState = 'CA';
  let nearbyStates = new Set(DEFAULT_NEARBY);
  let activeFilter = null;
  try {
    const h = localStorage.getItem(HOME_STATE_KEY);
    if (h && STATE_CODES.has(h)) homeState = h;
    const n = localStorage.getItem(NEARBY_STATES_KEY);
    if (n) {
      const arr = JSON.parse(n);
      if (Array.isArray(arr)) nearbyStates = new Set(arr.filter((c) => STATE_CODES.has(c) && c !== homeState));
    }
    let f = localStorage.getItem(ACTIVE_FILTER_KEY);
    if (f === 'ca') f = 'home';
    else if (f === 'west') f = 'nearby';
    if (VALID_TIERS.has(f)) activeFilter = f;
  } catch (_) {}

  const sellerCache = new Map();

  function fetchSeller(sellerKey) {
    if (sellerCache.has(sellerKey)) return sellerCache.get(sellerKey);
    const p = fetch(SELLER_API + encodeURIComponent(sellerKey), { credentials: 'omit' })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    sellerCache.set(sellerKey, p);
    return p;
  }

  function extractKey(href) {
    if (!href) return null;
    const m = href.match(/\/sellers\/[^/]+\/([a-z0-9]+)/i);
    return m ? m[1] : null;
  }

  function classifyState(stateCode) {
    if (!stateCode) return 'intl';
    if (stateCode === homeState) return 'home';
    if (nearbyStates.has(stateCode)) return 'nearby';
    return 'other';
  }

  function stateCodeFromInfo(info) {
    return info.addressCountryCode === 'US' ? (info.addressTerritory || '') : '';
  }

  function formatLocation(info) {
    const city = info.addressCity || '';
    const state = info.addressTerritory || '';
    const country = info.addressCountryCode || '';
    if (country === 'US' && state) return city ? `${city}, ${state}` : state;
    return info.location || country || 'Unknown';
  }

  function setActiveFilter(value) {
    activeFilter = value;
    try {
      if (value) localStorage.setItem(ACTIVE_FILTER_KEY, value);
      else localStorage.removeItem(ACTIVE_FILTER_KEY);
    } catch (_) {}
  }

  function setHomeState(code) {
    if (!STATE_CODES.has(code) || code === homeState) return;
    homeState = code;
    if (nearbyStates.has(code)) nearbyStates.delete(code);
    persistSettings();
    reclassifyAll();
  }

  function setNearbyState(code, on) {
    if (!STATE_CODES.has(code) || code === homeState) return;
    if (on) nearbyStates.add(code);
    else nearbyStates.delete(code);
    persistSettings();
    reclassifyAll();
  }

  function persistSettings() {
    try {
      localStorage.setItem(HOME_STATE_KEY, homeState);
      localStorage.setItem(NEARBY_STATES_KEY, JSON.stringify([...nearbyStates]));
    } catch (_) {}
  }

  const HIDE_TOGGLES = [
    { id: 'breakdown', label: 'breakdown', storageKey: 'tcgplus.hideBreakdown', bodyClass: 'tcgplus-hide-breakdown' },
    { id: 'recommendations', label: 'recommendations', storageKey: 'tcgplus.hideRecommendations', bodyClass: 'tcgplus-hide-recommendations' },
    { id: 'footer', label: 'footer', storageKey: 'tcgplus.hideFooter', bodyClass: 'tcgplus-hide-footer' },
  ];
  const hideState = {};
  for (const t of HIDE_TOGGLES) {
    try {
      hideState[t.id] = localStorage.getItem(t.storageKey) === '1';
    } catch (_) {
      hideState[t.id] = false;
    }
  }

  function applyHideToggles() {
    const cl = document.documentElement.classList;
    for (const t of HIDE_TOGGLES) cl.toggle(t.bodyClass, !!hideState[t.id]);
  }
  applyHideToggles();

  let panel;
  let settingsOpen = false;

  function computeStats() {
    const counts = { home: 0, nearby: 0, other: 0 };
    document.querySelectorAll('.listing-item[data-tcgplus-tier]').forEach((el) => {
      const t = el.dataset.tcgplusTier;
      if (t in counts) counts[t]++;
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
  applyFilter();

  function reclassifyAll() {
    document.querySelectorAll('.listing-item[data-tcgplus="done"]').forEach((el) => {
      const stateCode = el.dataset.tcgplusState || '';
      const tier = classifyState(stateCode);
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

  async function annotate(item) {
    if (item.dataset.tcgplus) return;
    item.dataset.tcgplus = 'pending';

    const link = item.querySelector('a.seller-info__name');
    const key = link && extractKey(link.getAttribute('href'));
    if (!key) {
      item.dataset.tcgplus = 'no-key';
      return;
    }

    const info = await fetchSeller(key);
    if (!info) {
      item.dataset.tcgplus = 'error';
      return;
    }

    const stateCode = stateCodeFromInfo(info);
    const tier = classifyState(stateCode);
    const text = formatLocation(info);

    const row = document.createElement('div');
    row.className = 'tcgplus-loc-row';

    const badge = document.createElement('span');
    badge.className = `tcgplus-loc tcgplus-${tier}`;
    badge.textContent = text;

    row.appendChild(badge);

    const content = item.querySelector('.seller-info__content');
    (content || link.parentElement).appendChild(row);
    item.classList.add(`tcgplus-row-${tier}`);
    item.dataset.tcgplusState = stateCode;
    item.dataset.tcgplusTier = tier;
    item.dataset.tcgplus = 'done';

    renderPanel();
  }

  function tierLabel(tier) {
    if (tier === 'home') return STATE_NAMES[homeState] || homeState;
    if (tier === 'nearby') return 'Nearby';
    return 'Other US';
  }

  function buildSettingsHtml() {
    const homeOptions = STATES.map(([c, n]) =>
      `<option value="${c}"${c === homeState ? ' selected' : ''}>${n}</option>`
    ).join('');
    const nearbyBoxes = STATES.map(([c, n]) => {
      const isHome = c === homeState;
      const checked = !isHome && nearbyStates.has(c);
      return `<label class="tcgplus-state-cell${isHome ? ' tcgplus-state-cell-disabled' : ''}" title="${n}">` +
        `<input type="checkbox" data-nearby="${c}"${checked ? ' checked' : ''}${isHome ? ' disabled' : ''}>${c}</label>`;
    }).join('');
    const hidesHtml = HIDE_TOGGLES.map((t) =>
      `<label class="tcgplus-panel-toggle-item"><input type="checkbox" data-toggle-id="${t.id}"${hideState[t.id] ? ' checked' : ''}>${t.label}</label>`
    ).join('');
    return `
      <div class="tcgplus-settings">
        <div class="tcgplus-settings-field">
          <label class="tcgplus-settings-label" for="tcgplus-home-select">Home state</label>
          <select id="tcgplus-home-select" class="tcgplus-settings-select">${homeOptions}</select>
        </div>
        <div class="tcgplus-settings-field">
          <div class="tcgplus-settings-label">Nearby states</div>
          <div class="tcgplus-state-grid">${nearbyBoxes}</div>
        </div>
        <div class="tcgplus-settings-field">
          <div class="tcgplus-settings-label">Hide on page</div>
          <div class="tcgplus-panel-toggles">${hidesHtml}</div>
        </div>
      </div>
    `;
  }

  function renderPanel() {
    if (!panel) {
      panel = document.createElement('aside');
      panel.className = 'tcgplus-panel';
      panel.addEventListener('click', (e) => {
        if (e.target.closest('.tcgplus-settings')) return;
        if (e.target.closest('.tcgplus-settings-toggle')) {
          settingsOpen = !settingsOpen;
          renderPanel();
          return;
        }
        const row = e.target.closest('.tcgplus-panel-row');
        if (!row || row.classList.contains('tcgplus-panel-row-disabled')) return;
        const tier = row.dataset.tier;
        setActiveFilter(activeFilter === tier ? null : tier);
        applyFilter();
      });
      panel.addEventListener('change', (e) => {
        const t = e.target;
        if (t.id === 'tcgplus-home-select') {
          setHomeState(t.value);
          renderPanel();
          return;
        }
        if (t.dataset.nearby) {
          setNearbyState(t.dataset.nearby, t.checked);
          return;
        }
        const toggleId = t.dataset.toggleId;
        if (toggleId) {
          const cfg = HIDE_TOGGLES.find((x) => x.id === toggleId);
          if (!cfg) return;
          hideState[toggleId] = t.checked;
          try {
            localStorage.setItem(cfg.storageKey, t.checked ? '1' : '0');
          } catch (_) {}
          applyHideToggles();
        }
      });
      document.body.appendChild(panel);
    }
    const counts = computeStats();
    const tiers = ['home', 'nearby', 'other'];
    const rowsHtml = tiers.map((tier) => {
      const count = counts[tier];
      const isActive = activeFilter === tier;
      const disabled = count === 0 && !isActive ? ' tcgplus-panel-row-disabled' : '';
      const active = isActive ? ' tcgplus-panel-row-active' : '';
      const label = tierLabel(tier);
      return `<div class="tcgplus-panel-row tcgplus-row-${tier}${disabled}${active}" data-tier="${tier}">${label}: <b>${count}</b></div>`;
    }).join('');
    const gear = `<button type="button" class="tcgplus-settings-toggle" aria-label="Settings" aria-expanded="${settingsOpen}">⚙</button>`;
    const settingsHtml = settingsOpen ? buildSettingsHtml() : '';
    panel.innerHTML = `<div class="tcgplus-panel-title">Vendor Locations${gear}</div>${rowsHtml}${settingsHtml}`;
  }

  function scan() {
    document.querySelectorAll('.listing-item:not([data-tcgplus])').forEach((el) => {
      annotate(el);
    });
    renderPanel();
  }

  let scanTimer = null;
  const observer = new MutationObserver(() => {
    if (scanTimer) return;
    scanTimer = setTimeout(() => {
      scanTimer = null;
      scan();
    }, 200);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  scan();
  console.log('[TCG+] vendor location extension loaded');
})();
