# MyEpitechStats — developer notes

A Chrome/Firefox extension that turns your Epitech modules/projects into a
Gantt-style timeline, so you can see overlaps and plan your credit strategy
— a spiritual successor to the old *Intra Statistics* extension, rebuilt for
my.epitech.eu.

For the simple "just install it" instructions, see [README.md](README.md).

## What it does

- A content script watches `my.epitech.eu` and scrapes the project cards
  shown on any page that lists them (Upcoming, Current, Past, …), storing
  them locally and de-duplicating by project id as you browse.
- A **Timeline** entry is added to the site's own sidebar (right after
  "Projects"). Clicking it opens the dashboard as an in-page overlay — no
  navigation away from Epitech.
- The dashboard renders every project as a colored bar from its start date to
  its correction-end deadline, grouped into rows by module. Hover or focus a
  bar for its name, module, status, and dates. A table view is also
  available as an accessible alternative to the chart.
- The toolbar icon opens the same dashboard in a full tab, if you'd rather
  have it in its own window.

All data lives in the browser's local extension storage — nothing is sent
anywhere. See [PRIVACY.md](PRIVACY.md).

## Working on it

```sh
npm install
npm run build
```

Then in Chrome: `chrome://extensions` → enable **Developer mode** → **Load
unpacked** → select the `dist/` folder. Reload the extension after each
`npm run build` to pick up changes.

`dist/` is committed to the repo (not gitignored) so that downloading the
repo as a ZIP from GitHub gives a ready-to-load Chrome extension with no
build step — see the main README. Run `npm run build` after any change under
`src/` or `public/` and commit the updated `dist/` alongside it.

## Chrome vs. Firefox — how the same source ships as both

The extension is Manifest V3 on both browsers, but two things differ enough
to need per-browser handling:

- **Background script.** Chrome's MV3 service worker accepts exactly one
  script file (`background.service_worker`). Firefox still prefers the
  classic non-worker form, `background.scripts: [...]` (an ordered array,
  more broadly compatible across Firefox versions than its newer
  `service_worker` support). `background.ts` handles both from one file: it
  calls `importScripts("browser-polyfill.js")` guarded by
  `typeof importScripts === "function"` — true only in Chrome's worker
  context, where a module-type service worker *can't* call `importScripts`
  at all (hence the Chrome manifest has no `"type": "module"` on
  `background`). On Firefox, `browser-polyfill.js` is instead just listed
  ahead of `background.js` in the `scripts` array.
- **`chrome.*` vs `browser.*`.** Chrome's MV3 APIs are usable as promises
  when you omit the callback, but Firefox's `chrome.*` compatibility shim
  isn't reliably promise-based across versions. Rather than depend on that,
  every script uses Mozilla's official
  [`webextension-polyfill`](https://github.com/mozilla/webextension-polyfill),
  which normalizes everything to promises on both browsers. It's loaded as a
  plain global script (not an npm import — there's no bundler here) ahead of
  `content.js`/`background.js`/`stats.js` in the manifest/HTML, so `browser`
  is available as a global everywhere; `src/browser-global.d.ts` gives it a
  type without an actual `import` statement in the compiled output (see the
  content-script constraint below).
- **`browser_specific_settings.gecko`** — Firefox requires a stable add-on
  id to publish; it's only in `public/manifest.firefox.json`, generated once
  as a random UUID and not meaningful beyond being unique.

Everything else — the scraper, the sidebar injection, the Gantt renderer —
is unchanged between targets; only `scripts/copy-static.mjs` picks which
manifest and background wiring to assemble.

## Project layout

```
src/            TypeScript sources
  types.ts            shared ProjectRecord/ProjectStore shape
  browser-global.d.ts  types the global `browser` (webextension-polyfill) without an import
  content.ts           scraper + sidebar injection + overlay (classic script — no imports allowed)
  background.ts        opens/focuses the dashboard tab from the toolbar icon
  stats.ts             Gantt renderer, tooltip, legend, table view (ES module)
public/         static assets copied verbatim into dist/ and dist-firefox/
  manifest.json         Chrome manifest
  manifest.firefox.json Firefox manifest (renamed to manifest.json in dist-firefox/)
  stats.html, stats.css, icons/
dist/           built Chrome extension (committed — this is what "Load unpacked" points to)
dist-firefox/   built Firefox extension (committed likewise)
scripts/
  copy-static.mjs   assembles dist/ or dist-firefox/ from public/ + tsc's output + the polyfill
  package-zip.mjs   zips a dist folder for store upload
design/
  icon.svg          source for public/icons/*.png (regenerate with ImageMagick, see below)
```

`content.ts` and `background.ts` compile to classic (non-module) scripts,
since Chrome's declarative `content_scripts` — and Firefox's classic
`background.scripts` — don't support `import`/`export`. Even a type-only
import causes TypeScript to emit a stray `export {}`, so both files
intentionally duplicate a couple of small types/constants from `types.ts`
rather than importing them, and get the `browser` global via
`browser-global.d.ts` (a type-only ambient declaration, erased at compile
time — see its own comments). `stats.ts` is a real ES module and imports
from `types.ts` normally.

## Build & package

```sh
npm run build           # compile + assemble dist/ (Chrome)
npm run build:firefox    # compile + assemble dist-firefox/
npm run build:all        # both

npm run package          # build, then zip dist/ into myepitech-stats.zip
npm run package:firefox   # build:firefox, then zip dist-firefox/ into myepitech-stats-firefox.zip
npm run package:all       # both
```

To regenerate the icon PNGs from `design/icon.svg` (requires ImageMagick):

```sh
cd public/icons
for size in 16 32 48 128; do
  magick -background none ../../design/icon.svg -resize ${size}x${size} icon${size}.png
done
```

## Publishing to the Chrome Web Store

1. Run `npm run package` — this produces `myepitech-stats.zip` with
   `manifest.json` at its root, ready to upload.
2. Register a [Chrome Web Store developer account](https://chrome.google.com/webstore/devconsole)
   (one-time $5 fee, tied to your Google account) if you haven't already.
3. In the developer dashboard, **New item** → upload `myepitech-stats.zip`.
4. Fill in the store listing: description, at least one screenshot
   (1280×800 or 640×400), category (e.g. "Productivity"), and the privacy
   practices tab — link to a hosted copy of [PRIVACY.md](PRIVACY.md) (e.g.
   via GitHub Pages or a raw GitHub URL) and justify the two permissions:
   - `storage` — to save scraped projects locally between visits.
   - `tabs` — to detect/focus an already-open dashboard tab instead of
     opening duplicates.
5. Submit for review. First-time reviews commonly take a few days;
   Google may ask for narrower permission justification text before approving.

## Publishing to addons.mozilla.org (Firefox)

1. Run `npm run package:firefox` — produces `myepitech-stats-firefox.zip`.
2. Create a free [Firefox account](https://addons.mozilla.org/developers/) —
   no fee, unlike Chrome's.
3. **Submit a New Add-on** → upload the zip → choose **"On this site"**
   (listed on AMO, publicly discoverable and auto-updating) or **"On your
   own"** (self-distributed/unlisted, still signed by Mozilla but not
   listed) depending on whether you want it public.
4. Fill in the listing (same kind of info as the Chrome one) and the privacy
   policy link (same [PRIVACY.md](PRIVACY.md) works for both stores).
5. Firefox review is automated first (a source-code/permissions scan) and
   usually much faster than Chrome's; listed add-ons may still get a manual
   follow-up review.

To try it locally without publishing: `about:debugging#/runtime/this-firefox`
→ **Load Temporary Add-on** → pick `dist-firefox/manifest.json`. This only
lasts until Firefox restarts (Firefox refuses permanently-unsigned
add-ons outside of the Developer/Nightly channel), which is fine for testing
but not for daily use — for that, go through AMO (step 3), even as an
unlisted, self-distributed add-on.

This is a personal/unofficial tool, not affiliated with or endorsed by
Epitech.
