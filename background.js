// Background service worker. Two entry points open the options page:
// - The toolbar action icon (chrome.action.onClicked).
// - A message from the content script (panel gear button).
// Content scripts can't call chrome.runtime.openOptionsPage themselves, so
// they post a message and we forward it here.

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === 'tcgplus.openOptionsPage') {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
  }
});
