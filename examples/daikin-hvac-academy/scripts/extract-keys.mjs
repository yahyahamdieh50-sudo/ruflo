// Lists every t("...") key and dynamic t(`prefix.${x}`) prefix used in src/. Used to keep the i18n dictionary complete.
import fs from "node:fs";
import path from "node:path";

function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(f.name)) out.push(p);
  }
  return out;
}

export function extract(root = "src") {
  const keys = new Set(), prefixes = new Set();
  for (const file of walk(root)) {
    if (file.endsWith("i18n-dict.ts")) continue;
    const s = fs.readFileSync(file, "utf8");
    for (const m of s.matchAll(/\bt\(\s*"([\w.]+)"/g)) keys.add(m[1]);
    for (const m of s.matchAll(/\bt\(\s*`([\w.]*)\$\{/g)) prefixes.add(m[1]);
    for (const m of s.matchAll(/\bt\(\s*"([\w.]+)"\s*,/g)) keys.add(m[1]);
  }
  return { keys: [...keys].sort(), prefixes: [...prefixes].sort() };
}

if (process.argv[1].endsWith("extract-keys.mjs")) {
  const { keys, prefixes } = extract();
  console.log("STATIC KEYS (" + keys.length + "):\n" + keys.join("\n"));
  console.log("\nDYNAMIC PREFIXES:\n" + prefixes.join("\n"));
}
