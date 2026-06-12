interface Clock {
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/** Spaces call starts so at most `ratePerSec` begin per second (NCBI E-utilities policy). */
export class RateLimiter {
  private nextSlot = 0;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly ratePerSec: number,
    clock: Clock = {},
  ) {
    this.now = clock.now ?? (() => Date.now());
    this.sleep = clock.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async schedule<T>(fn: () => Promise<T>): Promise<T> {
    const interval = 1000 / this.ratePerSec;
    const now = this.now();
    const start = Math.max(now, this.nextSlot);
    this.nextSlot = start + interval;
    if (start > now) await this.sleep(start - now);
    return fn();
  }
}
