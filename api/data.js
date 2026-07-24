const crypto = require('crypto');
const { sendJson, toUser } = require('./_supabaseAuth');
const { requireSupabaseSession, supabaseRest, updateSupabaseUser } = require('./_supabaseData');

const asText = (value, max = 1000) => {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, max) : null;
};
const asNumber = (value) => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
const id = (prefix) => `${prefix}-${crypto.randomUUID()}`;
const encoded = (value) => encodeURIComponent(String(value));
const normalizeProvider = (value) => {
  const provider = String(value || 'RANDISH_SEED').trim().toUpperCase();
  if (provider === 'GOOGLE' || provider === 'GOOGLE_PLACE' || provider === 'GOOGLE_PLACES_API') return 'GOOGLE_PLACES';
  return ['RANDISH_SEED', 'HOTPEPPER', 'GEOAPIFY', 'GOOGLE_PLACES'].includes(provider) ? provider : 'RANDISH_SEED';
};

const toRestaurant = (row) => row ? ({
  id: row.id,
  externalProvider: row.external_provider,
  externalId: row.external_id,
  name: row.name,
  area: row.area,
  genre: row.genre,
  budgetMin: row.budget_min,
  budgetMax: row.budget_max,
  rating: row.rating,
  minutes: row.minutes,
  address: row.address,
  photoUrl: row.photo_url ?? null,
  note: row.note ?? '',
  latitude: row.latitude ?? null,
  longitude: row.longitude ?? null,
}) : null;

const toHistory = (row) => ({
  id: row.id,
  userId: row.user_id,
  provider: row.provider,
  providerPlaceId: row.provider_place_id,
  restaurantId: row.restaurant_id ?? null,
  restaurant: toRestaurant(Array.isArray(row.restaurant) ? row.restaurant[0] : row.restaurant),
  area: row.area ?? null,
  genre: row.genre ?? null,
  budgetMin: row.budget_min ?? null,
  budgetMax: row.budget_max ?? null,
  rangeMeters: row.range_meters ?? null,
  createdAt: row.created_at,
});

const toFavorite = (row) => ({
  id: row.id,
  userId: row.user_id,
  provider: row.provider,
  providerPlaceId: row.provider_place_id,
  restaurantId: row.restaurant_id ?? null,
  savedArea: row.saved_area ?? null,
  savedGenre: row.saved_genre ?? null,
  savedBudgetMin: row.saved_budget_min ?? null,
  savedBudgetMax: row.saved_budget_max ?? null,
  savedRangeMeters: row.saved_range_meters ?? null,
  userMemo: row.user_memo ?? null,
  userTags: row.user_tags ?? null,
  restaurant: toRestaurant(Array.isArray(row.restaurant) ? row.restaurant[0] : row.restaurant),
  createdAt: row.created_at,
});

const profileFrom = (user) => {
  const mapped = toUser(user);
  return {
    userId: user.id,
    username: mapped.email,
    displayName: mapped.displayName,
    authType: 'supabase',
    profileImageDataUrl: user.user_metadata?.profile_image_data_url ?? null,
    firstSeenAt: user.created_at ?? null,
    lastSeenAt: user.last_sign_in_at ?? null,
    lastProfileUpdatedAt: user.user_metadata?.profile_updated_at ?? user.updated_at ?? null,
    profileImageUpdatedAt: user.user_metadata?.profile_image_updated_at ?? null,
  };
};

const allow = (response, methods) => {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', `${methods.join(', ')}, OPTIONS`);
  response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
};

module.exports = async function handler(request, response) {
  const action = Array.isArray(request.query?.action) ? request.query.action.join('/') : String(request.query?.action || '');
  allow(response, ['GET', 'POST', 'DELETE']);
  if (request.method === 'OPTIONS') return response.status(204).end();

  try {
    const { accessToken, user } = await requireSupabaseSession(request);

    if (action === 'histories' && request.method === 'GET') {
      const rows = await supabaseRest(accessToken, 'random_histories', {
        query: `select=*,restaurant:restaurants(*)&user_id=eq.${encoded(user.id)}&order=created_at.desc&limit=100`,
      });
      return sendJson(response, 200, (rows || []).map(toHistory));
    }

    if (action === 'history' && request.method === 'POST') {
      const body = request.body || {};
      const provider = normalizeProvider(body.selectedProvider || body.provider);
      const providerPlaceId = asText(body.selectedRestaurantId || body.providerPlaceId, 255);
      if (!providerPlaceId) return sendJson(response, 400, { message: 'providerPlaceId is required.' });
      const restaurantId = asText(body.restaurantId, 120);
      const row = {
        id: id('history'),
        user_id: user.id,
        restaurant_id: restaurantId,
        provider,
        provider_place_id: providerPlaceId,
        area: asText(body.area, 120),
        genre: asText(body.genre, 120),
        budget_min: asNumber(body.budgetMin),
        budget_max: asNumber(body.budgetMax),
        range_meters: asNumber(body.radiusMeters ?? body.rangeMeters),
        created_at: new Date().toISOString(),
      };
      const rows = await supabaseRest(accessToken, 'random_histories', {
        method: 'POST', body: row, prefer: 'return=representation',
      });
      const history = toHistory(rows?.[0] || row);
      return sendJson(response, 200, { ok: true, logged: true, history, databaseProvider: 'supabase' });
    }

    if (action === 'favorites' && request.method === 'GET') {
      const rows = await supabaseRest(accessToken, 'favorite_restaurants', {
        query: `select=*,restaurant:restaurants(*)&user_id=eq.${encoded(user.id)}&order=created_at.desc&limit=100`,
      });
      return sendJson(response, 200, (rows || []).map(toFavorite));
    }

    if (action === 'favorite' && request.method === 'POST') {
      const body = request.body || {};
      const provider = normalizeProvider(body.provider);
      const providerPlaceId = asText(body.providerPlaceId, 255);
      if (!providerPlaceId) return sendJson(response, 400, { message: 'providerPlaceId is required.' });
      const existing = await supabaseRest(accessToken, 'favorite_restaurants', {
        query: `select=*,restaurant:restaurants(*)&user_id=eq.${encoded(user.id)}&provider=eq.${encoded(provider)}&provider_place_id=eq.${encoded(providerPlaceId)}&limit=1`,
      });
      if (existing?.[0]) return sendJson(response, 200, toFavorite(existing[0]));
      const row = {
        id: id('favorite'),
        user_id: user.id,
        provider,
        provider_place_id: providerPlaceId,
        restaurant_id: asText(body.restaurantId, 120),
        saved_area: asText(body.savedArea, 120),
        saved_genre: asText(body.savedGenre, 120),
        saved_budget_min: asNumber(body.savedBudgetMin),
        saved_budget_max: asNumber(body.savedBudgetMax),
        saved_range_meters: asNumber(body.savedRangeMeters),
        user_memo: asText(body.userMemo, 1000),
        user_tags: asText(body.userTags, 1000),
        created_at: new Date().toISOString(),
      };
      const rows = await supabaseRest(accessToken, 'favorite_restaurants', {
        method: 'POST', body: row, prefer: 'return=representation',
      });
      return sendJson(response, 200, toFavorite(rows?.[0] || row));
    }

    if (action === 'favorite' && request.method === 'DELETE') {
      const favoriteId = asText(request.query?.id, 120);
      if (!favoriteId) return sendJson(response, 400, { message: 'id is required.' });
      await supabaseRest(accessToken, 'favorite_restaurants', {
        method: 'DELETE', query: `id=eq.${encoded(favoriteId)}&user_id=eq.${encoded(user.id)}`,
      });
      return response.status(204).end();
    }

    if ((action === 'favorite-restaurant' || action === 'history-restaurant') && request.method === 'GET') {
      const recordId = asText(request.query?.id, 120);
      const table = action === 'favorite-restaurant' ? 'favorite_restaurants' : 'random_histories';
      const rows = await supabaseRest(accessToken, table, {
        query: `select=restaurant:restaurants(*)&id=eq.${encoded(recordId)}&user_id=eq.${encoded(user.id)}&limit=1`,
      });
      const restaurant = toRestaurant(Array.isArray(rows?.[0]?.restaurant) ? rows[0].restaurant[0] : rows?.[0]?.restaurant);
      return restaurant ? sendJson(response, 200, restaurant) : sendJson(response, 404, { message: 'Restaurant details are unavailable.' });
    }

    if (action === 'profile' && request.method === 'GET') {
      return sendJson(response, 200, { ok: true, found: true, profile: profileFrom(user), databaseProvider: 'supabase' });
    }

    if (action === 'profile' && request.method === 'POST') {
      const displayName = asText(request.body?.displayName, 30);
      if (!displayName) return sendJson(response, 400, { message: 'displayName is required.' });
      const now = new Date().toISOString();
      const nextMetadata = {
        ...(user.user_metadata || {}),
        username: String(user.email || '').toLowerCase(),
        nickname: displayName,
        display_name: displayName,
        profile_updated_at: now,
      };
      const updated = await updateSupabaseUser(accessToken, nextMetadata);
      return sendJson(response, 200, { ok: true, updated: true, profile: profileFrom(updated), databaseProvider: 'supabase' });
    }

    if (action === 'summary' && request.method === 'GET') {
      const [histories, favorites] = await Promise.all([
        supabaseRest(accessToken, 'random_histories', { query: `select=created_at,budget_min,budget_max&user_id=eq.${encoded(user.id)}&order=created_at.desc&limit=1000` }),
        supabaseRest(accessToken, 'favorite_restaurants', { query: `select=created_at&user_id=eq.${encoded(user.id)}&limit=1000` }),
      ]);
      const prices = (histories || []).map((row) => {
        const min = asNumber(row.budget_min); const max = asNumber(row.budget_max);
        return min == null && max == null ? null : Math.round(((min ?? max) + (max ?? min)) / 2);
      }).filter((value) => value != null);
      return sendJson(response, 200, {
        ok: true, found: true, databaseProvider: 'supabase',
        analytics: {
          userId: user.id,
          user_name: profileFrom(user).displayName,
          username: user.email || null,
          authType: 'supabase',
          lottery_count: histories?.length || 0,
          favorite_shop_count: favorites?.length || 0,
          keep_shop_count: favorites?.length || 0,
          unit_price: prices.length ? Math.round(prices.reduce((sum, value) => sum + value, 0) / prices.length) : 0,
          last_lottery_at: histories?.[0]?.created_at || null,
          updatedAt: new Date().toISOString(),
        },
      });
    }

    return sendJson(response, 404, { message: 'Not found.' });
  } catch (error) {
    return sendJson(response, error.statusCode || 500, { message: error.message || 'Supabase data request failed.' });
  }
};
