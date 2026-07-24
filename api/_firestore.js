const crypto = require('crypto');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FIRESTORE_SCOPE = 'https://www.googleapis.com/auth/datastore';
const MAX_TEXT_LENGTH = 500;

let tokenCache = null;

const clampText = (value, fallback = '') =>
  typeof value === 'string' && value.trim()
    ? value.trim().slice(0, MAX_TEXT_LENGTH)
    : fallback;

const readEnvText = (value, fallback = '') =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback;

const safeDocumentId = (value, fallback = 'unknown') => {
  const clean = clampText(value, fallback)
    .normalize('NFKC')
    .replace(/[^A-Za-z0-9._~-]/g, '_')
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

const isFirestoreConfigured = () => Boolean(getServiceAccount());

const createJwtAssertion = (account) => {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64Url(JSON.stringify({
    iss: account.clientEmail,
    scope: FIRESTORE_SCOPE,
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

const documentBaseUrl = () => {
  const account = getServiceAccount();
  if (!account) {
    return null;
  }
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(account.projectId)}/databases/(default)/documents`;
};

const encodePath = (path) =>
  String(path).split('/').map((part) => encodeURIComponent(part)).join('/');

const toFirestoreValue = (value) => {
  if (value == null) {
    return { nullValue: null };
  }
  if (value instanceof Date) {
    return { timestampValue: value.toISOString() };
  }
  if (typeof value === 'boolean') {
    return { booleanValue: value };
  }
  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return { integerValue: String(value) };
    }
    return { doubleValue: value };
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(toFirestoreValue) } };
  }
  if (typeof value === 'object') {
    return { mapValue: { fields: toFirestoreFields(value) } };
  }
  return { stringValue: clampText(String(value)) };
};

const toFirestoreFields = (data) =>
  Object.fromEntries(
    Object.entries(data)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, toFirestoreValue(value)]),
  );

const fromFirestoreValue = (value) => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('booleanValue' in value) return Boolean(value.booleanValue);
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue.values ?? []).map(fromFirestoreValue);
  if ('mapValue' in value) return fromFirestoreFields(value.mapValue.fields ?? {});
  return null;
};

const fromFirestoreFields = (fields) =>
  Object.fromEntries(Object.entries(fields ?? {}).map(([key, value]) => [key, fromFirestoreValue(value)]));

const firestoreFetch = async (path, options = {}) => {
  const baseUrl = documentBaseUrl();
  const accessToken = await getAccessToken();
  if (!baseUrl || !accessToken) {
    return null;
  }
  const response = await fetch(`${baseUrl}/${encodePath(path)}${options.query ?? ''}`, {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Firestore request failed: ${response.status}`);
  }
  return response.json();
};

const getDocument = async (path) => {
  const data = await firestoreFetch(path);
  return data?.fields ? fromFirestoreFields(data.fields) : null;
};

const patchDocument = async (path, data) => {
  const fields = toFirestoreFields(data);
  const updateMask = Object.keys(fields)
    .map((key) => `updateMask.fieldPaths=${encodeURIComponent(key)}`)
    .join('&');
  await firestoreFetch(path, {
    method: 'PATCH',
    query: updateMask ? `?${updateMask}` : '',
    body: { fields },
  });
};

const createDocument = async (collection, documentId, data) => {
  const baseUrl = documentBaseUrl();
  const accessToken = await getAccessToken();
  if (!baseUrl || !accessToken) {
    return null;
  }
  const response = await fetch(`${baseUrl}/${encodeURIComponent(collection)}?documentId=${encodeURIComponent(documentId)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields: toFirestoreFields(data) }),
  });
  if (!response.ok) {
    throw new Error(`Firestore create failed: ${response.status}`);
  }
  return response.json();
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

const recordDrawLog = async (input = {}) => {
  if (!isFirestoreConfigured()) {
    return { logged: false, reason: 'firestore_not_configured' };
  }

  const now = new Date().toISOString();
  const userId = clampText(input.userId, 'guest');
  const username = inferUsername(userId, input.username);
  const displayName = clampText(input.displayName, username || userId);
  const authType = clampText(input.authType, userId === 'guest' ? 'guest' : 'demo');
  const userDocId = safeDocumentId(userId, 'guest');
  const existingUser = await getDocument(`users/${userDocId}`);
  const nextDrawCount = Math.max(0, Number(existingUser?.drawCount) || 0) + 1;

  await patchDocument(`users/${userDocId}`, {
    userId,
    username,
    displayName,
    authType,
    firstSeenAt: existingUser?.firstSeenAt || now,
    lastSeenAt: now,
    drawCount: nextDrawCount,
  });

  const logId = safeDocumentId(`${Date.now()}-${crypto.randomUUID()}`, 'draw-log');
  await createDocument('draw_logs', logId, {
    userId,
    username,
    displayName,
    authType,
    area: clampText(input.area),
    genre: clampText(input.genre),
    radiusMeters: Number.isFinite(Number(input.radiusMeters)) ? Math.round(Number(input.radiusMeters)) : null,
    candidateCount: Number.isFinite(Number(input.candidateCount)) ? Math.max(0, Math.round(Number(input.candidateCount))) : null,
    drawMode: clampText(input.drawMode),
    selectedRestaurantId: clampText(input.selectedRestaurantId),
    selectedRestaurantName: clampText(input.selectedRestaurantName),
    selectedProvider: clampText(input.selectedProvider),
    selectedSource: clampText(input.selectedSource),
    createdAt: now,
    day: now.slice(0, 10),
  });

  return { logged: true };
};

module.exports = {
  isFirestoreConfigured,
  recordDrawLog,
  safeDocumentId,
};
