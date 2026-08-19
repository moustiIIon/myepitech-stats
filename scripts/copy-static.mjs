import { cpSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const publicDir = join(root, "public");
const distDir = join(root, "dist");

mkdirSync(distDir, { recursive: true });
cpSync(publicDir, distDir, { recursive: true });

console.log("Copied public/ -> dist/");
