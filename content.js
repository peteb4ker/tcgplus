(() => {
  'use strict';

  const SELLER_API = 'https://seller-stores-backend.tcgplayer.com/sm/seller/';
  const WESTERN = new Set(['CA', 'OR', 'WA', 'NV', 'AZ', 'ID', 'UT', 'MT', 'WY', 'CO', 'NM', 'AK', 'HI']);

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

  function classify(info) {
    const country = info.addressCountryCode || '';
    const state = info.addressTerritory || '';
    if (country !== 'US') return 'intl';
    if (state === 'CA') return 'ca';
    if (WESTERN.has(state)) return 'west';
    return 'other';
  }

  function formatLocation(info) {
    const city = info.addressCity || '';
    const state = info.addressTerritory || '';
    const country = info.addressCountryCode || '';
    if (country === 'US' && state) return city ? `${city}, ${state}` : state;
    return info.location || country || 'Unknown';
  }

  let panel;
  const ACTIVE_FILTER_KEY = 'tcgplus.activeFilter';
  let activeFilter = null;
  try {
    const saved = localStorage.getItem(ACTIVE_FILTER_KEY);
    if (saved === 'ca' || saved === 'west' || saved === 'other') activeFilter = saved;
  } catch (_) {}

  function setActiveFilter(value) {
    activeFilter = value;
    try {
      if (value) localStorage.setItem(ACTIVE_FILTER_KEY, value);
      else localStorage.removeItem(ACTIVE_FILTER_KEY);
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

  function computeStats() {
    const counts = { ca: 0, west: 0, other: 0 };
    document.querySelectorAll('.listing-item[data-tcgplus-tier]').forEach((el) => {
      const t = el.dataset.tcgplusTier;
      if (t in counts) counts[t]++;
    });
    return counts;
  }

  function applyFilter() {
    const root = document.documentElement;
    root.classList.remove('tcgplus-filter-ca', 'tcgplus-filter-west', 'tcgplus-filter-other');
    if (activeFilter) root.classList.add(`tcgplus-filter-${activeFilter}`);
    document.querySelectorAll('.listing-item').forEach((el) => {
      el.style.removeProperty('display');
    });
    if (panel) {
      panel.querySelectorAll('.tcgplus-panel-row').forEach((r) => {
        r.classList.toggle('tcgplus-panel-row-active', r.dataset.tier === activeFilter);
      });
    }
  }
  applyFilter();

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

    const tier = classify(info);
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
    item.dataset.tcgplusTier = tier;
    item.dataset.tcgplus = 'done';

    renderPanel();
  }

  const TIER_LABELS = [
    ['ca', 'California'],
    ['west', 'Other West'],
    ['other', 'Other US'],
  ];

  function renderPanel() {
    if (!panel) {
      panel = document.createElement('aside');
      panel.className = 'tcgplus-panel';
      panel.addEventListener('click', (e) => {
        if (e.target.closest('.tcgplus-panel-toggles')) return;
        const row = e.target.closest('.tcgplus-panel-row');
        if (!row || row.classList.contains('tcgplus-panel-row-disabled')) return;
        const tier = row.dataset.tier;
        setActiveFilter(activeFilter === tier ? null : tier);
        applyFilter();
      });
      panel.addEventListener('change', (e) => {
        const toggleId = e.target.dataset.toggleId;
        if (!toggleId) return;
        const t = HIDE_TOGGLES.find((x) => x.id === toggleId);
        if (!t) return;
        hideState[toggleId] = e.target.checked;
        try {
          localStorage.setItem(t.storageKey, e.target.checked ? '1' : '0');
        } catch (_) {}
        applyHideToggles();
      });
      document.body.appendChild(panel);
    }
    const counts = computeStats();
    const rowsHtml = TIER_LABELS.map(([tier, label]) => {
      const count = counts[tier];
      const isActive = activeFilter === tier;
      const disabled = count === 0 && !isActive ? ' tcgplus-panel-row-disabled' : '';
      const active = isActive ? ' tcgplus-panel-row-active' : '';
      return `<div class="tcgplus-panel-row tcgplus-row-${tier}${disabled}${active}" data-tier="${tier}">${label}: <b>${count}</b></div>`;
    }).join('');
    const togglesHtml = HIDE_TOGGLES.map((t) =>
      `<label class="tcgplus-panel-toggle-item"><input type="checkbox" data-toggle-id="${t.id}"${hideState[t.id] ? ' checked' : ''}>${t.label}</label>`
    ).join('');
    const togglesGroup = `<div class="tcgplus-panel-toggles"><span class="tcgplus-panel-toggles-label">Hide:</span>${togglesHtml}</div>`;
    panel.innerHTML = `<div class="tcgplus-panel-title">Vendor Locations</div>${rowsHtml}${togglesGroup}`;
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
