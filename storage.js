// Shared storage layer used by content.js (in the TCGplayer page context) and
// options/options.js (in the extension's options page). Both contexts share
// chrome.storage.local. Loaded as a content script ahead of content.js, and
// imported as a regular script by the options page.
//
// All storage keys live in the `tcgplus.*` namespace and are listed below as
// the single source of truth.

const STORAGE_KEYS = {
  homeState: 'tcgplus.homeState',
  nearbyStates: 'tcgplus.nearbyStates',
  activeFilter: 'tcgplus.activeFilter',
  hideBreakdown: 'tcgplus.hideBreakdown',
  hideRecommendations: 'tcgplus.hideRecommendations',
  hideFooter: 'tcgplus.hideFooter',
  forceNearMint: 'tcgplus.forceNearMint',
  hideOOS: 'tcgplus.hideOOS',
  migrated: 'tcgplus.migratedFromLocalStorage',
};
const ALL_STORAGE_KEYS = Object.values(STORAGE_KEYS);

/**
 * Read all TCGPlus settings from chrome.storage.local. Returns an object
 * keyed by the values in STORAGE_KEYS, with undefined entries for keys that
 * have never been set.
 *
 * @returns {Promise<Record<string, unknown>>}
 */
function loadAllSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(ALL_STORAGE_KEYS, (items) => resolve(items || {}));
  });
}

/**
 * Persist a single setting. The value is stored as-is; pass strings, numbers,
 * booleans, or JSON-serialisable objects.
 *
 * @param {string} key  one of the STORAGE_KEYS values
 * @param {unknown} value
 * @returns {Promise<void>}
 */
function saveSetting(key, value) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, () => resolve());
  });
}

/**
 * Remove a single setting.
 *
 * @param {string} key
 * @returns {Promise<void>}
 */
function removeSetting(key) {
  return new Promise((resolve) => {
    chrome.storage.local.remove(key, () => resolve());
  });
}

/**
 * One-time migration: if chrome.storage.local has never been populated for
 * this user but the page's localStorage holds tcgplus.* keys (from before we
 * moved to chrome.storage), copy those values across so the user doesn't
 * lose their settings.
 *
 * Sets STORAGE_KEYS.migrated to true to make the migration idempotent.
 *
 * @returns {Promise<void>}
 */
async function migrateFromLocalStorageIfNeeded() {
  const stored = await loadAllSettings();
  if (stored[STORAGE_KEYS.migrated]) return;
  if (typeof localStorage === 'undefined') {
    await saveSetting(STORAGE_KEYS.migrated, true);
    return;
  }
  /** @type {Record<string, unknown>} */
  const updates = {};
  for (const key of ALL_STORAGE_KEYS) {
    if (key === STORAGE_KEYS.migrated) continue;
    if (stored[key] !== undefined) continue;
    let raw;
    try {
      raw = localStorage.getItem(key);
    } catch (_) {
      continue;
    }
    if (raw == null) continue;
    if (key === STORAGE_KEYS.nearbyStates) {
      try {
        updates[key] = JSON.parse(raw);
      } catch (_) {
        continue;
      }
    } else if (
      key === STORAGE_KEYS.hideBreakdown ||
      key === STORAGE_KEYS.hideRecommendations ||
      key === STORAGE_KEYS.hideFooter ||
      key === STORAGE_KEYS.forceNearMint ||
      key === STORAGE_KEYS.hideOOS
    ) {
      updates[key] = raw === '1';
    } else {
      updates[key] = raw;
    }
  }
  updates[STORAGE_KEYS.migrated] = true;
  await new Promise((resolve) => {
    chrome.storage.local.set(updates, () => resolve(undefined));
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    STORAGE_KEYS,
    ALL_STORAGE_KEYS,
    loadAllSettings,
    saveSetting,
    removeSetting,
    migrateFromLocalStorageIfNeeded,
  };
}
