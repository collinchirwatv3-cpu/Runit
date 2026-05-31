/**
 * Simple in-memory rate limiter for Vercel serverless functions.
 * Each function instance has its own store — good enough to stop
 * basic abuse without needing an external Redis/Upstash dependency.
 */
const store = new Map();

/**
 * @param {string} ip       - Caller's IP address
 * @param {string} key      - Route identifier (e.g. 'charge-card')
 * @param {number} max      - Max requests allowed in the window
 * @param {number} windowMs - Window length in milliseconds
 * @returns {{ allowed: boolean, remaining: number, retryAfterSec: number }}
 */
module.exports = function rateLimit(ip, key, max = 10, windowMs = 60_000) {
  const now   = Date.now();
  const id    = `${ip}:${key}`;
  let entry   = store.get(id);

  if (!entry || now > entry.resetAt) {
    entry = { count: 1, resetAt: now + windowMs };
  } else {
    entry.count++;
  }
  store.set(id, entry);

  // Prune stale entries so the Map doesn't grow unbounded
  if (store.size > 5_000) {
    for (const [k, v] of store) {
      if (now > v.resetAt) store.delete(k);
    }
  }

  return {
    allowed:        entry.count <= max,
    remaining:      Math.max(0, max - entry.count),
    retryAfterSec:  Math.ceil((entry.resetAt - now) / 1000),
  };
};
