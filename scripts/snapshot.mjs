import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateItem } from "../src/lib/generator.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");
const banks = Object.fromEntries(
  fs.readdirSync(dataDir)
    .filter(f => f.endsWith(".json"))
    .map(f => [f, JSON.parse(fs.readFileSync(path.join(dataDir, f), "utf8"))])
);

const seed = new Date().toISOString().slice(0,10);
const samplePerFile = 5;
const out = [];

for (const [name, items] of Object.entries(banks)) {
  const pick = items.slice(0, samplePerFile);
  for (const it of pick) {
    try {
      const g = generateItem(it.template, `${seed}-${it.id}`);
      out.push({ file: name, id: it.id, stem: g.stem, answer: g.answer, distractors: g.distractors });
    } catch (e) {
      out.push({ file: name, id: it.id, error: String(e.message || e) });
    }
  }
}

fs.writeFileSync(path.join(__dirname, "..", "SNAPSHOT.json"), JSON.stringify(out, null, 2));
console.log("Wrote SNAPSHOT.json");
