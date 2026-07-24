const { getSupabaseUser, readError, supabaseConfig } = require('./_supabaseAuth');

const accessTokenFrom = (request) =>
  String(request.headers?.authorization || '').replace(/^Bearer\s+/i, '').trim();

const requireSupabaseSession = async (request) => {
  const accessToken = accessTokenFrom(request);
  if (!accessToken) {
    const error = new Error('Authorization is required.');
    error.statusCode = 401;
    throw error;
  }
  try {
    const user = await getSupabaseUser(accessToken);
    return { accessToken, user };
  } catch (cause) {
    const error = new Error(cause?.message || 'Supabase token is invalid.');
    error.statusCode = 401;
    throw error;
  }
};

const supabaseRest = async (accessToken, table, {
  method = 'GET',
  query = '',
  body,
  prefer,
} = {}) => {
  const { url, anonKey } = supabaseConfig();
  if (!url || !anonKey) {
    const error = new Error('Supabase is not configured.');
    error.statusCode = 503;
    throw error;
  }
  const response = await fetch(`${url}/rest/v1/${table}${query ? `?${query}` : ''}`, {
    method,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const error = new Error(await readError(response, 'Supabase data request failed.'));
    error.statusCode = response.status;
    throw error;
  }
  if (response.status === 204) return null;
  return response.json().catch(() => null);
};

const updateSupabaseUser = async (accessToken, data) => {
  const { url, anonKey } = supabaseConfig();
  const response = await fetch(`${url}/auth/v1/user`, {
    method: 'PUT',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ data }),
  });
  if (!response.ok) {
    const error = new Error(await readError(response, 'Profile update failed.'));
    error.statusCode = response.status;
    throw error;
  }
  return response.json();
};

module.exports = {
  requireSupabaseSession,
  supabaseRest,
  updateSupabaseUser,
};
