import { describe, expect, it } from "vitest";
import { RateLimiter } from "../src/auth/rate-limit.js";

describe("RateLimiter", () => {
  it("allows up to the limit inside the window, then says how long to wait", () => {
    const rl = new RateLimiter(3, 60_000);
    const t = 1_000_000;
    for (let i = 0; i < 3; i++) {
      expect(rl.retryAfter("k", t + i)).toBe(0);
      rl.hit("k", t + i);
    }
    expect(rl.retryAfter("k", t + 10)).toBe(60);
    expect(rl.retryAfter("other", t + 10)).toBe(0);
  });

  it("forgets hits once they leave the window, and on reset", () => {
    const rl = new RateLimiter(1, 1_000);
    rl.hit("k", 0);
    expect(rl.retryAfter("k", 500)).toBe(1);
    expect(rl.retryAfter("k", 1_000)).toBe(0);
    rl.hit("k", 2_000);
    rl.reset("k");
    expect(rl.retryAfter("k", 2_001)).toBe(0);
  });
});
