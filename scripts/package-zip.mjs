// Zips dist/ for Chrome Web Store upload — manifest.json must sit at the
// zip's root, so we archive dist/'s *contents*, not the dist/ folder itself.
import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const distDir = join(root, "dist");
const zipPath = join(root, "myepitech-stats.zip");

if (!existsSync(distDir)) {
  console.error("dist/ not found — run `npm run build` first.");
  process.exit(1);
}

if (existsSync(zipPath)) rmSync(zipPath);

execFileSync("zip", ["-r", zipPath, "."], { cwd: distDir, stdio: "inherit" });
console.log(`\nWrote ${zipPath} — upload this file to the Chrome Web Store developer dashboard.`);
