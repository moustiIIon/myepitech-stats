"use strict";
// Clicking the toolbar icon opens (or focuses) the dashboard tab. No popup is
// set in the manifest, which is what makes action.onClicked fire at all.
chrome.action.onClicked.addListener(async () => {
    const url = chrome.runtime.getURL("stats.html");
    const [existing] = await chrome.tabs.query({ url });
    if (existing?.id != null) {
        await chrome.tabs.update(existing.id, { active: true });
        if (existing.windowId != null) {
            await chrome.windows.update(existing.windowId, { focused: true });
        }
    }
    else {
        await chrome.tabs.create({ url });
    }
});
