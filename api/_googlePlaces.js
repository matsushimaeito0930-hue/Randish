const API_URL = 'https://places.googleapis.com/v1/places:searchText';
const { incrementApiUsage } = require('./_apiUsage');
const DEFAULT_RADIUS_METERS = 1500;
const MAX_RADIUS_METERS = 5000;
const DEFAULT_LIMIT = 20;
const CACHE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_SESSION_LIMIT = 30;
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.rating',
  'places.googleMapsUri',
  'places.currentOpeningHours.openNow',
  'places.priceLevel',
  'places.types',
].join(',');

const GOOGLE_CACHE = new Map();
let sessionRequestCount = 0;

const ALL_GENRE_VALUES = new Set(['', 'all', 'everything', '\u3059\u3079\u3066']);
const RAMEN_PATTERN = /(\u30e9\u30fc\u30e1\u30f3|\u3089\u30fc\u3081\u3093|\u3064\u3051\u9eba|\u6cb9\u305d\u3070|ramen|tsukemen|noodle)/i;
const NOODLE_PATTERN = /(\u3046\u3069\u3093|\u305d\u3070|\u854e\u9ea6|\u9eba|noodle|soba|udon)/i;
const DISALLOWED_PLACE_TYPES = new Set([
  'beauty_salon',
  'hair_care',
  'hair_salon',
  'barber_shop',
  'nail_salon',
  'spa',
]);
const DISALLOWED_TEXT_TERMS = [
  'beautysalon',
  'hairsalon',
  'haircut',
  'hairmake',
  'barber',
  'nailsalon',
  'eyelash',
  'esthetic',
  'esthe',
  '\u7f8e\u5bb9',
  '\u7f8e\u5bb9\u5ba4',
  '\u7406\u5bb9',
  '\u7406\u5bb9\u5ba4',
  '\u30d8\u30a2\u30b5\u30ed\u30f3',
  '\u30cd\u30a4\u30eb',
  '\u30a8\u30b9\u30c6',
  '\u8131\u6bdb',
];

const asNumber = (value, fallback = undefined) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const clampText = (value, fallback = '') =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, 180) : fallback;

const normalizeGenre = (genre) => clampText(genre, '');

const isTruthy = (value) => {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
};

const isAutoEnabledAfterConfiguredDate = () => {
  const rawValue = process.env.RANDISH_GOOGLE_PLACES_ENABLE_AFTER || process.env.GOOGLE_PLACES_ENABLE_AFTER;
  if (!rawValue) {
    return false;
  }
  const timestamp = Date.parse(rawValue);
  return Number.isFinite(timestamp) && Date.now() >= timestamp;
};

const isGooglePlacesEnabled = () => {
  const rawValue = process.env.RANDISH_GOOGLE_PLACES_ENABLED || process.env.GOOGLE_PLACES_ENABLED;
  const normalized = String(rawValue ?? '').trim().toLowerCase();
  if (normalized === 'auto') {
    return isAutoEnabledAfterConfiguredDate();
  }
  return isTruthy(normalized);
};

const sessionLimit = () => {
  const parsed = Number(process.env.RANDISH_GOOGLE_PLACES_SESSION_LIMIT || process.env.GOOGLE_PLACES_SESSION_LIMIT);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_SESSION_LIMIT;
};

const reserveGoogleRequest = async () => {
  if (!isGooglePlacesEnabled() || !process.env.GOOGLE_PLACES_API_KEY) {
    return false;
  }
  const limit = sessionLimit();
  if (sessionRequestCount >= limit) {
    console.warn(`[RANDISH] Google Places request blocked. sessionRequestCount=${sessionRequestCount}, limit=${limit}`);
    return false;
  }
  sessionRequestCount += 1;
  await incrementApiUsage('google_places');
  return true;
};

const clampRadius = (query = {}) => {
  const explicitRadius = asNumber(query.radius, undefined)
    ?? asNumber(query.distanceMeters, undefined);
  const radius = explicitRadius ?? DEFAULT_RADIUS_METERS;
  return Math.max(1, Math.min(MAX_RADIUS_METERS, Math.round(radius)));
};

const getDistanceMeters = (first, second) => {
  const toRadians = (value) => (value * Math.PI) / 180;
  const earthRadiusMeters = 6371000;
  const dLat = toRadians(second.latitude - first.latitude);
  const dLon = toRadians(second.longitude - first.longitude);
  const lat1 = toRadians(first.latitude);
  const lat2 = toRadians(second.latitude);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const normalizedGenreText = (genre) => normalizeGenre(genre).toLowerCase();

const normalizeSearchText = (value) =>
  String(value ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, '');

const isFoodPlace = (place) => {
  const types = Array.isArray(place?.types) ? place.types.map((type) => String(type).toLowerCase()) : [];
  if (types.some((type) => DISALLOWED_PLACE_TYPES.has(type))) {
    return false;
  }
  const source = normalizeSearchText([
    place?.displayName?.text,
    place?.formattedAddress,
    ...types,
  ].join(' '));
  return !DISALLOWED_TEXT_TERMS.some((term) => source.includes(normalizeSearchText(term)));
};

const buildTextQuery = (genre) => {
  const normalized = normalizedGenreText(genre);
  if (ALL_GENRE_VALUES.has(normalized)) {
    return 'restaurant';
  }
  if (RAMEN_PATTERN.test(normalized)) {
    return 'ramen restaurant';
  }
  if (NOODLE_PATTERN.test(normalized)) {
    return 'noodle restaurant';
  }
  return `${normalizeGenre(genre)} restaurant`.trim();
};

const displayGenre = (genre, place) => {
  const normalized = normalizedGenreText(genre);
  if (RAMEN_PATTERN.test(normalized)) {
    return '\u30e9\u30fc\u30e1\u30f3';
  }
  if (NOODLE_PATTERN.test(normalized)) {
    return '\u9eba\u985e';
  }
  return normalizeGenre(genre) || firstText(place.types?.[0], 'restaurant');
};

const firstText = (...values) =>
  values.find((value) => typeof value === 'string' && value.trim())?.trim() ?? null;

const googlePriceToBudget = (priceLevel, genre) => {
  if (RAMEN_PATTERN.test(normalizedGenreText(genre))) {
    return { min: 700, max: 1500 };
  }
  switch (priceLevel) {
    case 'PRICE_LEVEL_FREE':
      return { min: 0, max: 0 };
    case 'PRICE_LEVEL_INEXPENSIVE':
      return { min: 0, max: 1200 };
    case 'PRICE_LEVEL_MODERATE':
      return { min: 1200, max: 3000 };
    case 'PRICE_LEVEL_EXPENSIVE':
      return { min: 3000, max: 8000 };
    case 'PRICE_LEVEL_VERY_EXPENSIVE':
      return { min: 8000, max: 20000 };
    default:
      return { min: 0, max: 999999 };
  }
};

const numericPriceLevel = (priceLevel) => {
  switch (priceLevel) {
    case 'PRICE_LEVEL_FREE':
      return 0;
    case 'PRICE_LEVEL_INEXPENSIVE':
      return 1;
    case 'PRICE_LEVEL_MODERATE':
      return 2;
    case 'PRICE_LEVEL_EXPENSIVE':
      return 3;
    case 'PRICE_LEVEL_VERY_EXPENSIVE':
      return 4;
    default:
      return null;
  }
};

const safeGoogleId = (value) =>
  String(value ?? '').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120) || `place-${Date.now()}`;

const cacheKeyFor = ({ latitude, longitude, radius, genre, limit }) =>
  [
    Number(latitude).toFixed(5),
    Number(longitude).toFixed(5),
    radius,
    normalizeGenre(genre),
    limit,
  ].join('|');

const readCache = (key) => {
  const cached = GOOGLE_CACHE.get(key);
  if (!cached) {
    return null;
  }
  if (Date.now() - cached.fetchedAtMs > CACHE_TTL_MS) {
    GOOGLE_CACHE.delete(key);
    return null;
  }
  return cached.restaurants;
};

const writeCache = (key, restaurants) => {
  GOOGLE_CACHE.set(key, {
    fetchedAtMs: Date.now(),
    restaurants,
  });
};

const matchesBudget = (restaurant, budgetMax) => {
  const requestedMax = asNumber(budgetMax, null);
  return requestedMax == null || requestedMax <= 0 || restaurant.budgetMin <= requestedMax;
};

const toRestaurant = (place, query, center, fetchedAt) => {
  const latitude = asNumber(place?.location?.latitude, null);
  const longitude = asNumber(place?.location?.longitude, null);
  const name = firstText(place?.displayName?.text);
  if (latitude == null || longitude == null || !name || !place?.id) {
    return null;
  }

  const distanceMeters = Math.round(getDistanceMeters(center, { latitude, longitude }));
  const genre = displayGenre(query.genre, place);
  const budget = googlePriceToBudget(place.priceLevel, query.genre);
  const externalId = String(place.id);
  const address = firstText(place.formattedAddress, '');

  return {
    id: `google-${safeGoogleId(externalId)}`,
    externalProvider: 'GOOGLE_PLACES',
    externalId,
    source: 'google_places',
    sourceFlags: ['google_places'],
    hotpepperId: null,
    geoapifyId: null,
    googlePlaceId: externalId,
    name: clampText(name, 'Unknown place'),
    area: '',
    genre,
    budgetMin: budget.min,
    budgetMax: budget.max,
    rating: asNumber(place.rating, 0) ?? 0,
    minutes: 0,
    address: address || '',
    photoUrl: null,
    note: 'Google Places fallback',
    latitude,
    longitude,
    googleRating: asNumber(place.rating, null),
    googleMapsUri: firstText(place.googleMapsUri, `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${address || ''}`)}`),
    openNow: typeof place?.currentOpeningHours?.openNow === 'boolean' ? place.currentOpeningHours.openNow : null,
    nextOpenTime: null,
    nextCloseTime: null,
    priceRange: '',
    priceLevel: numericPriceLevel(place.priceLevel),
    providerUrl: firstText(place.googleMapsUri, null),
    distanceMeters,
    lastFetchedAt: fetchedAt,
  };
};

const searchGooglePlacesRestaurants = async (query = {}, options = {}) => {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!isGooglePlacesEnabled() || !apiKey) {
    return [];
  }

  const latitude = asNumber(query.latitude, undefined);
  const longitude = asNumber(query.longitude, undefined);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return [];
  }

  const radius = clampRadius(query);
  const limit = Math.max(1, Math.min(asNumber(options.limit, DEFAULT_LIMIT) ?? DEFAULT_LIMIT, DEFAULT_LIMIT));
  const cacheKey = cacheKeyFor({ latitude, longitude, radius, genre: query.genre, limit });
  const cached = readCache(cacheKey);
  if (cached) {
    return cached;
  }
  if (!await reserveGoogleRequest()) {
    return [];
  }

  const body = {
    textQuery: buildTextQuery(query.genre),
    languageCode: 'ja',
    regionCode: 'JP',
    maxResultCount: limit,
    locationBias: {
      circle: {
        center: { latitude, longitude },
        radius,
      },
    },
  };

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Google Places API HTTP ${response.status}`);
  }

  const data = await response.json();
  const center = { latitude, longitude };
  const fetchedAt = new Date().toISOString();
  const restaurants = (Array.isArray(data?.places) ? data.places : [])
    .filter(isFoodPlace)
    .map((place) => toRestaurant(place, query, center, fetchedAt))
    .filter((restaurant) => restaurant && restaurant.distanceMeters <= radius)
    .filter((restaurant) => matchesBudget(restaurant, query.budgetMax))
    .slice(0, limit);

  writeCache(cacheKey, restaurants);
  return restaurants;
};

const googlePlacesDiagnostics = () => ({
  provider: 'GOOGLE_PLACES',
  enabled: isGooglePlacesEnabled(),
  available: isGooglePlacesEnabled() && Boolean(process.env.GOOGLE_PLACES_API_KEY) && sessionRequestCount < sessionLimit(),
  apiKeyConfigured: Boolean(process.env.GOOGLE_PLACES_API_KEY),
  sessionRequestLimit: sessionLimit(),
  sessionRequestCount,
  sessionRequestsRemaining: Math.max(0, sessionLimit() - sessionRequestCount),
});

module.exports = {
  googlePlacesDiagnostics,
  searchGooglePlacesRestaurants,
};
