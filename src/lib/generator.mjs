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

// Try to evaluate; if it's not a clean expression, return the literal string
function safeEvalOrLiteral(expr, scope) {
  if (typeof expr !== "string") return expr;
  // Heuristic: if it has math-y tokens, try eval; otherwise prefer literal/variable lookup
  const hasOp = /[+\-*/^()=<>]|Math\./.test(expr);
  try {
    if (hasOp) return evalExpr(expr, scope);
    if (expr in scope) return scope[expr];  // e.g., "x0"
    return expr; // "A", "x", "The value is ..." etc.
  } catch {
    return expr;
  }
}

export function generateItem(template, seed = "demo") {
  const rnd = makeRng(seed);
  const { stem, params = {}, derived = {}, constraints = [], answer, distractors = [] } = template;

  const MAX_TRIES = 250;
  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    // 1) sample params
    const P = {};
    for (const [k, spec] of Object.entries(params)) P[k] = pick(spec, rnd);

    // 2) compute derived (tolerant: if eval fails, keep the original string)
    const D = {};
    let derivedOk = true;
    for (const [k, expr] of Object.entries(derived)) {
      try { D[k] = evalExpr(expr, { ...P, ...D }); }
      catch { derivedOk = false; break; }
    }
    if (!derivedOk) continue; // resample

    // 3) enforce constraints (tolerant: if a constraint throws, treat as unsatisfied and resample)
    let ok = true;
    for (const c of constraints) {
      try {
        if (!evalExpr(c, { ...P, ...D })) { ok = false; break; }
      } catch {
        ok = false; break;
      }
    }
    if (!ok) continue; // resample

    // 4) compute answer/distractors (fall back to literal strings if not expressions)
    const ansVal = safeEvalOrLiteral(answer, { ...P, ...D });
    const opts = [];
    for (const d of distractors) {
      const v = safeEvalOrLiteral(d, { ...P, ...D, ans: ansVal });
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
