import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateItem } from "../src/lib/generator.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const FILES = [
  "MASTER_HOA_SAT.json",
  "MASTER_PAM_SAT.json",
  "MASTER_PSDA_SAT.json",
  "MASTER_GEOT_SAT.json",
];

let total = 0, ok = 0;
const errors = [];

for (const f of FILES) {
  const p = path.join(DATA_DIR, f);
  const arr = JSON.parse(fs.readFileSync(p, "utf8"));
  for (const item of arr) {
    total++;
    try {
      if (!item.template || !item.template.stem) throw new Error("missing template.stem");
      // Try a couple seeds to catch edge cases
      generateItem(item.template, item.id || "seedA");
      generateItem(item.template, (item.id || "seedB") + "-B");
      ok++;
    } catch (e) {
      errors.push({ id: item.id, file: f, err: String(e.message || e) });
    }
  }
}

if (errors.length) {
  console.error("❌ Validation failed.");
  for (const e of errors.slice(0, 50)) {
    console.error(`- [${e.file}] ${e.id || "<no id>"} → ${e.err}`);
  }
  console.error(`\n${ok}/${total} passed; ${errors.length} failed.`);
  process.exit(1);
} else {
  console.log(`✅ All good: ${ok}/${total} templates validated.`);
}
