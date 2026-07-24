const supabaseConfig = () => ({
  url: String(process.env.SUPABASE_URL || '').replace(/\/+$/, ''),
  anonKey: process.env.SUPABASE_ANON_KEY || '',
});

const readError = async (response, fallback) => {
  const body = await response.json().catch(() => ({}));
  return body.msg || body.message || body.error_description || body.error || fallback;
};

const toUser = (user) => {
  const metadata = user?.user_metadata || {};
  const email = user?.email || null;
  const username = email;
  const displayName = metadata.nickname || metadata.display_name || metadata.username || String(email || '').split('@')[0] || 'RANDISHユーザー';
  return {
    id: user.id,
    email,
    username,
    displayName,
    authProvider: 'SUPABASE',
    createdAt: user.created_at || new Date().toISOString(),
    updatedAt: user.updated_at || new Date().toISOString(),
  };
};

const getSupabaseUser = async (accessToken) => {
  const { url, anonKey } = supabaseConfig();
  if (!url || !anonKey) throw new Error('Supabase Auth is not configured.');
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(await readError(response, 'Supabase token is invalid.'));
  return response.json();
};

const sendJson = (response, status, body) => {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(body));
};

module.exports = { getSupabaseUser, readError, sendJson, supabaseConfig, toUser };
