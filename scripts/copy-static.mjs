// Assembles a per-browser extension folder: public/ assets + the compiled
// JS (tsc always writes to dist/, regardless of target) + the right
// manifest.json + Mozilla's webextension-polyfill, so `browser.*` works
// identically on Chrome and Firefox. Target is picked via `--target=firefox`
// (defaults to chrome). Chrome's result stays at dist/ itself — it's tsc's
// own outDir, so nothing needs copying in for it — while Firefox's result
// goes to dist-firefox/, mirroring the compiled JS in from dist/.
import { cpSync, copyFileSync, existsSync, mkdirSync, rmSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const publicDir = join(root, "public");
const tscOutDir = join(root, "dist");

const targetArg = process.argv.find((a) => a.startsWith("--target="));
const target = targetArg ? targetArg.split("=")[1] : "chrome";
if (target !== "chrome" && target !== "firefox") {
  console.error(`Unknown target "${target}" — expected "chrome" or "firefox".`);
  process.exit(1);
}

const COMPILED_FILES = ["content.js", "background.js", "stats.js", "types.js"];

let distDir;
if (target === "firefox") {
  distDir = join(root, "dist-firefox");
  if (!existsSync(tscOutDir)) {
    console.error("dist/ (tsc output) not found — this script runs after `tsc` in npm run build.");
    process.exit(1);
  }
  rmSync(distDir, { recursive: true, force: true });
  mkdirSync(distDir, { recursive: true });
  for (const file of COMPILED_FILES) {
    copyFileSync(join(tscOutDir, file), join(distDir, file));
  }
} else {
  // Chrome's target IS tsc's outDir — the compiled JS is already there.
  distDir = tscOutDir;
}

// Additive merge — must not wipe the compiled JS already sitting in distDir.
cpSync(publicDir, distDir, { recursive: true });

// public/ ships both manifest.json (Chrome) and manifest.firefox.json; keep
// only the one for this target, as manifest.json at the dist root.
if (target === "firefox") {
  unlinkSync(join(distDir, "manifest.json"));
  copyFileSync(join(distDir, "manifest.firefox.json"), join(distDir, "manifest.json"));
}
unlinkSync(join(distDir, "manifest.firefox.json"));

copyFileSync(
  join(root, "node_modules/webextension-polyfill/dist/browser-polyfill.js"),
  join(distDir, "browser-polyfill.js")
);

console.log(`Assembled ${target} extension -> ${target === "firefox" ? "dist-firefox/" : "dist/"}`);
