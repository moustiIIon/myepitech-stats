// Zips a per-browser dist folder for store upload — manifest.json must sit
// at the zip's root, so we archive the folder's *contents*, not the folder
// itself. Target picked via `--target=firefox` (defaults to chrome).
import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const targetArg = process.argv.find((a) => a.startsWith("--target="));
const target = targetArg ? targetArg.split("=")[1] : "chrome";
if (target !== "chrome" && target !== "firefox") {
  console.error(`Unknown target "${target}" — expected "chrome" or "firefox".`);
  process.exit(1);
}

const distDir = join(root, target === "firefox" ? "dist-firefox" : "dist");
const zipPath = join(root, target === "firefox" ? "myepitech-stats-firefox.zip" : "myepitech-stats.zip");

if (!existsSync(distDir)) {
  console.error(
    `${target === "firefox" ? "dist-firefox/" : "dist/"} not found — run \`npm run ${
      target === "firefox" ? "build:firefox" : "build"
    }\` first.`
  );
  process.exit(1);
}

if (existsSync(zipPath)) rmSync(zipPath);

execFileSync("zip", ["-r", zipPath, "."], { cwd: distDir, stdio: "inherit" });

const destination =
  target === "firefox"
    ? "https://addons.mozilla.org/developers/ (or about:debugging for a temporary local install)"
    : "the Chrome Web Store developer dashboard";
console.log(`\nWrote ${zipPath} — upload this file to ${destination}.`);
