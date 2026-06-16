import { describe, it, expect } from "vitest";
import { nextInt, nextFloat, type RngState } from "../src/rng.js";

describe("seeded rng", () => {
  it("is deterministic for the same seed", () => {
    const a: RngState = { seed: 12345 };
    const b: RngState = { seed: 12345 };
    const r1 = nextInt(a, 0, 100);
    const r2 = nextInt(b, 0, 100);
    expect(r1.value).toBe(r2.value);
    expect(r1.state.seed).toBe(r2.state.seed);
  });

  it("advances state so successive calls differ", () => {
    let s: RngState = { seed: 1 };
    const first = nextInt(s, 0, 1_000_000);
    s = first.state;
    const second = nextInt(s, 0, 1_000_000);
    expect(first.value).not.toBe(second.value);
  });

  it("nextInt stays within [min, max] inclusive", () => {
    let s: RngState = { seed: 999 };
    for (let i = 0; i < 500; i++) {
      const r = nextInt(s, 5, 10);
      expect(r.value).toBeGreaterThanOrEqual(5);
      expect(r.value).toBeLessThanOrEqual(10);
      s = r.state;
    }
  });

  it("nextFloat is in [0,1)", () => {
    const r = nextFloat({ seed: 42 });
    expect(r.value).toBeGreaterThanOrEqual(0);
    expect(r.value).toBeLessThan(1);
  });
});
