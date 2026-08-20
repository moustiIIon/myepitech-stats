// `browser` (Mozilla's webextension-polyfill) is a global here, not
// imported — see browser-global.d.ts. Chrome's MV3 service worker only
// accepts a single script file, so the polyfill can't be a second entry in
// "background.scripts" the way it is for the content script; instead it's
// loaded via importScripts(), which only exists in a real worker context.
// Firefox's manifest instead lists browser-polyfill.js directly ahead of
// this file in "background.scripts" (a classic, non-worker background
// page), where importScripts doesn't exist — hence the guard.
if (typeof importScripts === "function") {
  importScripts("browser-polyfill.js");
}

// Clicking the toolbar icon opens (or focuses) the dashboard tab. No popup is
// set in the manifest, which is what makes action.onClicked fire at all.
browser.action.onClicked.addListener(async () => {
  const url = browser.runtime.getURL("stats.html");
  const [existing] = await browser.tabs.query({ url });
  if (existing?.id != null) {
    await browser.tabs.update(existing.id, { active: true });
    if (existing.windowId != null) {
      await browser.windows.update(existing.windowId, { focused: true });
    }
  } else {
    await browser.tabs.create({ url });
  }
});
