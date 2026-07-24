const { getSupabaseUser, readError, sendJson, supabaseConfig, toUser } = require('./_supabaseAuth');

const postOnly = (request, response) => {
  if (request.method === 'POST') return false;
  response.setHeader('Allow', 'POST');
  sendJson(response, 405, { message: 'Method not allowed.' });
  return true;
};

const updateUser = async (accessToken, body) => {
  const { url, anonKey } = supabaseConfig();
  const result = await fetch(`${url}/auth/v1/user`, {
    method: 'PUT',
    headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!result.ok) throw new Error(await readError(result, 'Account update failed.'));
  return result.json();
};

module.exports = async function handler(request, response) {
  const rawPath = request.query?.action;
  const path = Array.isArray(rawPath) ? rawPath.join('/') : String(rawPath || '');

  if (path === 'magic-link') {
    if (postOnly(request, response)) return;
    const email = String(request.body?.email || '').trim().toLowerCase();
    const redirectTo = String(request.body?.redirectTo || '');
    const createUser = request.body?.createUser !== false;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return sendJson(response, 400, { message: 'email format is invalid.' });
    const { url, anonKey } = supabaseConfig();
    if (!url || !anonKey) return sendJson(response, 503, { message: 'Supabase Auth is not configured.' });
    const flow = redirectTo.includes('flow=login') ? 'login' : 'register';
    const callbackUrl = `https://www.randish.jp/auth/callback?flow=${flow}`;
    try {
      const result = await fetch(`${url}/auth/v1/otp?redirect_to=${encodeURIComponent(callbackUrl)}`, {
        method: 'POST',
        headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, create_user: createUser }),
      });
      if (!result.ok) return sendJson(response, 400, { message: await readError(result, 'Supabase magic link request failed.') });
      return sendJson(response, 200, { email, expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() });
    } catch {
      return sendJson(response, 502, { message: 'Supabase magic link request failed.' });
    }
  }

  if (path === 'login') {
    if (postOnly(request, response)) return;
    const email = String(request.body?.email || '').trim().toLowerCase();
    const password = String(request.body?.password || '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password) return sendJson(response, 400, { message: 'Email or password is incorrect.' });
    const { url, anonKey } = supabaseConfig();
    try {
      const result = await fetch(`${url}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!result.ok) return sendJson(response, 401, { message: await readError(result, 'Email or password is incorrect.') });
      const body = await result.json();
      return sendJson(response, 200, { user: toUser(body.user), accessToken: body.access_token });
    } catch {
      return sendJson(response, 401, { message: 'Email or password is incorrect.' });
    }
  }

  if (path === 'password') {
    if (postOnly(request, response)) return;
    const accessToken = String(request.body?.accessToken || '').trim();
    const password = String(request.body?.password || '');
    if (!accessToken) return sendJson(response, 400, { message: 'accessToken is required.' });
    if (password.length < 8 || password.length > 72) return sendJson(response, 400, { message: 'password must be between 8 and 72 characters.' });
    try {
      const user = await updateUser(accessToken, { password });
      return sendJson(response, 200, { user: toUser(user), accessToken });
    } catch (error) {
      return sendJson(response, 400, { message: error.message || 'Password update failed.' });
    }
  }

  if (path === 'profile') {
    if (postOnly(request, response)) return;
    const accessToken = String(request.body?.accessToken || '').trim();
    const nickname = String(request.body?.nickname || request.body?.username || '').trim();
    if (!accessToken) return sendJson(response, 400, { message: 'accessToken is required.' });
    const nicknameLength = Array.from(nickname).length;
    if (nicknameLength < 1 || nicknameLength > 30 || /[\u0000-\u001f\u007f]/u.test(nickname)) {
      return sendJson(response, 400, { message: 'nickname format is invalid.' });
    }
    try {
      const currentUser = await getSupabaseUser(accessToken);
      const email = String(currentUser.email || '').trim().toLowerCase();
      if (!email) return sendJson(response, 400, { message: 'Account email is unavailable.' });
      const user = await updateUser(accessToken, {
        data: {
          username: email,
          nickname,
          display_name: nickname,
          onboarding_completed: true,
        },
      });
      return sendJson(response, 200, { user: toUser(user), accessToken });
    } catch (error) {
      return sendJson(response, 400, { message: error.message || 'Profile update failed.' });
    }
  }

  if (path === 'oauth/session') {
    if (postOnly(request, response)) return;
    const accessToken = String(request.body?.accessToken || '').trim();
    if (!accessToken) return sendJson(response, 400, { message: 'accessToken is required.' });
    try {
      const user = await getSupabaseUser(accessToken);
      return sendJson(response, 200, { user: toUser(user), accessToken });
    } catch (error) {
      return sendJson(response, 401, { message: error.message || 'Supabase token is invalid.' });
    }
  }

  if (path === 'me') {
    if (request.method !== 'GET') return sendJson(response, 405, { message: 'Method not allowed.' });
    const token = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    if (!token) return sendJson(response, 401, { message: 'Authorization is required.' });
    try {
      const user = await getSupabaseUser(token);
      return sendJson(response, 200, { user: toUser(user), accessToken: null });
    } catch (error) {
      return sendJson(response, 401, { message: error.message || 'Supabase token is invalid.' });
    }
  }

  return sendJson(response, 404, { message: 'Not found.' });
};
