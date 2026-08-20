import { STORAGE_KEY } from "./types.js";
// Status is still shown in the tooltip and the table's status dot, but no
// longer drives bar fill — nearly everything on the Upcoming page shares one
// status, which made every bar the same color. Bars are colored per-project
// instead (see CATEGORICAL_HEX below); identity comes from the row (module)
// plus hover/table, not from a color legend.
const STATUS_COLOR_HEX = {
    neutral: { light: "#2a78d6", dark: "#3987e5" },
    good: { light: "#0ca30c", dark: "#0ca30c" },
    warning: { light: "#fab219", dark: "#fab219" },
    serious: { light: "#ec835a", dark: "#ec835a" },
    critical: { light: "#d03b3b", dark: "#e66767" },
    muted: { light: "#898781", dark: "#898781" },
};
// The 8-slot validated categorical palette (references/palette.md), used to
// give adjacent bars visually distinct colors. Past 8 projects colors repeat
// — that's expected; the row label and hover tooltip carry identity, not color.
const CATEGORICAL_HEX = [
    { light: "#2a78d6", dark: "#3987e5" }, // blue
    { light: "#eb6834", dark: "#d95926" }, // orange
    { light: "#1baf7a", dark: "#199e70" }, // aqua
    { light: "#eda100", dark: "#c98500" }, // yellow
    { light: "#e87ba4", dark: "#d55181" }, // magenta
    { light: "#008300", dark: "#008300" }, // green
    { light: "#4a3aa7", dark: "#9085e9" }, // violet
    { light: "#e34948", dark: "#e66767" }, // red
];
function colorFor(id, dark) {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
        hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
    }
    const slot = CATEGORICAL_HEX[hash % CATEGORICAL_HEX.length];
    return dark ? slot.dark : slot.light;
}
const DAY_MS = 24 * 60 * 60 * 1000;
const PX_PER_DAY = 6;
const BAR_HEIGHT = 22;
const LANE_GAP = 4;
const ROW_V_PADDING = 7;
function classifyStatus(status) {
    const s = status.toLowerCase();
    if (/fail/.test(s))
        return "critical";
    if (/late|overdue/.test(s))
        return "warning";
    if (/pass|valid|success|done|complete/.test(s))
        return "good";
    if (/progress|current|ongoing|upcoming|planned|schedule/.test(s))
        return "neutral";
    return "muted";
}
function isDarkMode() {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
}
function formatDate(ms) {
    if (ms == null)
        return "—";
    const d = new Date(ms);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}/${d.getFullYear()}`;
}
function formatTick(ms) {
    const d = new Date(ms);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}`;
}
function daysBetween(a, b) {
    return (b - a) / DAY_MS;
}
function packLanes(projects) {
    const sorted = [...projects].sort((a, b) => a.startDate - b.startDate);
    const laneEnds = [];
    const assignments = [];
    for (const project of sorted) {
        const end = project.deadlineDate ?? project.endDate ?? project.startDate;
        let lane = laneEnds.findIndex((laneEnd) => project.startDate >= laneEnd);
        if (lane === -1) {
            lane = laneEnds.length;
            laneEnds.push(end);
        }
        else {
            laneEnds[lane] = end;
        }
        assignments.push({ project, lane, rangeEnd: end });
    }
    return assignments;
}
const emptyState = document.getElementById("empty-state");
const chartFigure = document.getElementById("chart-figure");
const chartEl = document.getElementById("chart");
const legendEl = document.getElementById("legend");
const tableWrap = document.getElementById("table-wrap");
const tableBody = document.getElementById("table-body");
const tooltip = document.getElementById("tooltip");
const toggleTableBtn = document.getElementById("toggle-table");
const refreshBtn = document.getElementById("refresh");
const clearBtn = document.getElementById("clear");
let showTable = false;
function showTooltip(project, x, y) {
    tooltip.innerHTML = "";
    const title = document.createElement("div");
    title.className = "tt-title";
    title.textContent = project.title;
    tooltip.appendChild(title);
    const rows = [
        ["Module", project.module || "—"],
        ["Status", project.status || "—"],
        ["Start", formatDate(project.startDate)],
        ["End", formatDate(project.endDate)],
        ["Deadline", formatDate(project.deadlineDate)],
    ];
    for (const [label, value] of rows) {
        const row = document.createElement("div");
        row.className = "tt-row";
        const labelEl = document.createElement("span");
        labelEl.textContent = label;
        const valueEl = document.createElement("span");
        valueEl.textContent = value;
        row.append(labelEl, valueEl);
        tooltip.appendChild(row);
    }
    tooltip.hidden = false;
    const rect = tooltip.getBoundingClientRect();
    const left = Math.min(x + 14, window.innerWidth - rect.width - 12);
    const top = Math.min(y + 14, window.innerHeight - rect.height - 12);
    tooltip.style.left = `${Math.max(8, left)}px`;
    tooltip.style.top = `${Math.max(8, top)}px`;
}
function hideTooltip() {
    tooltip.hidden = true;
}
function renderChart(projects) {
    chartEl.innerHTML = "";
    const dark = isDarkMode();
    let minStart = Infinity;
    let maxEnd = -Infinity;
    for (const p of projects) {
        minStart = Math.min(minStart, p.startDate);
        maxEnd = Math.max(maxEnd, p.deadlineDate ?? p.endDate ?? p.startDate);
    }
    const domainStart = minStart - 3 * DAY_MS;
    const domainEnd = maxEnd + 3 * DAY_MS;
    const timelineWidth = Math.max(600, daysBetween(domainStart, domainEnd) * PX_PER_DAY);
    const byModule = new Map();
    for (const p of projects) {
        const key = p.module || "Other";
        if (!byModule.has(key))
            byModule.set(key, []);
        byModule.get(key).push(p);
    }
    const rows = [...byModule.entries()].sort((a, b) => Math.min(...a[1].map((p) => p.startDate)) - Math.min(...b[1].map((p) => p.startDate)));
    const inner = document.createElement("div");
    inner.className = "chart-inner";
    // Header row with month/mid-month ticks.
    const headerRow = document.createElement("div");
    headerRow.className = "chart-header-row";
    const headerLabel = document.createElement("div");
    headerLabel.className = "row-label";
    headerLabel.textContent = "";
    const headerTrack = document.createElement("div");
    headerTrack.className = "row-track";
    headerTrack.style.width = `${timelineWidth}px`;
    headerTrack.style.height = "24px";
    const startCursor = new Date(domainStart);
    startCursor.setHours(0, 0, 0, 0);
    startCursor.setDate(1);
    const cursor = new Date(startCursor);
    while (cursor.getTime() <= domainEnd) {
        for (const day of [1, 15]) {
            const tickDate = new Date(cursor.getFullYear(), cursor.getMonth(), day).getTime();
            if (tickDate < domainStart || tickDate > domainEnd)
                continue;
            const left = daysBetween(domainStart, tickDate) * PX_PER_DAY;
            const tick = document.createElement("div");
            tick.className = "tick";
            tick.style.left = `${left}px`;
            headerTrack.appendChild(tick);
            const label = document.createElement("div");
            label.className = "tick-label";
            label.style.left = `${left}px`;
            label.textContent = formatTick(tickDate);
            headerTrack.appendChild(label);
        }
        cursor.setMonth(cursor.getMonth() + 1);
    }
    headerRow.append(headerLabel, headerTrack);
    inner.appendChild(headerRow);
    for (const [moduleName, moduleProjects] of rows) {
        const lanes = packLanes(moduleProjects);
        const laneCount = Math.max(...lanes.map((l) => l.lane)) + 1;
        const rowHeight = laneCount * BAR_HEIGHT + (laneCount - 1) * LANE_GAP + ROW_V_PADDING * 2;
        const row = document.createElement("div");
        row.className = "chart-row";
        const label = document.createElement("div");
        label.className = "row-label";
        label.textContent = moduleName;
        label.title = moduleName;
        const track = document.createElement("div");
        track.className = "row-track";
        track.style.width = `${timelineWidth}px`;
        track.style.height = `${rowHeight}px`;
        // Gridlines echoed inside each row track for readability while scanning.
        for (const t of headerTrack.querySelectorAll(".tick")) {
            const echo = document.createElement("div");
            echo.className = "tick";
            echo.style.left = t.style.left;
            track.appendChild(echo);
        }
        for (const { project, lane } of lanes) {
            const start = project.startDate;
            const end = project.deadlineDate ?? project.endDate ?? project.startDate;
            const left = daysBetween(domainStart, start) * PX_PER_DAY;
            const width = Math.max(6, daysBetween(start, end) * PX_PER_DAY);
            const top = ROW_V_PADDING + lane * (BAR_HEIGHT + LANE_GAP);
            const bg = colorFor(project.id, dark);
            const bar = document.createElement("div");
            bar.className = "bar";
            bar.style.left = `${left}px`;
            bar.style.top = `${top}px`;
            bar.style.width = `${width}px`;
            bar.style.background = bg;
            bar.tabIndex = 0;
            // Bars are plain color blocks — no inline text at any width. The name
            // (and module/status/dates) always comes from the hover/focus tooltip.
            const onEnter = (evt) => {
                const point = "clientX" in evt ? evt : bar.getBoundingClientRect();
                const x = "clientX" in evt ? evt.clientX : point.left;
                const y = "clientY" in evt ? evt.clientY : point.top;
                showTooltip(project, x, y);
            };
            bar.addEventListener("pointerenter", onEnter);
            bar.addEventListener("pointermove", onEnter);
            bar.addEventListener("focus", onEnter);
            bar.addEventListener("pointerleave", hideTooltip);
            bar.addEventListener("blur", hideTooltip);
            track.appendChild(bar);
        }
        row.append(label, track);
        inner.appendChild(row);
    }
    chartEl.appendChild(inner);
    // No color legend: past 8 projects, colors repeat (see CATEGORICAL_HEX),
    // so a swatch-to-name mapping would be misleading. The row (module) plus
    // hover/focus tooltip and the table view carry identity instead.
    legendEl.textContent = "Hover or focus a bar for the project's name, module, status and dates.";
}
function renderTable(projects) {
    tableBody.innerHTML = "";
    const dark = isDarkMode();
    const sorted = [...projects].sort((a, b) => a.startDate - b.startDate);
    for (const p of sorted) {
        const tr = document.createElement("tr");
        const title = document.createElement("td");
        title.textContent = p.title;
        const module = document.createElement("td");
        module.textContent = p.module;
        const status = document.createElement("td");
        const statusCell = document.createElement("span");
        statusCell.className = "status-cell";
        const dot = document.createElement("span");
        dot.className = "status-dot";
        dot.style.background = STATUS_COLOR_HEX[classifyStatus(p.status)][dark ? "dark" : "light"];
        const statusText = document.createElement("span");
        statusText.textContent = p.status || "—";
        statusCell.append(dot, statusText);
        status.appendChild(statusCell);
        const start = document.createElement("td");
        start.textContent = formatDate(p.startDate);
        const end = document.createElement("td");
        end.textContent = formatDate(p.endDate);
        const deadline = document.createElement("td");
        deadline.textContent = formatDate(p.deadlineDate);
        tr.append(title, module, status, start, end, deadline);
        tableBody.appendChild(tr);
    }
}
function render(store) {
    const projects = Object.values(store);
    if (!projects.length) {
        emptyState.hidden = false;
        chartFigure.hidden = true;
        tableWrap.hidden = true;
        return;
    }
    emptyState.hidden = true;
    renderChart(projects);
    renderTable(projects);
    chartFigure.hidden = showTable;
    tableWrap.hidden = !showTable;
}
async function loadAndRender() {
    const data = (await browser.storage.local.get(STORAGE_KEY));
    render(data.projects || {});
}
toggleTableBtn.addEventListener("click", () => {
    showTable = !showTable;
    toggleTableBtn.textContent = showTable ? "Chart view" : "Table view";
    chartFigure.hidden = showTable;
    tableWrap.hidden = !showTable;
});
refreshBtn.addEventListener("click", () => {
    void loadAndRender();
});
clearBtn.addEventListener("click", async () => {
    if (!confirm("Clear all cached project data?"))
        return;
    await browser.storage.local.remove(STORAGE_KEY);
    await loadAndRender();
});
browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[STORAGE_KEY])
        return;
    void loadAndRender();
});
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    void loadAndRender();
});
void loadAndRender();
