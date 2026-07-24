const crypto = require('crypto');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REALTIME_DATABASE_SCOPE = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/firebase.database',
].join(' ');
const MAX_TEXT_LENGTH = 500;
const MAX_PROFILE_IMAGE_DATA_URL_LENGTH = 750000;

let tokenCache = null;

const clampText = (value, fallback = '') =>
  typeof value === 'string' && value.trim()
    ? value.trim().slice(0, MAX_TEXT_LENGTH)
    : fallback;

const readEnvText = (value, fallback = '') =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback;

const safeDatabaseKey = (value, fallback = 'unknown') => {
  const clean = clampText(value, fallback)
    .normalize('NFKC')
    .replace(/[.#$\/\[\]\u0000-\u001f\u007f]/g, '_')
    .replace(/[^A-Za-z0-9._~-]/g, '_')
    .replace(/[.]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 120);
  return clean || fallback;
};

const base64Url = (value) =>
  Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

const normalizePrivateKey = (value) =>
  readEnvText(value).replace(/\\n/g, '\n');

const serviceAccountFromEnv = () => {
  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (encoded) {
    try {
      const parsed = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
      return {
        projectId: clampText(parsed.project_id),
        clientEmail: clampText(parsed.client_email),
        privateKey: normalizePrivateKey(parsed.private_key),
      };
    } catch {
      return null;
    }
  }

  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (json) {
    try {
      const parsed = JSON.parse(json);
      return {
        projectId: clampText(parsed.project_id),
        clientEmail: clampText(parsed.client_email),
        privateKey: normalizePrivateKey(parsed.private_key),
      };
    } catch {
      return null;
    }
  }

  return {
    projectId: clampText(process.env.FIREBASE_PROJECT_ID),
    clientEmail: clampText(process.env.FIREBASE_CLIENT_EMAIL),
    privateKey: normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY),
  };
};

const getServiceAccount = () => {
  const account = serviceAccountFromEnv();
  if (!account?.projectId || !account?.clientEmail || !account?.privateKey) {
    return null;
  }
  return account;
};

const getDatabaseUrl = () => {
  const configured = readEnvText(process.env.FIREBASE_DATABASE_URL)
    || readEnvText(process.env.FIREBASE_REALTIME_DATABASE_URL);
  if (!configured) {
    return null;
  }
  return configured.replace(/\/+$/, '');
};

const isRealtimeDatabaseConfigured = () => Boolean(getDatabaseUrl() && getServiceAccount());

const realtimeDatabaseDiagnostics = () => {
  const hasDatabaseUrl = Boolean(getDatabaseUrl());
  const hasServiceAccount = Boolean(getServiceAccount());
  const missing = [
    ...(!hasDatabaseUrl ? ['FIREBASE_DATABASE_URL'] : []),
    ...(!hasServiceAccount ? ['FIREBASE_SERVICE_ACCOUNT_BASE64'] : []),
  ];
  return {
    available: hasDatabaseUrl && hasServiceAccount,
    hasDatabaseUrl,
    hasServiceAccount,
    missing,
  };
};

const createJwtAssertion = (account) => {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64Url(JSON.stringify({
    iss: account.clientEmail,
    scope: REALTIME_DATABASE_SCOPE,
    aud: TOKEN_URL,
    exp: nowSeconds + 3600,
    iat: nowSeconds,
  }));
  const unsigned = `${header}.${payload}`;
  const signature = crypto
    .createSign('RSA-SHA256')
    .update(unsigned)
    .sign(account.privateKey, 'base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${unsigned}.${signature}`;
};

const getAccessToken = async () => {
  const account = getServiceAccount();
  if (!account) {
    return null;
  }
  if (tokenCache && tokenCache.expiresAtMs - Date.now() > 60_000) {
    return tokenCache.accessToken;
  }

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: createJwtAssertion(account),
  });
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) {
    throw new Error(`Firebase token request failed: ${response.status}`);
  }
  const data = await response.json();
  tokenCache = {
    accessToken: data.access_token,
    expiresAtMs: Date.now() + Math.max(60, Number(data.expires_in) || 3600) * 1000,
  };
  return tokenCache.accessToken;
};

const encodePath = (path) =>
  String(path).split('/').map((part) => encodeURIComponent(part)).join('/');

const databaseFetch = async (path, options = {}) => {
  const databaseUrl = getDatabaseUrl();
  const accessToken = await getAccessToken();
  if (!databaseUrl || !accessToken) {
    return null;
  }
  const joiner = options.query ? '&' : '?';
  const response = await fetch(
    `${databaseUrl}/${encodePath(path)}.json${options.query ?? ''}${joiner}access_token=${encodeURIComponent(accessToken)}`,
    {
      method: options.method ?? 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: options.body ? JSON.stringify(options.body) : undefined,
    },
  );
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Realtime Database request failed: ${response.status}`);
  }
  if (response.status === 204) {
    return null;
  }
  return response.json();
};

const readApiUsageCounters = async () => {
  const diagnostics = realtimeDatabaseDiagnostics();
  if (!diagnostics.available) {
    return {};
  }

  const data = await databaseFetch('api_usage');
  if (!data || typeof data !== 'object') {
    return {};
  }

  return Object.fromEntries(
    Object.entries(data)
      .map(([key, value]) => [key, Math.max(0, Math.floor(Number(value?.used) || 0))])
      .filter(([key]) => Boolean(key)),
  );
};

const incrementApiUsageCounter = async (key, count = 1) => {
  const diagnostics = realtimeDatabaseDiagnostics();
  if (!diagnostics.available) {
    return {
      persisted: false,
      reason: 'realtime_database_not_configured',
      missingConfig: diagnostics.missing,
    };
  }

  const normalizedKey = safeDatabaseKey(key, 'unknown');
  const increment = Math.max(1, Math.floor(Number(count) || 1));
  const now = new Date().toISOString();
  const existing = await databaseFetch(`api_usage/${normalizedKey}`);
  const used = Math.max(0, Math.floor(Number(existing?.used) || 0)) + increment;

  await databaseFetch(`api_usage/${normalizedKey}`, {
    method: 'PATCH',
    body: {
      key: clampText(key, normalizedKey),
      used,
      lastIncrement: increment,
      lastIncrementAt: now,
      updatedAt: now,
      firstSeenAt: existing?.firstSeenAt || now,
    },
  });

  return { persisted: true, used };
};

const inferUsername = (userId, username) => {
  const explicit = clampText(username);
  if (explicit) {
    return explicit;
  }
  const cleanUserId = clampText(userId);
  if (cleanUserId.startsWith('demo-')) {
    return cleanUserId.slice(5);
  }
  return '';
};

const toNullableInteger = (value) =>
  Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value))) : null;

const toMoneyInteger = (value) =>
  Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value))) : 0;

const estimateUnitPrice = (input = {}) => {
  const explicit = toNullableInteger(input.unitPrice ?? input.unit_price);
  if (explicit != null) {
    return explicit;
  }
  const min = toNullableInteger(input.budgetMin ?? input.budget_min);
  const max = toNullableInteger(input.budgetMax ?? input.budget_max);
  if (min != null || max != null) {
    return Math.round(((min ?? max ?? 0) + (max ?? min ?? 0)) / 2);
  }
  return 0;
};

const normalizeProfileImageDataUrl = (value) => {
  if (value == null) {
    return null;
  }
  if (typeof value !== 'string') {
    return undefined;
  }
  const clean = value.trim();
  if (!clean) {
    return null;
  }
  if (clean.length > MAX_PROFILE_IMAGE_DATA_URL_LENGTH) {
    return undefined;
  }
  if (!/^data:image\/(?:jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=\r\n]+$/i.test(clean)) {
    return undefined;
  }
  return clean.replace(/\s+/g, '');
};

const publicUserProfile = (data, fallbackUserId = 'guest') => {
  if (!data || typeof data !== 'object') {
    return null;
  }
  return {
    userId: clampText(data.userId, fallbackUserId),
    username: clampText(data.username),
    displayName: clampText(data.displayName, data.username || fallbackUserId),
    authType: clampText(data.authType),
    profileImageDataUrl: normalizeProfileImageDataUrl(data.profileImageDataUrl) || null,
    firstSeenAt: clampText(data.firstSeenAt),
    lastSeenAt: clampText(data.lastSeenAt),
    lastProfileUpdatedAt: clampText(data.lastProfileUpdatedAt),
    profileImageUpdatedAt: clampText(data.profileImageUpdatedAt),
  };
};

const buildAnalyticsBase = ({ userId, username, displayName, authType, existing, now }) => ({
  userId,
  user_name: displayName,
  username,
  authType,
  firstSeenAt: existing?.firstSeenAt || now,
  updatedAt: now,
});

const updateAnalyticsUserProfile = async ({ userKey, userId, username, displayName, authType, now }) => {
  const existing = await databaseFetch(`analytics/${userKey}`);
  const body = {
    ...buildAnalyticsBase({ userId, username, displayName, authType, existing, now }),
    favorite_shop: clampText(existing?.favorite_shop),
    favorite_shop_count: Math.max(0, Math.floor(Number(existing?.favorite_shop_count) || 0)),
    lottery_count: Math.max(0, Math.floor(Number(existing?.lottery_count) || 0)),
    food_expenses: toMoneyInteger(existing?.food_expenses),
    keep_shop: Math.max(0, Math.floor(Number(existing?.keep_shop) || 0)),
    keep_shop_count: Math.max(0, Math.floor(Number(existing?.keep_shop_count ?? existing?.keep_shop) || 0)),
    unit_price: toMoneyInteger(existing?.unit_price),
  };

  await databaseFetch(`analytics/${userKey}`, {
    method: 'PATCH',
    body,
  });
  return body;
};

const updateAnalyticsForDraw = async ({ userKey, userId, username, displayName, authType, input, now }) => {
  const existing = await databaseFetch(`analytics/${userKey}`);
  const lotteryCount = Math.max(0, Math.floor(Number(existing?.lottery_count) || 0)) + 1;
  const unitPriceForDraw = estimateUnitPrice(input);
  const foodExpenses = toMoneyInteger(existing?.food_expenses) + unitPriceForDraw;
  const unitPrice = lotteryCount > 0 ? Math.round(foodExpenses / lotteryCount) : 0;
  const body = {
    ...buildAnalyticsBase({ userId, username, displayName, authType, existing, now }),
    favorite_shop: clampText(existing?.favorite_shop),
    favorite_shop_count: Math.max(0, Math.floor(Number(existing?.favorite_shop_count) || 0)),
    lottery_count: lotteryCount,
    food_expenses: foodExpenses,
    keep_shop: Math.max(0, Math.floor(Number(existing?.keep_shop) || 0)),
    keep_shop_count: Math.max(0, Math.floor(Number(existing?.keep_shop_count ?? existing?.keep_shop) || 0)),
    unit_price: unitPrice,
    last_unit_price: unitPriceForDraw,
    last_lottery_shop: clampText(input.selectedRestaurantName),
    last_lottery_shop_id: clampText(input.selectedRestaurantId),
    last_lottery_at: now,
  };

  await databaseFetch(`analytics/${userKey}`, {
    method: 'PATCH',
    body,
  });
  return body;
};

const recordFavoriteAnalytics = async (input = {}) => {
  const diagnostics = realtimeDatabaseDiagnostics();
  if (!diagnostics.available) {
    return {
      logged: false,
      reason: 'realtime_database_not_configured',
      missingConfig: diagnostics.missing,
    };
  }

  const now = new Date().toISOString();
  const userId = clampText(input.userId, 'guest');
  const username = inferUsername(userId, input.username);
  const displayName = clampText(input.displayName, username || userId);
  const authType = clampText(input.authType, userId === 'guest' ? 'guest' : 'demo');
  const userKey = safeDatabaseKey(userId, 'guest');
  const existing = await databaseFetch(`analytics/${userKey}`);
  const keepShopCount = Math.max(0, Math.floor(Number(existing?.keep_shop_count ?? existing?.keep_shop) || 0)) + 1;
  const favoriteShopCount = Math.max(0, Math.floor(Number(existing?.favorite_shop_count) || 0)) + 1;
  const favoriteShop = clampText(
    input.shopName
      || input.restaurantName
      || input.selectedRestaurantName
      || input.providerPlaceId
      || input.restaurantId,
  );
  const body = {
    ...buildAnalyticsBase({ userId, username, displayName, authType, existing, now }),
    favorite_shop: favoriteShop,
    favorite_shop_count: favoriteShopCount,
    lottery_count: Math.max(0, Math.floor(Number(existing?.lottery_count) || 0)),
    food_expenses: toMoneyInteger(existing?.food_expenses),
    keep_shop: keepShopCount,
    keep_shop_count: keepShopCount,
    unit_price: toMoneyInteger(existing?.unit_price),
    last_keep_shop: favoriteShop,
    last_keep_shop_id: clampText(input.restaurantId || input.providerPlaceId || input.selectedRestaurantId),
    last_keep_provider: clampText(input.provider || input.selectedProvider),
    last_keep_at: now,
  };

  await databaseFetch(`analytics/${userKey}`, {
    method: 'PATCH',
    body,
  });

  return { logged: true, analytics: body };
};

const readAnalyticsSummary = async (userId) => {
  const diagnostics = realtimeDatabaseDiagnostics();
  if (!diagnostics.available) {
    return {
      found: false,
      reason: 'realtime_database_not_configured',
      missingConfig: diagnostics.missing,
    };
  }

  const cleanUserId = clampText(userId, 'guest');
  const userKey = safeDatabaseKey(cleanUserId, 'guest');
  const data = await databaseFetch(`analytics/${userKey}`);
  return {
    found: Boolean(data),
    analytics: data && typeof data === 'object' ? data : null,
  };
};

const recordDrawLog = async (input = {}) => {
  const diagnostics = realtimeDatabaseDiagnostics();
  if (!diagnostics.available) {
    return {
      logged: false,
      reason: 'realtime_database_not_configured',
      missingConfig: diagnostics.missing,
    };
  }

  const now = new Date().toISOString();
  const userId = clampText(input.userId, 'guest');
  const username = inferUsername(userId, input.username);
  const displayName = clampText(input.displayName, username || userId);
  const authType = clampText(input.authType, userId === 'guest' ? 'guest' : 'demo');
  const userKey = safeDatabaseKey(userId, 'guest');
  const existingUser = await databaseFetch(`users/${userKey}`);
  const nextDrawCount = Math.max(0, Number(existingUser?.drawCount) || 0) + 1;

  await databaseFetch(`users/${userKey}`, {
    method: 'PATCH',
    body: {
      userId,
      username,
      displayName,
      authType,
      firstSeenAt: existingUser?.firstSeenAt || now,
      lastSeenAt: now,
      drawCount: nextDrawCount,
    },
  });

  const logId = safeDatabaseKey(`${Date.now()}-${crypto.randomUUID()}`, 'draw-log');
  await databaseFetch(`draw_logs/${logId}`, {
    method: 'PUT',
    body: {
      userId,
      username,
      displayName,
      authType,
      area: clampText(input.area),
      genre: clampText(input.genre),
      radiusMeters: toNullableInteger(input.radiusMeters),
      candidateCount: toNullableInteger(input.candidateCount),
      drawMode: clampText(input.drawMode),
      selectedRestaurantId: clampText(input.selectedRestaurantId),
      selectedRestaurantName: clampText(input.selectedRestaurantName),
      selectedProvider: clampText(input.selectedProvider),
      selectedSource: clampText(input.selectedSource),
      budgetMin: toNullableInteger(input.budgetMin),
      budgetMax: toNullableInteger(input.budgetMax),
      unitPrice: estimateUnitPrice(input),
      createdAt: now,
      day: now.slice(0, 10),
    },
  });

  const analytics = await updateAnalyticsForDraw({ userKey, userId, username, displayName, authType, input, now });

  return { logged: true, analytics };
};

const updateUserProfile = async (input = {}) => {
  const diagnostics = realtimeDatabaseDiagnostics();
  if (!diagnostics.available) {
    return {
      updated: false,
      reason: 'realtime_database_not_configured',
      missingConfig: diagnostics.missing,
    };
  }

  const now = new Date().toISOString();
  const userId = clampText(input.userId, 'guest');
  const username = inferUsername(userId, input.username);
  const displayName = clampText(input.displayName, username || userId);
  const authType = clampText(input.authType, userId === 'guest' ? 'guest' : 'demo');
  const userKey = safeDatabaseKey(userId, 'guest');
  const existingUser = await databaseFetch(`users/${userKey}`);
  const hasProfileImageDataUrl = Object.prototype.hasOwnProperty.call(input, 'profileImageDataUrl');
  const profileImageDataUrl = hasProfileImageDataUrl
    ? normalizeProfileImageDataUrl(input.profileImageDataUrl)
    : undefined;
  if (hasProfileImageDataUrl && profileImageDataUrl === undefined) {
    return {
      updated: false,
      reason: 'invalid_profile_image',
    };
  }

  const body = {
    userId,
    username,
    displayName,
    authType,
    firstSeenAt: existingUser?.firstSeenAt || now,
    lastSeenAt: now,
    lastProfileUpdatedAt: now,
    drawCount: Math.max(0, Number(existingUser?.drawCount) || 0),
  };
  if (hasProfileImageDataUrl) {
    body.profileImageDataUrl = profileImageDataUrl;
    body.profileImageUpdatedAt = now;
  }

  await databaseFetch(`users/${userKey}`, {
    method: 'PATCH',
    body,
  });

  await updateAnalyticsUserProfile({ userKey, userId, username, displayName, authType, now });

  return { updated: true, profile: publicUserProfile({ ...existingUser, ...body }, userId) };
};

const readUserProfile = async (userId) => {
  const diagnostics = realtimeDatabaseDiagnostics();
  if (!diagnostics.available) {
    return {
      found: false,
      reason: 'realtime_database_not_configured',
      missingConfig: diagnostics.missing,
    };
  }

  const cleanUserId = clampText(userId, 'guest');
  const userKey = safeDatabaseKey(cleanUserId, 'guest');
  const data = await databaseFetch(`users/${userKey}`);
  return {
    found: Boolean(data),
    profile: publicUserProfile(data, cleanUserId),
  };
};

module.exports = {
  incrementApiUsageCounter,
  isRealtimeDatabaseConfigured,
  readApiUsageCounters,
  readAnalyticsSummary,
  recordDrawLog,
  recordFavoriteAnalytics,
  realtimeDatabaseDiagnostics,
  readUserProfile,
  safeDatabaseKey,
  updateUserProfile,
};
