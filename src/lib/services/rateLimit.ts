/**
 * Fixed-window, in-memory rate limiter. Per instance: good enough to stop runaway LLM
 * spend from one tab. With several instances, the effective limit is per instance.
 */
const buckets = new Map<string, { windowStart: number; count: number }>();

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart >= windowMs) {
    buckets.set(key, { windowStart: now, count: 1 });
    if (buckets.size > 10_000) sweep(windowMs, now);
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count++;
  return true;
}

function sweep(windowMs: number, now: number) {
  for (const [key, b] of buckets) if (now - b.windowStart >= windowMs) buckets.delete(key);
}
