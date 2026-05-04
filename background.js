// Background service worker. Content scripts can't call
// chrome.runtime.openOptionsPage directly, so the panel's gear button posts
// a message that this worker handles.

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === 'tcgplus.openOptionsPage') {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
  }
});
