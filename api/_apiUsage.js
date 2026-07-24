const DEFAULT_LIMIT = 1000;
const ADMIN_USAGE_PASSWORD = 'eito';
const DEFAULT_ADMIN_PASSWORD = ADMIN_USAGE_PASSWORD;
const {
  incrementApiUsageCounter,
  readApiUsageCounters,
} = require('./_firebaseRealtime');

const counters = {
  hotpepper: 0,
  geoapify: 0,
  google_places: 0,
};

const CENTRAL_USAGE_TIMEOUT_MS = 1200;

const asLimit = (value, fallback = DEFAULT_LIMIT) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

const limits = () => ({
  hotpepper: asLimit(process.env.RANDISH_HOTPEPPER_API_LIMIT),
  geoapify: asLimit(process.env.RANDISH_GEOAPIFY_API_LIMIT),
  google_places: asLimit(process.env.RANDISH_GOOGLE_PLACES_API_LIMIT || process.env.GOOGLE_PLACES_API_LIMIT),
});

const normalizedUsageCount = (count = 1) =>
  Math.max(1, Math.floor(Number(count) || 1));

const incrementLocalApiUsage = (key, count = 1) => {
  if (!Object.prototype.hasOwnProperty.call(counters, key)) {
    return false;
  }
  counters[key] += normalizedUsageCount(count);
  return true;
};

const incrementPersistentApiUsage = async (key, count = 1) => {
  if (!Object.prototype.hasOwnProperty.call(counters, key)) {
    return false;
  }
  try {
    await incrementApiUsageCounter(key, count);
    return true;
  } catch {
    return false;
  }
};

const usageSecret = () =>
  process.env.RANDISH_USAGE_SECRET
  || process.env.RANDISH_ADMIN_PASSWORD
  || DEFAULT_ADMIN_PASSWORD;

const centralUsageUrl = () => {
  if (process.env.RANDISH_USAGE_COUNTER_URL) {
    return process.env.RANDISH_USAGE_COUNTER_URL;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/^https?:\/\//, '').replace(/\/+$/, '')}/api/admin/api-usage`;
  }
  return null;
};

const postCentralApiUsage = async (key, count) => {
  const url = centralUsageUrl();
  if (!url) {
    return;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CENTRAL_USAGE_TIMEOUT_MS);
  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Randish-Usage-Secret': usageSecret(),
      },
      body: JSON.stringify({ key, count: normalizedUsageCount(count) }),
      signal: controller.signal,
    });
  } catch {
    // Keep the user-facing API healthy even if the demo usage counter is unavailable.
  } finally {
    clearTimeout(timeout);
  }
};

const incrementApiUsage = async (key, count = 1) => {
  const incremented = incrementLocalApiUsage(key, count);
  if (!incremented) {
    return;
  }
  await postCentralApiUsage(key, count);
};

const readPersistentCounters = async () => {
  try {
    return await readApiUsageCounters();
  } catch {
    return {};
  }
};

const providerSnapshot = (key, name, available = true, persistentCounters = {}) => {
  const providerLimits = limits();
  const used = Math.max(counters[key] ?? 0, persistentCounters[key] ?? 0);
  const limit = Math.max(1, providerLimits[key] ?? DEFAULT_LIMIT);
  return {
    key,
    name,
    used,
    limit,
    remaining: Math.max(0, limit - used),
    display: `${used}/${limit}`,
    available,
  };
};

const apiUsageSnapshot = async ({ googleAvailable = true, hotPepperAvailable = true, geoapifyAvailable = true } = {}) => {
  const persistentCounters = await readPersistentCounters();
  return {
    generatedAt: new Date().toISOString(),
    providers: [
      providerSnapshot('hotpepper', 'Hot Pepper', hotPepperAvailable, persistentCounters),
      providerSnapshot('geoapify', 'Geoapify', geoapifyAvailable, persistentCounters),
      providerSnapshot('google_places', 'Google Places', googleAvailable, persistentCounters),
    ],
  };
};

const verifyAdminPassword = (req) => {
  const received = req.headers?.['x-randish-admin-password']
    || req.headers?.['X-Randish-Admin-Password']
    || req.query?.password;
  return String(received ?? '').trim() === ADMIN_USAGE_PASSWORD;
};

const verifyUsageSecret = (req) => {
  const received = req.headers?.['x-randish-usage-secret']
    || req.headers?.['X-Randish-Usage-Secret'];
  return String(received ?? '').trim() === usageSecret();
};

module.exports = {
  apiUsageSnapshot,
  incrementLocalApiUsage,
  incrementPersistentApiUsage,
  incrementApiUsage,
  verifyAdminPassword,
  verifyUsageSecret,
};
