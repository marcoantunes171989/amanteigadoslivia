const attempts = new Map();

function clientKey(request, extra = '') {
  const forwarded = String(request?.headers?.['x-forwarded-for'] || '')
    .split(',')[0]
    .trim();
  const ip = forwarded || request?.socket?.remoteAddress || 'unknown';
  return `${ip}|${extra}`;
}

export function assertLoginRateLimit(request, email, {
  windowMs = 15 * 60 * 1000,
  maxAttempts = 20,
  now = Date.now(),
} = {}) {
  const key = clientKey(request, String(email || '').toLowerCase());
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  current.count += 1;
  if (current.count > maxAttempts) {
    const error = new Error('rate_limited');
    error.status = 429;
    error.code = 'rate_limited';
    throw error;
  }
}

export function assertPublicFormRateLimit(request, extra = 'encomenda', {
  windowMs = 15 * 60 * 1000,
  maxAttempts = 8,
  now = Date.now(),
} = {}) {
  const key = clientKey(request, extra);
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  current.count += 1;
  if (current.count > maxAttempts) {
    const error = new Error('rate_limited');
    error.status = 429;
    error.code = 'rate_limited';
    throw error;
  }
}

export function resetLoginRateLimitForTests() {
  attempts.clear();
}
