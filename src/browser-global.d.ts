// browser-polyfill.js (Mozilla's webextension-polyfill, copied into every
// build by scripts/copy-static.mjs) is loaded as a plain global script ahead
// of every other script in both the content-script and background contexts,
// and via a <script> tag in stats.html. This makes `browser` available
// everywhere as a global WITHOUT an import statement — required for
// content.ts and background.ts, which must stay free of module syntax (see
// their own comments). `import type` is erased at compile time, so this
// adds no runtime import.
import type _browser from "webextension-polyfill";

declare global {
  const browser: typeof _browser;
  // Only real inside a service worker (Chrome's background context); the
  // "DOM" lib doesn't declare it, and pulling in the full "WebWorker" lib
  // would conflict with DOM types used elsewhere, so it's declared narrowly
  // here instead. background.ts guards every call with a typeof check.
  function importScripts(...urls: string[]): void;
}

export {};
