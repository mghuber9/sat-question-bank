const SAFE = new Set(Object.getOwnPropertyNames(Math));
export function evalExpr(expr, scope) {
  // Only expose Math + your variables
  const keys = ["Math", ...Object.keys(scope)];
  const vals = [Math, ...Object.values(scope)];
  // Quick guardrails
  if (/[;{}[\]]|new|function|=>|process|global|window/i.test(expr)) {
    throw new Error("Unsafe expression blocked: " + expr);
  }
  const body = `"use strict"; return (${expr});`;
  return Function(...keys, body)(...vals);
}
