// Scrapes Epitech project cards on any my.epitech.eu page and accumulates
// them into browser.storage.local, keyed by project id (deduped across
// visits to the Upcoming / Current / Past project pages).
//
// `browser` (Mozilla's webextension-polyfill, promise-based on both Chrome
// and Firefox) is a global here, not imported — see browser-global.d.ts.
// This file must also stay free of any import/export statement of its own
// (even `import type`, which TS still treats as making the file a module
// and appends a stray `export {}` to the output) because it's loaded as a
// classic (non-module) content script per manifest.json. ProjectRecord/
// ProjectStore and STORAGE_KEY are duplicated from ./types.ts rather than
// imported — keep them in sync if that file changes.
interface ProjectRecord {
  id: string;
  year: string;
  unitCode: string;
  campusGroup: string;
  href: string;
  title: string;
  module: string;
  status: string;
  startDate: number;
  endDate?: number;
  deadlineDate?: number;
  firstSeenAt: number;
  lastSeenAt: number;
}
type ProjectStore = Record<string, ProjectRecord>;

(() => {
  const STORAGE_KEY = "projects";

  const ICON_TO_FIELD: Record<string, "startDate" | "endDate" | "deadlineDate"> = {
    "tabler-icon-calendar": "startDate",
    "tabler-icon-clock": "endDate",
    "tabler-icon-flag": "deadlineDate",
  };

  function parseDate(text: string | null | undefined): number | null {
    if (!text) return null;
    const match = text.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) return null;
    const [, d, m, y] = match;
    const time = new Date(Number(y), Number(m) - 1, Number(d)).getTime();
    return Number.isNaN(time) ? null : time;
  }

  function extractProject(
    card: Element
  ): Omit<ProjectRecord, "firstSeenAt" | "lastSeenAt"> | null {
    const href = card.getAttribute("href") || "";
    const match = href.match(/\/units\/(\d+)\/([^/]+)\/([^/]+)\/projects\/(\d+)/);
    if (!match) return null;
    const [, year, unitCode, campusGroup, id] = match;

    const texts = Array.from(card.querySelectorAll("p.mantine-Text-root")).map(
      (p) => (p.textContent || "").trim()
    );
    const [title, subtitleRaw] = texts;
    if (!title) return null;
    const subtitle = (subtitleRaw || "").replace(/^[^-]+-\s*/, "").trim();

    const status =
      card.querySelector(".mantine-Badge-label")?.textContent?.trim() || "";

    const dates: Partial<Pick<ProjectRecord, "startDate" | "endDate" | "deadlineDate">> = {};
    for (const [iconClass, field] of Object.entries(ICON_TO_FIELD)) {
      const icon = card.querySelector(`svg.${iconClass}`);
      const dateText = icon?.nextElementSibling?.textContent;
      const parsed = parseDate(dateText);
      if (parsed != null) dates[field] = parsed;
    }
    if (dates.startDate == null) return null;

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

  async function scanProjects(): Promise<void> {
    const cards = document.querySelectorAll<HTMLAnchorElement>(
      'a.mantine-Card-root[href*="/projects/"]'
    );
    if (!cards.length) return;

    const records: Omit<ProjectRecord, "firstSeenAt" | "lastSeenAt">[] = [];
    for (const card of Array.from(cards)) {
      const record = extractProject(card);
      if (record) records.push(record);
    }
    if (!records.length) return;

    const data = (await browser.storage.local.get(STORAGE_KEY)) as { projects?: ProjectStore };
    const projects: ProjectStore = data.projects || {};
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

  function findLinkByLabel(label: string): HTMLElement | null {
    const all = Array.from(document.querySelectorAll<HTMLElement>("a, button"));
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
  function isActiveLink(el: HTMLElement): boolean {
    if (el.getAttribute("aria-current") != null) return true;
    if (el.getAttribute("data-active") === "true" || el.matches("[data-active]")) return true;
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

  function applyTimelineIcon(item: HTMLElement): void {
    const svg = item.querySelector("svg");
    if (!svg) return;
    svg.setAttribute(
      "class",
      svg.getAttribute("class")?.replace(/tabler-icon-[\w-]+/, "tabler-icon-clock-hour-4") ??
        "tabler-icon tabler-icon-clock-hour-4"
    );
    svg.innerHTML = TIMELINE_ICON_PATHS.map((d) => `<path d="${d}"></path>`).join("");
  }

  function labelNodeOf(root: HTMLElement, label: string): Element {
    return (
      Array.from(root.querySelectorAll("*")).find(
        (n) => n.children.length === 0 && n.textContent?.trim() === label
      ) || root
    );
  }

  function ensureOverlay(): HTMLElement {
    const existing = document.getElementById(OVERLAY_ID);
    if (existing) return existing;

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
      if (evt.target === overlay) hideOverlay();
    });
    document.body.appendChild(overlay);
    return overlay;
  }

  function showOverlay(): void {
    const overlay = ensureOverlay();
    overlay.style.display = "block";
    document.documentElement.style.overflow = "hidden";
  }

  function hideOverlay(): void {
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay) overlay.style.display = "none";
    document.documentElement.style.overflow = "";
  }

  function toggleOverlay(): void {
    const overlay = document.getElementById(OVERLAY_ID);
    const visible = overlay?.style.display === "block";
    if (visible) hideOverlay();
    else showOverlay();
  }

  document.addEventListener("keydown", (evt) => {
    if (evt.key === "Escape") hideOverlay();
  });

  function injectNavItem(): void {
    if (document.getElementById(NAV_ITEM_ID)) return;

    const candidates = REFERENCE_LABELS.map((label) => ({
      label,
      el: findLinkByLabel(label),
    })).filter((c): c is { label: string; el: HTMLElement } => c.el != null);
    if (!candidates.length) return;

    // Insert after the first (highest-priority) label that's present.
    const insertAfter = candidates[0];
    // Clone styling from an inactive link so we don't inherit "current page"
    // styling (see isActiveLink) without the background it depends on.
    const styleSource = candidates.find((c) => !isActiveLink(c.el)) || insertAfter;

    const item = styleSource.el.cloneNode(true) as HTMLElement;
    item.id = NAV_ITEM_ID;
    item.removeAttribute("href");
    item.removeAttribute("aria-current");
    item.removeAttribute("data-active");
    item.setAttribute("role", "button");
    item.setAttribute("tabindex", "0");

    const textNode = labelNodeOf(item, styleSource.label);
    textNode.textContent = "Timeline";
    applyTimelineIcon(item);

    const onActivate = (evt: Event) => {
      evt.preventDefault();
      evt.stopPropagation();
      toggleOverlay();
    };
    // Capture phase: intercepts before the click reaches the SPA's own
    // delegated router listener higher up the tree.
    item.addEventListener("click", onActivate, true);
    item.addEventListener("keydown", (evt) => {
      if ((evt as KeyboardEvent).key === "Enter" || (evt as KeyboardEvent).key === " ") {
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
  let sidebarUndo: Array<() => void> = [];

  function isSidebarLike(el: Element): boolean {
    if (el === document.body || el === document.documentElement) return false;
    if (el.id === TOGGLE_ID || el.id === OVERLAY_ID) return false;
    const r = el.getBoundingClientRect();
    return (
      r.left <= 2 &&
      r.width > 40 &&
      r.width < window.innerWidth * 0.5 &&
      r.height >= window.innerHeight * 0.8
    );
  }

  function findSidebarParts(): HTMLElement[] {
    const found = new Set<HTMLElement>();
    const probes: Array<[number, number]> = [
      [10, window.innerHeight * 0.5],
      [10, window.innerHeight * 0.8],
    ];
    for (const [x, y] of probes) {
      for (const el of document.elementsFromPoint(x, y)) {
        if (isSidebarLike(el)) found.add(el as HTMLElement);
      }
    }
    for (
      let el = document.getElementById(NAV_ITEM_ID)?.parentElement ?? null;
      el;
      el = el.parentElement
    ) {
      if (isSidebarLike(el)) found.add(el);
    }
    // Keep only the outermost: shrinking it shrinks everything inside.
    return Array.from(found).filter((el) => {
      for (let p = el.parentElement; p; p = p.parentElement) if (found.has(p)) return false;
      return true;
    });
  }

  function ensureRailStyle(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent =
      `[${RAIL_ATTR}]{width:${RAIL_WIDTH}px!important;min-width:${RAIL_WIDTH}px!important;` +
      `max-width:${RAIL_WIDTH}px!important;overflow:hidden!important;}` +
      // Inner layers keep their full-width inline sizes; clamp them so the
      // centered icons land inside the rail instead of past its clip edge.
      `[${RAIL_ATTR}] *{max-width:100%!important;box-sizing:border-box!important;}` +
      `[${PILL_ATTR}]{left:8px!important;right:8px!important;width:auto!important;}` +
      `[${LABEL_ATTR}]{display:none!important;}` +
      `[${NAVLINK_ATTR}]{justify-content:center!important;padding-left:0!important;` +
      `padding-right:0!important;gap:0!important;}`;
    document.head.appendChild(style);
  }

  // Hide every text label inside the rail (nav item names, section
  // headings) while keeping the icons. Items get a tooltip with their name.
  function markRailLabels(root: HTMLElement): void {
    for (const el of Array.from(root.querySelectorAll<HTMLElement>("*"))) {
      if (el.closest("svg") || el.hasAttribute(LABEL_ATTR)) continue;
      // The active item's highlight is a separate absolutely positioned,
      // content-less box (see isActiveLink); refit it to the rail.
      if (
        !el.hasAttribute(PILL_ATTR) &&
        !el.textContent?.trim() &&
        !el.querySelector("svg, img") &&
        getComputedStyle(el).position === "absolute" &&
        getComputedStyle(el).backgroundColor !== "rgba(0, 0, 0, 0)"
      ) {
        el.setAttribute(PILL_ATTR, "");
        continue;
      }
      const text = ownText(el);
      if (!text || el.querySelector("svg")) continue;
      el.setAttribute(LABEL_ATTR, "");
      const link = el.closest<HTMLElement>("a, button, [role='button']");
      if (link && root.contains(link) && !link.hasAttribute(NAVLINK_ATTR)) {
        link.setAttribute(NAVLINK_ATTR, "");
        if (!link.title) link.title = text;
      }
    }
  }

  function setImportant(el: HTMLElement, prop: string, value: string): void {
    const old = el.style.getPropertyValue(prop);
    const oldPriority = el.style.getPropertyPriority(prop);
    el.style.setProperty(prop, value, "important");
    sidebarUndo.push(() => {
      if (old) el.style.setProperty(prop, old, oldPriority);
      else el.style.removeProperty(prop);
    });
  }

  function isCollapsed(): boolean {
    return document.querySelector(`[${RAIL_ATTR}]`) != null;
  }

  function collapseSidebar(parts: HTMLElement[]): void {
    if (!parts.length || isCollapsed()) return;
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
      for (
        let node: HTMLElement | null = part;
        node?.parentElement && node !== document.body;
        node = node.parentElement
      ) {
        const siblings = Array.from(node.parentElement.children).filter(
          (c) => c !== node
        ) as HTMLElement[];
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

  function expandSidebar(): void {
    for (const undo of sidebarUndo.reverse()) undo();
    sidebarUndo = [];
    for (const attr of [RAIL_ATTR, LABEL_ATTR, NAVLINK_ATTR, PILL_ATTR]) {
      document.querySelectorAll(`[${attr}]`).forEach((el) => el.removeAttribute(attr));
    }
  }

  // Small round chip straddling the sidebar's right edge, near its top:
  // out of the way of the logo and the nav items, and it follows the edge
  // when the sidebar goes between full width and rail.
  function placeToggle(btn: HTMLElement): void {
    const width = isCollapsed() ? RAIL_WIDTH : sidebarWidth;
    btn.style.left = `${width - TOGGLE_SIZE / 2}px`;
    btn.style.top = `${sidebarTop + 22}px`;
    btn.setAttribute("aria-expanded", String(!isCollapsed()));
    // Stay out of the way of modals (report, our own timeline overlay...).
    const modalOpen =
      document.querySelector('[role="dialog"], [aria-modal="true"]') != null ||
      document.getElementById(OVERLAY_ID)?.style.display === "block";
    btn.style.display = modalOpen ? "none" : "flex";
  }

  function toggleSidebar(): void {
    const btn = document.getElementById(TOGGLE_ID);
    if (!btn) return;
    const collapsing = !isCollapsed();
    if (collapsing) collapseSidebar(findSidebarParts());
    else expandSidebar();
    placeToggle(btn);
    try {
      localStorage.setItem(COLLAPSED_KEY, collapsing ? "1" : "0");
    } catch {
      /* storage unavailable — non-fatal */
    }
  }

  function ensureToggle(): void {
    const collapsed = isCollapsed();
    const parts = collapsed
      ? Array.from(document.querySelectorAll<HTMLElement>(`[${RAIL_ATTR}]`))
      : findSidebarParts();
    let btn = document.getElementById(TOGGLE_ID) as HTMLButtonElement | null;
    if (!parts.length) {
      btn?.remove();
      return;
    }
    if (collapsed) {
      // React may have re-rendered new labels into the rail.
      parts.forEach(markRailLabels);
    } else {
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
        "border-radius:50%;border:1px solid rgba(11,11,11,0.12);" +
        "background:#fff;color:#3a3a3a;box-shadow:0 1px 4px rgba(0,0,0,0.12);";
      btn.addEventListener("click", toggleSidebar);
      document.body.appendChild(btn);
      let wasCollapsed = false;
      try {
        wasCollapsed = localStorage.getItem(COLLAPSED_KEY) === "1";
      } catch {
        /* ignore */
      }
      if (wasCollapsed && !collapsed) collapseSidebar(parts);
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
  let pendingEvalKey: string | null = null;

  interface EvalScore {
    got: number;
    max: number;
  }

  function textLeaves(root: Element): HTMLElement[] {
    return Array.from(root.querySelectorAll<HTMLElement>("*")).filter((el) => ownText(el));
  }

  function isViewReport(el: Element): boolean {
    return /^view report$/i.test((el.textContent || "").trim());
  }

  function evalCardOf(btn: HTMLElement): HTMLElement | null {
    for (let el = btn.parentElement; el; el = el.parentElement) {
      const buttons = Array.from(el.querySelectorAll("button, a, [role='button']")).filter(isViewReport);
      if (buttons.length > 1) return null;
      if (
        (el.textContent || "").includes("Evaluator:") &&
        textLeaves(el).some((l) => DATE_TIME_RE.test(ownText(l)))
      ) {
        return el;
      }
    }
    return null;
  }

  function evalKeyOf(card: HTMLElement): { key: string; dateEl: HTMLElement } | null {
    const leaves = textLeaves(card);
    const dateEl = leaves.find((l) => DATE_TIME_RE.test(ownText(l)));
    const title = leaves
      .map(ownText)
      .find(
        (t) =>
          t.length > 3 &&
          !/^(assessment|view report|show (more|less))$/i.test(t) &&
          !/^evaluator:/i.test(t) &&
          !DATE_TIME_RE.test(t)
      );
    if (!dateEl || !title) return null;
    return { key: `${title} | ${ownText(dateEl)}`, dateEl };
  }

  function formatScore({ got, max }: EvalScore): string {
    return max ? `${got}/${max} · ${Math.round((got / max) * 100)}%` : `${got}/${max}`;
  }

  function setChip(host: HTMLElement, label: string, css: string): void {
    let chip = host.querySelector<HTMLElement>(`:scope > [${TOTAL_ATTR}]`);
    if (!chip) {
      chip = document.createElement("span");
      chip.setAttribute(TOTAL_ATTR, "");
      chip.style.cssText = css;
      host.appendChild(chip);
    }
    if (chip.textContent !== label) chip.textContent = label;
  }

  document.addEventListener(
    "click",
    (evt) => {
      const btn = (evt.target as Element | null)?.closest<HTMLElement>("button, a, [role='button']");
      if (!btn || !isViewReport(btn)) return;
      const card = evalCardOf(btn);
      pendingEvalKey = (card && evalKeyOf(card)?.key) || null;
    },
    true
  );

  async function injectEvalTotals(): Promise<void> {
    // 1) Inside the open report modal: sum the "x / y" criteria badges.
    const heading = Array.from(document.querySelectorAll<HTMLElement>("*")).find(
      (el) => /^assessment report$/i.test(ownText(el))
    );
    if (heading) {
      let scope: HTMLElement | null = heading;
      let scores: HTMLElement[] = [];
      while (scope && scope !== document.body) {
        scores = textLeaves(scope).filter((l) => SCORE_RE.test(ownText(l)));
        if (scores.length) break;
        scope = scope.parentElement;
      }
      if (scores.length) {
        const total: EvalScore = { got: 0, max: 0 };
        for (const el of scores) {
          const m = ownText(el).match(SCORE_RE)!;
          total.got += Number(m[1]);
          total.max += Number(m[2]);
        }
        setChip(
          heading,
          `Total ${formatScore(total)}`,
          "display:inline-block;margin-left:14px;padding:4px 10px;border-radius:6px;" +
            "background:#e8ecff;color:#1b3cf5;font-size:14px;font-weight:600;" +
            "vertical-align:middle;white-space:nowrap;"
        );
        if (pendingEvalKey) {
          const data = (await browser.storage.local.get(EVAL_STORAGE_KEY)) as {
            evalScores?: Record<string, EvalScore>;
          };
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
    const buttons = Array.from(document.querySelectorAll<HTMLElement>("button, a, [role='button']")).filter(
      isViewReport
    );
    if (!buttons.length) return;
    const data = (await browser.storage.local.get(EVAL_STORAGE_KEY)) as {
      evalScores?: Record<string, EvalScore>;
    };
    const all = data.evalScores || {};
    for (const btn of buttons) {
      const card = evalCardOf(btn);
      const info = card && evalKeyOf(card);
      const score = info && all[info.key];
      if (!info || !score) continue;
      setChip(
        info.dateEl,
        formatScore(score),
        "display:inline-block;margin-left:10px;padding:2px 8px;border-radius:4px;" +
          "background:#e8ecff;color:#1b3cf5;font-weight:600;"
      );
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

  async function scanUnits(): Promise<void> {
    const found: Record<string, boolean> = {};
    for (const row of Array.from(document.querySelectorAll<HTMLElement>("tr, [role='row']"))) {
      const action = Array.from(row.querySelectorAll<HTMLElement>("button, a, [role='button']"))
        .map((b) => (b.textContent || "").trim().toLowerCase())
        .find((t) => t === "register" || t === "unregister");
      if (!action) continue;
      const cell = Array.from(row.querySelectorAll<HTMLElement>("td, [role='cell']")).find((c) =>
        (c.textContent || "").trim()
      );
      const name = (cell?.textContent || "").trim();
      if (name) found[name] = action === "unregister";
    }
    if (!Object.keys(found).length) return;

    const data = (await browser.storage.local.get(REGISTERED_KEY)) as {
      registeredUnits?: Record<string, boolean>;
    };
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

  function ownText(el: Element): string {
    return Array.from(el.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent || "")
      .join("")
      .trim();
  }

  function injectTestPercentages(): void {
    const els = document.querySelectorAll<HTMLElement>("div, span, p");
    for (const el of Array.from(els)) {
      const match = ownText(el).match(TESTS_BADGE_RE);
      if (!match) continue;
      const total = Number(match[2]);
      if (!total) continue;
      const pct = Math.round((Number(match[1]) / total) * 100);
      const label = ` · ${pct}%`;
      const existing = el.querySelector(`:scope > [${PCT_ATTR}]`);
      if (existing) {
        if (existing.textContent !== label) existing.textContent = label;
        continue;
      }
      const span = document.createElement("span");
      span.setAttribute(PCT_ATTR, "");
      span.textContent = label;
      el.appendChild(span);
    }
  }

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  function scheduleSync(): void {
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
