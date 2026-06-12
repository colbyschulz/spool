import { describe, it, expect } from "vitest";
import { RateLimiter } from "../src/pubmed/throttle.js";

describe("RateLimiter", () => {
  it("spaces call starts by 1/rate seconds", async () => {
    const sleeps: number[] = [];
    let clock = 0;
    const limiter = new RateLimiter(2, {
      now: () => clock,
      sleep: async (ms) => {
        sleeps.push(ms);
        clock += ms;
      },
    });
    await limiter.schedule(async () => "a");
    await limiter.schedule(async () => "b");
    await limiter.schedule(async () => "c");
    // 2/s -> 500ms spacing; first call immediate, next two each wait 500ms
    expect(sleeps).toEqual([500, 500]);
  });

  it("returns the wrapped function's value", async () => {
    const limiter = new RateLimiter(100);
    expect(await limiter.schedule(async () => 42)).toBe(42);
  });
});
