/** Serializable RNG state. `seed` is the full mutable internal state. */
export interface RngState {
  seed: number;
}

export interface RngResult<T> {
  value: T;
  state: RngState;
}

/** mulberry32 — small, fast, deterministic. */
function step(seed: number): { next: number; raw: number } {
  let t = (seed + 0x6d2b79f5) | 0;
  let x = t;
  x = Math.imul(x ^ (x >>> 15), x | 1);
  x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
  const raw = ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  return { next: t, raw };
}

export function nextFloat(state: RngState): RngResult<number> {
  const { next, raw } = step(state.seed);
  return { value: raw, state: { seed: next } };
}

/** Inclusive integer in [min, max]. */
export function nextInt(state: RngState, min: number, max: number): RngResult<number> {
  const { value, state: s } = nextFloat(state);
  const span = max - min + 1;
  return { value: min + Math.floor(value * span), state: s };
}
