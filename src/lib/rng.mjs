import seedrandom from "seedrandom";
export function makeRng(seed = "sat-default") {
  const rng = seedrandom(String(seed));
  return () => rng.quick(); // 0..1
}
