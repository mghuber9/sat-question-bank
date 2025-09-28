import seedrandom from "seedrandom";
import { evalExpr } from "./eval.mjs";

function makeRng(seed) { const r = seedrandom(String(seed)); return () => r.quick(); }

function pick(spec, rnd) {
  if (!spec) throw new Error("Bad param spec");
  if (Array.isArray(spec.values)) {
    const arr = spec.values;
    return arr[Math.floor(rnd() * arr.length)];
  }
  const min = spec.min ?? 0, max = spec.max ?? min;
  const exclude = new Set(spec.exclude || []);
  const isInt = Number.isInteger(min) && Number.isInteger(max);
  for (let i = 0; i < 400; i++) {
    const v = isInt ? Math.floor(min + rnd() * (max - min + 1))
                    : (min + rnd() * (max - min));
    if (!exclude.has(v)) return v;
  }
  throw new Error("Could not sample param (too restrictive).");
}

export function renderStem(stem, vars) {
  return stem.replace(/\{\{\s*([a-zA-Z_]\w*)\s*\}\}/g, (_, k) =>
    (k in vars ? String(vars[k]) : `{{${k}}}`)
  );
}

export function generateItem(template, seed = "demo") {
  const rnd = makeRng(seed);
  const { stem, params = {}, derived = {}, constraints = [], answer, distractors = [] } = template;

  const MAX_TRIES = 250;
  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    // 1) sample params
    const P = {};
    for (const [k, spec] of Object.entries(params)) P[k] = pick(spec, rnd);

    // 2) compute derived
    const D = {};
    for (const [k, expr] of Object.entries(derived)) D[k] = evalExpr(expr, { ...P, ...D });

    // 3) enforce constraints
    let ok = true;
    for (const c of constraints) {
      if (!evalExpr(c, { ...P, ...D })) { ok = false; break; }
    }
    if (!ok) continue; // resample

    // 4) compute answer/distractors
    const ansVal = typeof answer === "string" ? evalExpr(answer, { ...P, ...D }) : answer;

    const opts = [];
    for (const d of distractors) {
      const v = typeof d === "string" ? evalExpr(d, { ...P, ...D, ans: ansVal }) : d;
      if (String(v) !== String(ansVal)) opts.push(v);
    }

    return {
      stem: renderStem(stem, { ...P, ...D }),
      params: P, derived: D,
      answer: ansVal, distractors: opts
    };
  }
  throw new Error("Constraint not satisfiable after multiple attempts");
}
