// Options page controller. Reads/writes chrome.storage.local via the shared
// helpers in storage.js. Pure helpers and constants come from lib.js (loaded
// ahead of this script in options/index.html).

(async () => {
  'use strict';

  const homeSelect = /** @type {HTMLSelectElement} */ (document.getElementById('home-state'));
  const nearbyGrid = /** @type {HTMLDivElement} */ (document.getElementById('nearby-grid'));
  const forceNearMintEl = /** @type {HTMLInputElement} */ (document.getElementById('force-near-mint'));
  const hideOOSEl = /** @type {HTMLInputElement} */ (document.getElementById('hide-oos'));
  const statusEl = /** @type {HTMLElement} */ (document.getElementById('status'));

  // -- State --------------------------------------------------------------
  let homeState = 'CA';
  let nearbyStates = new Set(DEFAULT_NEARBY);

  // -- Render -------------------------------------------------------------
  function renderHomeSelect() {
    homeSelect.innerHTML = STATES.map(
      ([code, name]) => `<option value="${code}"${code === homeState ? ' selected' : ''}>${name}</option>`
    ).join('');
  }

  function renderNearbyGrid() {
    nearbyGrid.innerHTML = STATES.map(([code, name]) => {
      const isHome = code === homeState;
      const checked = !isHome && nearbyStates.has(code);
      return (
        `<label class="state-cell${isHome ? ' state-cell--disabled' : ''}" title="${name}">` +
        `<input type="checkbox" data-nearby="${code}"${checked ? ' checked' : ''}${isHome ? ' disabled' : ''}>` +
        `<span>${code}</span>` +
        `</label>`
      );
    }).join('');
  }

  let statusTimer = 0;
  function flashStatus(text) {
    statusEl.textContent = text;
    statusEl.classList.add('status--visible');
    if (statusTimer) clearTimeout(statusTimer);
    statusTimer = window.setTimeout(() => {
      statusEl.classList.remove('status--visible');
    }, 1200);
  }

  // -- Version label ------------------------------------------------------
  const versionEl = document.getElementById('tcgplus-version');
  if (versionEl) {
    try {
      versionEl.textContent = chrome.runtime.getManifest().version;
    } catch (_) {
      versionEl.textContent = '?';
    }
  }

  // -- Load + bind --------------------------------------------------------
  await migrateFromLocalStorageIfNeeded();
  const stored = await loadAllSettings();

  const storedHome = stored[STORAGE_KEYS.homeState];
  if (typeof storedHome === 'string' && STATE_CODES.has(storedHome)) {
    homeState = storedHome;
  }
  const storedNearby = stored[STORAGE_KEYS.nearbyStates];
  if (Array.isArray(storedNearby)) {
    nearbyStates = new Set(storedNearby.filter((c) => typeof c === 'string' && STATE_CODES.has(c) && c !== homeState));
  }

  /** @type {Array<{ id: string; el: HTMLInputElement; key: string }>} */
  const hideToggleEls = Array.from(document.querySelectorAll('[data-toggle-id]')).map((el) => {
    const input = /** @type {HTMLInputElement} */ (el);
    const id = input.dataset.toggleId || '';
    /** @type {Record<string, string>} */
    const keyByToggle = {
      breakdown: STORAGE_KEYS.hideBreakdown,
      recommendations: STORAGE_KEYS.hideRecommendations,
      footer: STORAGE_KEYS.hideFooter,
    };
    const key = keyByToggle[id] || '';
    input.checked = stored[key] === true;
    return { id, el: input, key };
  });

  forceNearMintEl.checked = stored[STORAGE_KEYS.forceNearMint] === true;
  hideOOSEl.checked = stored[STORAGE_KEYS.hideOOS] === true;

  renderHomeSelect();
  renderNearbyGrid();

  // -- Event handlers -----------------------------------------------------
  homeSelect.addEventListener('change', async () => {
    const next = homeSelect.value;
    if (!STATE_CODES.has(next) || next === homeState) return;
    homeState = next;
    if (nearbyStates.has(next)) nearbyStates.delete(next);
    await saveSetting(STORAGE_KEYS.homeState, homeState);
    await saveSetting(STORAGE_KEYS.nearbyStates, [...nearbyStates]);
    renderNearbyGrid();
    flashStatus('Saved');
  });

  nearbyGrid.addEventListener('change', async (e) => {
    const target = /** @type {HTMLInputElement} */ (e.target);
    const code = target.dataset.nearby;
    if (!code || !STATE_CODES.has(code)) return;
    if (target.checked) nearbyStates.add(code);
    else nearbyStates.delete(code);
    await saveSetting(STORAGE_KEYS.nearbyStates, [...nearbyStates]);
    flashStatus('Saved');
  });

  for (const { el, key } of hideToggleEls) {
    el.addEventListener('change', async () => {
      await saveSetting(key, el.checked);
      flashStatus('Saved');
    });
  }

  forceNearMintEl.addEventListener('change', async () => {
    await saveSetting(STORAGE_KEYS.forceNearMint, forceNearMintEl.checked);
    flashStatus('Saved');
  });

  hideOOSEl.addEventListener('change', async () => {
    await saveSetting(STORAGE_KEYS.hideOOS, hideOOSEl.checked);
    flashStatus('Saved');
  });
})();
