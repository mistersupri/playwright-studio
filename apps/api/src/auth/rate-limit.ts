/**
 * In-memory sliding window counter. Good enough for a single API instance;
 * a multi-instance deployment would move this to Redis.
 */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  private recent(key: string, now: number) {
    const list = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (list.length) this.hits.set(key, list);
    else this.hits.delete(key);
    return list;
  }

  /** Seconds until another attempt is allowed, or 0 when one is allowed now. */
  retryAfter(key: string, now = Date.now()): number {
    const list = this.recent(key, now);
    if (list.length < this.limit) return 0;
    return Math.ceil((list[0] + this.windowMs - now) / 1000);
  }

  hit(key: string, now = Date.now()) {
    const list = this.recent(key, now);
    list.push(now);
    this.hits.set(key, list);
  }

  reset(key: string) {
    this.hits.delete(key);
  }
}
