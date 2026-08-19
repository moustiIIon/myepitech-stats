# MyEpitechStats — developer notes

A Chrome extension that turns your Epitech modules/projects into a Gantt-style
timeline, so you can see overlaps and plan your credit strategy — a spiritual
successor to the old *Intra Statistics* extension, rebuilt for my.epitech.eu.

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

All data lives in `chrome.storage.local` — nothing is sent anywhere. See
[PRIVACY.md](PRIVACY.md).

## Working on it

```sh
npm install
npm run build
```

Then in Chrome: `chrome://extensions` → enable **Developer mode** → **Load
unpacked** → select the `dist/` folder. Reload the extension after each
`npm run build` to pick up changes.

`dist/` is committed to the repo (not gitignored) so that downloading the
repo as a ZIP from GitHub gives a ready-to-load extension with no build step
— see the main README. Run `npm run build` after any change under `src/` or
`public/` and commit the updated `dist/` alongside it.

## Project layout

```
src/            TypeScript sources
  types.ts        shared ProjectRecord/ProjectStore shape
  content.ts       scraper + sidebar injection + overlay (classic script — no imports allowed)
  background.ts    opens/focuses the dashboard tab from the toolbar icon
  stats.ts         Gantt renderer, tooltip, legend, table view (ES module)
public/         static assets copied verbatim into dist/
  manifest.json, stats.html, stats.css, icons/
dist/           built extension (committed — this is what "Load unpacked" points to)
scripts/
  copy-static.mjs   copies public/ -> dist/ after tsc
  package-zip.mjs   zips dist/ for Chrome Web Store upload
design/
  icon.svg          source for public/icons/*.png (regenerate with ImageMagick, see below)
```

`content.ts` compiles to a classic (non-module) script, since Chrome's
declarative `content_scripts` don't support `import`/`export` — even a
type-only import causes TypeScript to emit a stray `export {}`, so that file
intentionally duplicates a couple of small types/constants from `types.ts`
rather than importing them. `background.ts` and `stats.ts` are real ES
modules and import from `types.ts` normally.

## Build & package

```sh
npm run build      # compile + copy static assets into dist/
npm run package     # build, then zip dist/ into myepitech-stats.zip
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

This is a personal/unofficial tool, not affiliated with or endorsed by
Epitech.
