// Brute-force protection: too many failures for one key (an email and address, a user, an address) lock it briefly.
// In memory, which is right for one server process; it resets when the site restarts.
const MAX_FAILURES = 5;
const LOCK_MS = 10 * 60 * 1000;

export function createLoginThrottle(now = () => Date.now(), maxFailures = MAX_FAILURES) {
  const failures = new Map();
  const live = (key) => {
    const entry = failures.get(key);
    if (entry && entry.until <= now() && entry.count >= maxFailures) failures.delete(key);
    return failures.get(key);
  };
  return {
    isLocked: (key) => (live(key)?.count ?? 0) >= maxFailures,
    fail(key) {
      const entry = live(key) ?? { count: 0 };
      failures.set(key, { count: entry.count + 1, until: now() + LOCK_MS });
    },
    clear: (key) => failures.delete(key),
  };
}
