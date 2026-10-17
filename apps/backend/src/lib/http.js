// Small helpers so route handlers can throw typed errors and stay readable.
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function requireString(value, name, { min = 1, max = 500 } = {}) {
  if (typeof value !== 'string') throw new HttpError(400, `${name} is required`);
  const trimmed = value.trim();
  if (trimmed.length < min) throw new HttpError(400, `${name} must be at least ${min} characters`);
  if (trimmed.length > max) throw new HttpError(400, `${name} must be at most ${max} characters`);
  return trimmed;
}
