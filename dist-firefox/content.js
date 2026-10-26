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
    // The site has its own light/dark switch (independent of the OS setting),
    // so our injected UI follows the page itself: Mantine's color-scheme
    // attribute if present, else the first opaque background found.
    function siteIsDark() {
        const scheme = document.documentElement.getAttribute("data-mantine-color-scheme");
        if (scheme === "dark")
            return true;
        if (scheme === "light")
            return false;
        const probes = [
            ...document.elementsFromPoint(window.innerWidth * 0.6, window.innerHeight * 0.95),
            document.body,
            document.documentElement,
        ];
        for (const el of probes) {
            const m = getComputedStyle(el).backgroundColor.match(/rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/);
            if (m && (m[4] === undefined || parseFloat(m[4]) > 0.5)) {
                return 0.299 * Number(m[1]) + 0.587 * Number(m[2]) + 0.114 * Number(m[3]) < 128;
            }
        }
        return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    // The active item's highlight: a content-less, absolutely positioned,
    // filled box near the nav (see isActiveLink).
    function findHighlightPill(from) {
        let scope = from.parentElement;
        for (let depth = 0; scope && depth < 8; depth++, scope = scope.parentElement) {
            for (const el of Array.from(scope.querySelectorAll("*"))) {
                if (el === from || from.contains(el) || el.textContent?.trim() || el.querySelector("svg, img"))
                    continue;
                const cs = getComputedStyle(el);
                if (cs.position === "absolute" && cs.backgroundColor !== "rgba(0, 0, 0, 0)")
                    return el;
            }
        }
        return null;
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
            "position:absolute;inset:28px;border-radius:12px;" +
                "overflow:hidden;display:flex;flex-direction:column;" +
                "box-shadow:0 24px 64px rgba(0,0,0,0.35);";
        const closeBtn = document.createElement("button");
        closeBtn.type = "button";
        closeBtn.setAttribute("aria-label", "Close timeline");
        closeBtn.textContent = "×";
        closeBtn.style.cssText =
            "position:absolute;top:10px;right:14px;z-index:1;width:32px;height:32px;" +
                "border-radius:8px;border:none;" +
                "font-size:20px;line-height:1;cursor:pointer;";
        closeBtn.setAttribute("data-meps-close", "");
        closeBtn.addEventListener("click", hideOverlay);
        const iframe = document.createElement("iframe");
        iframe.title = "MyEpitechStats timeline";
        iframe.style.cssText = "flex:1 1 auto;width:100%;height:100%;border:0;";
        panel.append(closeBtn, iframe);
        overlay.appendChild(panel);
        overlay.addEventListener("click", (evt) => {
            if (evt.target === overlay)
                hideOverlay();
        });
        document.body.appendChild(overlay);
        applyOverlayTheme(overlay);
        return overlay;
    }
    // Panel/close-button colors and the iframe's theme follow the site.
    function applyOverlayTheme(overlay) {
        const dark = siteIsDark();
        const panel = overlay.firstElementChild;
        panel.style.background = dark ? "#151515" : "#fcfcfb";
        const closeBtn = overlay.querySelector("[data-meps-close]");
        if (closeBtn) {
            closeBtn.style.background = dark ? "rgba(255,255,255,0.1)" : "rgba(11,11,11,0.06)";
            closeBtn.style.color = dark ? "#ffffff" : "#0b0b0b";
        }
        const iframe = overlay.querySelector("iframe");
        const src = `${browser.runtime.getURL("stats.html")}?theme=${dark ? "dark" : "light"}`;
        if (iframe && iframe.getAttribute("src") !== src)
            iframe.setAttribute("src", src);
    }
    function showOverlay() {
        const overlay = ensureOverlay();
        applyOverlayTheme(overlay);
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
        // The item is a clone carrying inline colors of the theme it was cloned
        // in, so rebuild it when the site switches between light and dark.
        const current = document.getElementById(NAV_ITEM_ID);
        const theme = siteIsDark() ? "dark" : "light";
        if (current) {
            if (current.getAttribute("data-meps-theme") === theme)
                return;
            current.remove();
        }
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
        item.setAttribute("data-meps-theme", theme);
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
        // The site's hover highlight is driven by its own JS, which our clone
        // doesn't have, so paint one ourselves in the active highlight's color
        // (dimmed), with the same corner radius.
        item.addEventListener("mouseenter", () => {
            const pill = findHighlightPill(item);
            if (!pill)
                return;
            const cs = getComputedStyle(pill);
            item.style.background = `color-mix(in srgb, ${cs.backgroundColor} 65%, transparent)`;
            item.style.borderRadius = cs.borderRadius;
        });
        item.addEventListener("mouseleave", () => {
            item.style.background = "";
        });
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
    // --- Sidebar rail: collapse the left sidebar down to its icons ----------
    //
    // The sidebar has no stable class and is made of several stacked layers
    // (nav list, white background panel, ...), so instead of guessing one
    // element we collect every full-height, narrow element touching the left
    // edge — at a few probe points and among the ancestors of our own
    // "Timeline" entry — and shrink the outermost ones to a narrow rail. Text
    // labels are hidden (found by their own text, not by class), leaving the
    // icons. The page content is offset by the sidebar width via
    // padding/margin or a grid track, so any offset equal to the old width is
    // rewritten to the rail width; everything is restored on expand.
    const TOGGLE_ID = "meps-sidebar-toggle";
    const STYLE_ID = "meps-rail-style";
    const RAIL_ATTR = "data-meps-rail";
    const LABEL_ATTR = "data-meps-label";
    const NAVLINK_ATTR = "data-meps-navlink";
    const PILL_ATTR = "data-meps-pill";
    const COLLAPSED_KEY = "meps-sidebar-collapsed";
    const RAIL_WIDTH = 72;
    const TOGGLE_SIZE = 28;
    let sidebarWidth = 0;
    let sidebarTop = 0;
    let sidebarUndo = [];
    function isSidebarLike(el) {
        if (el === document.body || el === document.documentElement)
            return false;
        if (el.id === TOGGLE_ID || el.id === OVERLAY_ID)
            return false;
        const r = el.getBoundingClientRect();
        return (r.left <= 2 &&
            r.width > 40 &&
            r.width < window.innerWidth * 0.5 &&
            r.height >= window.innerHeight * 0.8);
    }
    function findSidebarParts() {
        const found = new Set();
        const probes = [
            [10, window.innerHeight * 0.5],
            [10, window.innerHeight * 0.8],
        ];
        for (const [x, y] of probes) {
            for (const el of document.elementsFromPoint(x, y)) {
                if (isSidebarLike(el))
                    found.add(el);
            }
        }
        for (let el = document.getElementById(NAV_ITEM_ID)?.parentElement ?? null; el; el = el.parentElement) {
            if (isSidebarLike(el))
                found.add(el);
        }
        // Keep only the outermost: shrinking it shrinks everything inside.
        return Array.from(found).filter((el) => {
            for (let p = el.parentElement; p; p = p.parentElement)
                if (found.has(p))
                    return false;
            return true;
        });
    }
    function ensureRailStyle() {
        if (document.getElementById(STYLE_ID))
            return;
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent =
            `[${RAIL_ATTR}]{width:${RAIL_WIDTH}px!important;min-width:${RAIL_WIDTH}px!important;` +
                `max-width:${RAIL_WIDTH}px!important;overflow:hidden!important;}` +
                // Inner layers keep their full-width inline sizes; clamp them so the
                // centered icons land inside the rail instead of past its clip edge.
                `[${RAIL_ATTR}] *{max-width:100%!important;box-sizing:border-box!important;}` +
                // Active highlight and hover highlight must share one geometry: both
                // become the same centered 48px-wide box.
                `[${PILL_ATTR}]{left:50%!important;right:auto!important;width:48px!important;` +
                `margin-left:-24px!important;}` +
                `[${LABEL_ATTR}]{display:none!important;}` +
                `[${NAVLINK_ATTR}]{justify-content:center!important;padding-left:0!important;` +
                `padding-right:0!important;gap:0!important;width:48px!important;` +
                `margin-left:auto!important;margin-right:auto!important;}`;
        document.head.appendChild(style);
    }
    // Hide every text label inside the rail (nav item names, section
    // headings) while keeping the icons. Items get a tooltip with their name.
    function markRailLabels(root) {
        for (const el of Array.from(root.querySelectorAll("*"))) {
            if (el.closest("svg") || el.hasAttribute(LABEL_ATTR))
                continue;
            // The active item's highlight is a separate absolutely positioned,
            // content-less box (see isActiveLink); refit it to the rail.
            if (!el.hasAttribute(PILL_ATTR) &&
                !el.textContent?.trim() &&
                !el.querySelector("svg, img") &&
                getComputedStyle(el).position === "absolute" &&
                getComputedStyle(el).backgroundColor !== "rgba(0, 0, 0, 0)") {
                el.setAttribute(PILL_ATTR, "");
                continue;
            }
            const text = ownText(el);
            if (!text || el.querySelector("svg"))
                continue;
            el.setAttribute(LABEL_ATTR, "");
            const link = el.closest("a, button, [role='button']");
            if (link && root.contains(link) && !link.hasAttribute(NAVLINK_ATTR)) {
                link.setAttribute(NAVLINK_ATTR, "");
                if (!link.title)
                    link.title = text;
            }
        }
    }
    function setImportant(el, prop, value) {
        const old = el.style.getPropertyValue(prop);
        const oldPriority = el.style.getPropertyPriority(prop);
        el.style.setProperty(prop, value, "important");
        sidebarUndo.push(() => {
            if (old)
                el.style.setProperty(prop, old, oldPriority);
            else
                el.style.removeProperty(prop);
        });
    }
    function isCollapsed() {
        return document.querySelector(`[${RAIL_ATTR}]`) != null;
    }
    function collapseSidebar(parts) {
        if (!parts.length || isCollapsed())
            return;
        ensureRailStyle();
        const rects = parts.map((el) => el.getBoundingClientRect());
        sidebarWidth = Math.max(...rects.map((r) => r.width));
        sidebarTop = Math.min(...rects.map((r) => r.top));
        const widths = Array.from(new Set(rects.map((r) => Math.round(r.width))));
        for (const part of parts) {
            const parent = part.parentElement;
            if (parent && getComputedStyle(parent).display.includes("grid")) {
                setImportant(parent, "grid-template-columns", `${RAIL_WIDTH}px minmax(0, 1fr)`);
            }
            for (let node = part; node?.parentElement && node !== document.body; node = node.parentElement) {
                const siblings = Array.from(node.parentElement.children).filter((c) => c !== node);
                for (const sib of [node.parentElement, ...siblings]) {
                    const cs = getComputedStyle(sib);
                    for (const prop of ["padding-left", "margin-left", "left"]) {
                        const v = parseFloat(cs.getPropertyValue(prop));
                        if (widths.some((w) => Math.abs(v - w) <= 2)) {
                            setImportant(sib, prop, `${RAIL_WIDTH}px`);
                        }
                    }
                }
            }
        }
        // Mantine AppShell exposes the offset as a CSS variable.
        setImportant(document.documentElement, "--app-shell-navbar-offset", `${RAIL_WIDTH}px`);
        for (const part of parts) {
            part.setAttribute(RAIL_ATTR, "");
            markRailLabels(part);
        }
    }
    function expandSidebar() {
        for (const undo of sidebarUndo.reverse())
            undo();
        sidebarUndo = [];
        for (const attr of [RAIL_ATTR, LABEL_ATTR, NAVLINK_ATTR, PILL_ATTR]) {
            document.querySelectorAll(`[${attr}]`).forEach((el) => el.removeAttribute(attr));
        }
    }
    // Small round chip straddling the sidebar's right edge, near its top:
    // out of the way of the logo and the nav items, and it follows the edge
    // when the sidebar goes between full width and rail.
    function placeToggle(btn) {
        const width = isCollapsed() ? RAIL_WIDTH : sidebarWidth;
        btn.style.left = `${width - TOGGLE_SIZE / 2}px`;
        btn.style.top = `${sidebarTop + 22}px`;
        btn.setAttribute("aria-expanded", String(!isCollapsed()));
        const dark = siteIsDark();
        btn.style.background = dark ? "#2a2a2a" : "#fff";
        btn.style.color = dark ? "#f0f0f0" : "#3a3a3a";
        btn.style.border = `1px solid ${dark ? "rgba(255,255,255,0.18)" : "rgba(11,11,11,0.12)"}`;
        // Stay out of the way of modals (report, our own timeline overlay...).
        const modalOpen = document.querySelector('[role="dialog"], [aria-modal="true"]') != null ||
            document.getElementById(OVERLAY_ID)?.style.display === "block";
        btn.style.display = modalOpen ? "none" : "flex";
    }
    function toggleSidebar() {
        const btn = document.getElementById(TOGGLE_ID);
        if (!btn)
            return;
        const collapsing = !isCollapsed();
        if (collapsing)
            collapseSidebar(findSidebarParts());
        else
            expandSidebar();
        placeToggle(btn);
        try {
            localStorage.setItem(COLLAPSED_KEY, collapsing ? "1" : "0");
        }
        catch {
            /* storage unavailable — non-fatal */
        }
    }
    function ensureToggle() {
        const collapsed = isCollapsed();
        const parts = collapsed
            ? Array.from(document.querySelectorAll(`[${RAIL_ATTR}]`))
            : findSidebarParts();
        let btn = document.getElementById(TOGGLE_ID);
        if (!parts.length) {
            btn?.remove();
            return;
        }
        if (collapsed) {
            // React may have re-rendered new labels into the rail.
            parts.forEach(markRailLabels);
        }
        else {
            const rects = parts.map((el) => el.getBoundingClientRect());
            sidebarWidth = Math.max(...rects.map((r) => r.width));
            sidebarTop = Math.min(...rects.map((r) => r.top));
        }
        if (!btn) {
            btn = document.createElement("button");
            btn.id = TOGGLE_ID;
            btn.type = "button";
            btn.setAttribute("aria-label", "Toggle sidebar");
            btn.innerHTML =
                '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
                    'stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
            btn.style.cssText =
                "position:fixed;z-index:2147482000;" +
                    `width:${TOGGLE_SIZE}px;height:${TOGGLE_SIZE}px;padding:0;` +
                    "display:flex;align-items:center;justify-content:center;cursor:pointer;" +
                    "border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.12);";
            btn.addEventListener("click", toggleSidebar);
            document.body.appendChild(btn);
            let wasCollapsed = false;
            try {
                wasCollapsed = localStorage.getItem(COLLAPSED_KEY) === "1";
            }
            catch {
                /* ignore */
            }
            if (wasCollapsed && !collapsed)
                collapseSidebar(parts);
        }
        placeToggle(btn);
    }
    window.addEventListener("resize", () => ensureToggle());
    // --- Evaluations: report total + grade on the list ----------------------
    //
    // The "Assessment report" modal lists per-criterion scores ("2 / 2"). We
    // sum them into a total shown next to the modal title, and remember it per
    // evaluation (keyed by title + date, read from the card whose "View
    // report" button was clicked) so the list can show the grade on each
    // card without reopening anything. Everything is located by text.
    const SCORE_RE = /^(\d+)\s*\/\s*(\d+)$/;
    const DATE_TIME_RE = /^\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}$/;
    const EVAL_STORAGE_KEY = "evalScores";
    const TOTAL_ATTR = "data-meps-total";
    let pendingEvalKey = null;
    function textLeaves(root) {
        return Array.from(root.querySelectorAll("*")).filter((el) => ownText(el));
    }
    function isViewReport(el) {
        return /^view report$/i.test((el.textContent || "").trim());
    }
    function evalCardOf(btn) {
        for (let el = btn.parentElement; el; el = el.parentElement) {
            const buttons = Array.from(el.querySelectorAll("button, a, [role='button']")).filter(isViewReport);
            if (buttons.length > 1)
                return null;
            if ((el.textContent || "").includes("Evaluator:") &&
                textLeaves(el).some((l) => DATE_TIME_RE.test(ownText(l)))) {
                return el;
            }
        }
        return null;
    }
    function evalKeyOf(card) {
        const leaves = textLeaves(card);
        const dateEl = leaves.find((l) => DATE_TIME_RE.test(ownText(l)));
        const title = leaves
            .map(ownText)
            .find((t) => t.length > 3 &&
            !/^(assessment|view report|show (more|less))$/i.test(t) &&
            !/^evaluator:/i.test(t) &&
            !DATE_TIME_RE.test(t));
        if (!dateEl || !title)
            return null;
        return { key: `${title} | ${ownText(dateEl)}`, dateEl };
    }
    function formatScore({ got, max }) {
        return max ? `${got}/${max} · ${Math.round((got / max) * 100)}%` : `${got}/${max}`;
    }
    function blueChip() {
        return siteIsDark() ? "background:#23306b;color:#a9b8ff;" : "background:#e8ecff;color:#1b3cf5;";
    }
    function setChip(host, label, css) {
        let chip = host.querySelector(`:scope > [${TOTAL_ATTR}]`);
        if (!chip) {
            chip = document.createElement("span");
            chip.setAttribute(TOTAL_ATTR, "");
            host.appendChild(chip);
        }
        if (chip.style.cssText !== css)
            chip.style.cssText = css;
        if (chip.textContent !== label)
            chip.textContent = label;
    }
    document.addEventListener("click", (evt) => {
        const btn = evt.target?.closest("button, a, [role='button']");
        if (!btn || !isViewReport(btn))
            return;
        const card = evalCardOf(btn);
        pendingEvalKey = (card && evalKeyOf(card)?.key) || null;
    }, true);
    async function injectEvalTotals() {
        // 1) Inside the open report modal: sum the "x / y" criteria badges.
        const heading = Array.from(document.querySelectorAll("*")).find((el) => /^assessment report$/i.test(ownText(el)));
        if (heading) {
            let scope = heading;
            let scores = [];
            while (scope && scope !== document.body) {
                scores = textLeaves(scope).filter((l) => SCORE_RE.test(ownText(l)));
                if (scores.length)
                    break;
                scope = scope.parentElement;
            }
            if (scores.length) {
                const total = { got: 0, max: 0 };
                for (const el of scores) {
                    const m = ownText(el).match(SCORE_RE);
                    total.got += Number(m[1]);
                    total.max += Number(m[2]);
                }
                setChip(heading, `Total ${formatScore(total)}`, "display:inline-block;margin-left:14px;padding:4px 10px;border-radius:6px;" +
                    `${blueChip()}font-size:14px;font-weight:600;` +
                    "vertical-align:middle;white-space:nowrap;");
                if (pendingEvalKey) {
                    const data = (await browser.storage.local.get(EVAL_STORAGE_KEY));
                    const all = data.evalScores || {};
                    const prev = all[pendingEvalKey];
                    if (!prev || prev.got !== total.got || prev.max !== total.max) {
                        all[pendingEvalKey] = total;
                        await browser.storage.local.set({ [EVAL_STORAGE_KEY]: all });
                    }
                }
            }
        }
        // 2) On the list: show the remembered grade next to each card's date.
        const buttons = Array.from(document.querySelectorAll("button, a, [role='button']")).filter(isViewReport);
        if (!buttons.length)
            return;
        const data = (await browser.storage.local.get(EVAL_STORAGE_KEY));
        const all = data.evalScores || {};
        for (const btn of buttons) {
            const card = evalCardOf(btn);
            const info = card && evalKeyOf(card);
            const score = info && all[info.key];
            if (!info || !score)
                continue;
            setChip(info.dateEl, formatScore(score), "display:inline-block;margin-left:10px;padding:2px 8px;border-radius:4px;" +
                `${blueChip()}font-weight:600;`);
        }
    }
    // --- Units table: remember which units the student is registered to -----
    //
    // On the Units page each row's action button reads "Unregister" when the
    // student is enrolled and "Register" when not (found by text — the classes
    // are hashed). Rows only exist in the DOM while rendered, so results are
    // merged into storage across visits; the dashboard uses them to hide
    // projects of units the student isn't enrolled in.
    const REGISTERED_KEY = "registeredUnits";
    async function scanUnits() {
        const found = {};
        for (const row of Array.from(document.querySelectorAll("tr, [role='row']"))) {
            const action = Array.from(row.querySelectorAll("button, a, [role='button']"))
                .map((b) => (b.textContent || "").trim().toLowerCase())
                .find((t) => t === "register" || t === "unregister");
            if (!action)
                continue;
            const cell = Array.from(row.querySelectorAll("td, [role='cell']")).find((c) => (c.textContent || "").trim());
            const name = (cell?.textContent || "").trim();
            if (name)
                found[name] = action === "unregister";
        }
        if (!Object.keys(found).length)
            return;
        const data = (await browser.storage.local.get(REGISTERED_KEY));
        const merged = { ...(data.registeredUnits || {}), ...found };
        if (JSON.stringify(merged) !== JSON.stringify(data.registeredUnits || {})) {
            await browser.storage.local.set({ [REGISTERED_KEY]: merged });
        }
    }
    // --- Test results: percentage next to the "X/Y TESTS" badge -------------
    //
    // The badge's classes are hashed too, so we find it by its own text
    // ("4/4 tests", uppercased via CSS) and append a child span with the
    // percentage. The span is marked so the pass is idempotent and the
    // MutationObserver doesn't loop on our own insertion.
    const PCT_ATTR = "data-meps-pct";
    const TESTS_BADGE_RE = /^(\d+)\s*\/\s*(\d+)\s+tests?$/i;
    function ownText(el) {
        return Array.from(el.childNodes)
            .filter((n) => n.nodeType === Node.TEXT_NODE)
            .map((n) => n.textContent || "")
            .join("")
            .trim();
    }
    function injectTestPercentages() {
        const els = document.querySelectorAll("div, span, p");
        for (const el of Array.from(els)) {
            const match = ownText(el).match(TESTS_BADGE_RE);
            if (!match)
                continue;
            const total = Number(match[2]);
            if (!total)
                continue;
            const pct = Math.round((Number(match[1]) / total) * 100);
            const label = ` · ${pct}%`;
            const existing = el.querySelector(`:scope > [${PCT_ATTR}]`);
            if (existing) {
                if (existing.textContent !== label)
                    existing.textContent = label;
            }
            else {
                const span = document.createElement("span");
                span.setAttribute(PCT_ATTR, "");
                span.textContent = label;
                el.appendChild(span);
            }
            injectTitlePercentage(el, pct);
        }
    }
    // Also show the percentage right after the project's name. The card is
    // the largest ancestor holding only this one "X/Y tests" badge; the title
    // is its biggest (then boldest) text, which beats the small mono badges,
    // the date and the circle labels without depending on class names.
    const TITLE_PCT_ATTR = "data-meps-title-pct";
    const titleCards = new WeakMap();
    function testsCardOf(badge) {
        let card = null;
        for (let p = badge.parentElement; p && p !== document.body; p = p.parentElement) {
            const badges = textLeaves(p).filter((l) => TESTS_BADGE_RE.test(ownText(l)));
            if (badges.length > 1)
                break;
            card = p;
        }
        return card;
    }
    function projectTitleOf(card) {
        let best = null;
        for (const el of textLeaves(card)) {
            const text = ownText(el);
            if (TESTS_BADGE_RE.test(text) ||
                /\d{1,2}\/\d{1,2}\/\d{4}/.test(text) ||
                /%$/.test(text) ||
                el.hasAttribute(PCT_ATTR) ||
                el.hasAttribute(TITLE_PCT_ATTR)) {
                continue;
            }
            const cs = getComputedStyle(el);
            const size = parseFloat(cs.fontSize);
            const weight = parseInt(cs.fontWeight, 10) || 400;
            if (!best || size > best.size || (size === best.size && weight > best.weight)) {
                best = { el, size, weight };
            }
        }
        return best?.el ?? null;
    }
    function injectTitlePercentage(badge, pct) {
        let card = titleCards.get(badge);
        if (!card || !card.isConnected) {
            card = testsCardOf(badge) ?? undefined;
            if (card)
                titleCards.set(badge, card);
        }
        if (!card)
            return;
        const label = `${pct}%`;
        const dark = siteIsDark();
        const [bg, fg] = pct >= 80
            ? dark ? ["#16382a", "#6fdc9a"] : ["#e6f6ec", "#1f7a3c"]
            : pct >= 50
                ? dark ? ["#40330f", "#f2c35a"] : ["#fdf3dc", "#9a6a00"]
                : dark ? ["#431c1c", "#ff8f8f"] : ["#fbe9e9", "#a12a2a"];
        const css = `display:inline-block;margin-left:10px;padding:1px 8px;border-radius:4px;` +
            `background:${bg};color:${fg};font-size:0.85em;font-weight:600;vertical-align:middle;`;
        const existing = card.querySelector(`[${TITLE_PCT_ATTR}]`);
        if (existing) {
            if (existing.textContent !== label)
                existing.textContent = label;
            if (existing.style.cssText !== css)
                existing.style.cssText = css;
            return;
        }
        const title = projectTitleOf(card);
        if (!title)
            return;
        const chip = document.createElement("span");
        chip.setAttribute(TITLE_PCT_ATTR, "");
        chip.textContent = label;
        chip.style.cssText = css;
        title.appendChild(chip);
    }
    let debounceTimer;
    function scheduleSync() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            scanProjects();
            scanUnits();
            injectNavItem();
            ensureToggle();
            injectTestPercentages();
            injectEvalTotals();
        }, 500);
    }
    scheduleSync();
    const observer = new MutationObserver(scheduleSync);
    observer.observe(document.body, { childList: true, subtree: true });
})();
