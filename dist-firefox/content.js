"use strict";
(() => {
    const STORAGE_KEY = "projects";
    const ICON_TO_FIELD = {
        "tabler-icon-calendar": "startDate",
        "tabler-icon-clock": "endDate",
        "tabler-icon-flag": "deadlineDate",
    };
    function parseDate(text) {
        if (!text)
            return null;
        const match = text.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (!match)
            return null;
        const [, d, m, y] = match;
        const time = new Date(Number(y), Number(m) - 1, Number(d)).getTime();
        return Number.isNaN(time) ? null : time;
    }
    function extractProject(card) {
        const href = card.getAttribute("href") || "";
        const match = href.match(/\/units\/(\d+)\/([^/]+)\/([^/]+)\/projects\/(\d+)/);
        if (!match)
            return null;
        const [, year, unitCode, campusGroup, id] = match;
        const texts = Array.from(card.querySelectorAll("p.mantine-Text-root")).map((p) => (p.textContent || "").trim());
        const [title, subtitleRaw] = texts;
        if (!title)
            return null;
        const subtitle = (subtitleRaw || "").replace(/^[^-]+-\s*/, "").trim();
        const status = card.querySelector(".mantine-Badge-label")?.textContent?.trim() || "";
        const dates = {};
        for (const [iconClass, field] of Object.entries(ICON_TO_FIELD)) {
            const icon = card.querySelector(`svg.${iconClass}`);
            const dateText = icon?.nextElementSibling?.textContent;
            const parsed = parseDate(dateText);
            if (parsed != null)
                dates[field] = parsed;
        }
        if (dates.startDate == null)
            return null;
        return {
            id,
            year,
            unitCode,
            campusGroup,
            href,
            title,
            module: subtitle || subtitleRaw || "",
            status,
            startDate: dates.startDate,
            endDate: dates.endDate,
            deadlineDate: dates.deadlineDate,
        };
    }
    async function scanProjects() {
        const cards = document.querySelectorAll('a.mantine-Card-root[href*="/projects/"]');
        if (!cards.length)
            return;
        const records = [];
        for (const card of Array.from(cards)) {
            const record = extractProject(card);
            if (record)
                records.push(record);
        }
        if (!records.length)
            return;
        const data = (await browser.storage.local.get(STORAGE_KEY));
        const projects = data.projects || {};
        const now = Date.now();
        for (const record of records) {
            const existing = projects[record.id];
            projects[record.id] = {
                ...record,
                firstSeenAt: existing?.firstSeenAt ?? now,
                lastSeenAt: now,
            };
        }
        await browser.storage.local.set({ [STORAGE_KEY]: projects });
    }
    // --- Sidebar "Timeline" entry + in-page overlay -------------------------
    //
    // Mantine's class names are per-build hashes, so instead of hardcoding
    // them we clone a REAL sidebar link at runtime (matched by its visible
    // text) and only swap its label/icon. That makes the injected item pick
    // up the site's actual current styling automatically, including through
    // future redesigns, as long as the sidebar still has a link with one of
    // the reference labels below.
    const NAV_ITEM_ID = "meps-nav-timeline";
    const OVERLAY_ID = "meps-overlay";
    // Ordered by preferred insertion point (right after "Projects" if it's
    // there at all), independent of which one we end up cloning styles from.
    const REFERENCE_LABELS = ["Projects", "Planning", "Units", "E-learning", "Dashboard"];
    function findLinkByLabel(label) {
        const all = Array.from(document.querySelectorAll("a, button"));
        return all.find((el) => el.textContent?.trim() === label) || null;
    }
    // This sidebar has no data-active/aria-current attribute at all — the
    // active link just gets inline `opacity: 1; font-weight: 600; color:
    // white` instead of the inactive `opacity: 0.72; font-weight: 450; color:
    // black`, and the green "pill" behind it is a SEPARATE absolutely
    // positioned decorative <div> (driven by React state we have no access
    // to), not part of the link itself. So cloning the active link always
    // gives white text with no way to reproduce the background behind it —
    // we must clone an inactive sibling instead, detected via that opacity.
    function isActiveLink(el) {
        if (el.getAttribute("aria-current") != null)
            return true;
        if (el.getAttribute("data-active") === "true" || el.matches("[data-active]"))
            return true;
        return parseFloat(el.style.opacity || "1") >= 0.95;
    }
    // Matches the tabler-icon-clock-hour-4 glyph used by my.epitech.eu's own
    // "Upcoming projects" heading — reused here so "Timeline" doesn't inherit
    // whichever icon happened to belong to the cloned link.
    const TIMELINE_ICON_PATHS = [
        "M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0",
        "M12 12l3 2",
        "M12 7v5",
    ];
    function applyTimelineIcon(item) {
        const svg = item.querySelector("svg");
        if (!svg)
            return;
        svg.setAttribute("class", svg.getAttribute("class")?.replace(/tabler-icon-[\w-]+/, "tabler-icon-clock-hour-4") ??
            "tabler-icon tabler-icon-clock-hour-4");
        svg.innerHTML = TIMELINE_ICON_PATHS.map((d) => `<path d="${d}"></path>`).join("");
    }
    function labelNodeOf(root, label) {
        return (Array.from(root.querySelectorAll("*")).find((n) => n.children.length === 0 && n.textContent?.trim() === label) || root);
    }
    function ensureOverlay() {
        const existing = document.getElementById(OVERLAY_ID);
        if (existing)
            return existing;
        const overlay = document.createElement("div");
        overlay.id = OVERLAY_ID;
        overlay.style.cssText =
            "position:fixed;inset:0;z-index:2147483000;display:none;" +
                "background:rgba(11,11,11,0.45);";
        const panel = document.createElement("div");
        panel.style.cssText =
            "position:absolute;inset:28px;background:#fcfcfb;border-radius:12px;" +
                "overflow:hidden;display:flex;flex-direction:column;" +
                "box-shadow:0 24px 64px rgba(0,0,0,0.35);";
        const closeBtn = document.createElement("button");
        closeBtn.type = "button";
        closeBtn.setAttribute("aria-label", "Close timeline");
        closeBtn.textContent = "×";
        closeBtn.style.cssText =
            "position:absolute;top:10px;right:14px;z-index:1;width:32px;height:32px;" +
                "border-radius:8px;border:none;background:rgba(11,11,11,0.06);" +
                "font-size:20px;line-height:1;cursor:pointer;color:#0b0b0b;";
        closeBtn.addEventListener("click", hideOverlay);
        const iframe = document.createElement("iframe");
        iframe.src = browser.runtime.getURL("stats.html");
        iframe.title = "MyEpitechStats timeline";
        iframe.style.cssText = "flex:1 1 auto;width:100%;height:100%;border:0;";
        panel.append(closeBtn, iframe);
        overlay.appendChild(panel);
        overlay.addEventListener("click", (evt) => {
            if (evt.target === overlay)
                hideOverlay();
        });
        document.body.appendChild(overlay);
        return overlay;
    }
    function showOverlay() {
        const overlay = ensureOverlay();
        overlay.style.display = "block";
        document.documentElement.style.overflow = "hidden";
    }
    function hideOverlay() {
        const overlay = document.getElementById(OVERLAY_ID);
        if (overlay)
            overlay.style.display = "none";
        document.documentElement.style.overflow = "";
    }
    function toggleOverlay() {
        const overlay = document.getElementById(OVERLAY_ID);
        const visible = overlay?.style.display === "block";
        if (visible)
            hideOverlay();
        else
            showOverlay();
    }
    document.addEventListener("keydown", (evt) => {
        if (evt.key === "Escape")
            hideOverlay();
    });
    function injectNavItem() {
        if (document.getElementById(NAV_ITEM_ID))
            return;
        const candidates = REFERENCE_LABELS.map((label) => ({
            label,
            el: findLinkByLabel(label),
        })).filter((c) => c.el != null);
        if (!candidates.length)
            return;
        // Insert after the first (highest-priority) label that's present.
        const insertAfter = candidates[0];
        // Clone styling from an inactive link so we don't inherit "current page"
        // styling (see isActiveLink) without the background it depends on.
        const styleSource = candidates.find((c) => !isActiveLink(c.el)) || insertAfter;
        const item = styleSource.el.cloneNode(true);
        item.id = NAV_ITEM_ID;
        item.removeAttribute("href");
        item.removeAttribute("aria-current");
        item.removeAttribute("data-active");
        item.setAttribute("role", "button");
        item.setAttribute("tabindex", "0");
        const textNode = labelNodeOf(item, styleSource.label);
        textNode.textContent = "Timeline";
        applyTimelineIcon(item);
        const onActivate = (evt) => {
            evt.preventDefault();
            evt.stopPropagation();
            toggleOverlay();
        };
        // Capture phase: intercepts before the click reaches the SPA's own
        // delegated router listener higher up the tree.
        item.addEventListener("click", onActivate, true);
        item.addEventListener("keydown", (evt) => {
            if (evt.key === "Enter" || evt.key === " ") {
                onActivate(evt);
            }
        });
        insertAfter.el.insertAdjacentElement("afterend", item);
    }
    let debounceTimer;
    function scheduleSync() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            scanProjects();
            injectNavItem();
        }, 500);
    }
    scheduleSync();
    const observer = new MutationObserver(scheduleSync);
    observer.observe(document.body, { childList: true, subtree: true });
})();
