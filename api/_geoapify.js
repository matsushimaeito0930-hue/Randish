const API_URL = 'https://api.geoapify.com/v2/places';
const { incrementApiUsage } = require('./_apiUsage');
const DEFAULT_RADIUS_METERS = 500;
const MAX_RADIUS_METERS = 10000;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const CACHE_TTL_MS = 10 * 60 * 1000;

const RAMEN_CATEGORIES = [
  'catering.restaurant.ramen',
  'catering.fast_food.ramen',
  'catering.restaurant.noodle',
  'catering.fast_food.noodle',
  'catering.restaurant.japanese',
  'catering.restaurant',
  'catering.fast_food',
];

const NOODLE_CATEGORIES = [
  'catering.restaurant.noodle',
  'catering.fast_food.noodle',
  'catering.restaurant.japanese',
];

const GENERIC_RESTAURANT_CATEGORIES = [
  'catering.restaurant',
  'catering.fast_food',
];

const JAPANESE_CATEGORIES = [
  'catering.restaurant.japanese',
  'catering.restaurant',
];

const ALL_GENRES = new Set(['', 'すべて']);
const RAMEN_GENRES = new Set(['ラーメン', 'つけ麺', '油そば']);
const NOODLE_GENRES = new Set(['うどん', 'そば']);
const GEOAPIFY_CACHE = new Map();

const asNumber = (value, fallback = undefined) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const clampText = (value, fallback = '') =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, 180) : fallback;

const normalizeGenre = (genre) => clampText(genre, 'すべて');

const metersFromHotPepperRange = (range) => {
  switch (Math.round(asNumber(range, 0) ?? 0)) {
    case 1:
      return 300;
    case 2:
      return 500;
    case 3:
      return 1000;
    case 4:
      return 2000;
    case 5:
      return 3000;
    default:
      return DEFAULT_RADIUS_METERS;
  }
};

const radiusMetersFromQuery = (query) => {
  const explicitRadius = asNumber(query.radius, undefined)
    ?? asNumber(query.distanceMeters, undefined);
  const radius = explicitRadius ?? metersFromHotPepperRange(query.range);
  return Math.max(1, Math.min(MAX_RADIUS_METERS, Math.round(radius)));
};

const resultLimitFromRadius = (radius) => {
  if (radius >= 5000) {
    return MAX_LIMIT;
  }
  if (radius >= 3000) {
    return 300;
  }
  if (radius >= 1500) {
    return 200;
  }
  return DEFAULT_LIMIT;
};

const categoriesForGenre = (genre) => {
  const normalized = normalizeGenre(genre);
  if (ALL_GENRES.has(normalized)) {
    return GENERIC_RESTAURANT_CATEGORIES;
  }
  if (RAMEN_GENRES.has(normalized)) {
    return RAMEN_CATEGORIES;
  }
  if (NOODLE_GENRES.has(normalized)) {
    return NOODLE_CATEGORIES;
  }
  if (normalized === '和食' || normalized === '日本料理') {
    return JAPANESE_CATEGORIES;
  }
  return GENERIC_RESTAURANT_CATEGORIES;
};

const defaultBudgetForGenre = (genre) => {
  switch (normalizeGenre(genre)) {
    case 'ラーメン':
    case 'つけ麺':
    case '油そば':
      return { min: 700, max: 1500 };
    case 'うどん':
    case 'そば':
      return { min: 600, max: 1800 };
    default:
      return { min: 0, max: 999999 };
  }
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

const normalizeText = (value) =>
  String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[　、。，．・･\-ー－_'"`]/g, '');

const RAMEN_POSITIVE_KEYWORDS = [
  'catering.restaurant.ramen',
  'catering.fast_food.ramen',
  'ラーメン',
  'らーめん',
  'らぁめん',
  'らあめん',
  '拉麺',
  '中華そば',
  '支那そば',
  'つけ麺',
  'つけめん',
  'つけそば',
  '油そば',
  'まぜそば',
  '混ぜそば',
  '担々麺',
  '担担麺',
  '坦々麺',
  'タンメン',
  'ちゃんぽん',
  '麺屋',
  '麺や',
  '麺家',
  'ramen',
  'tsukemen',
  'aburasoba',
  'mazesoba',
  'tantanmen',
  'tanmen',
  'chanpon',
];

const TSUKEMEN_KEYWORDS = ['つけ麺', 'つけめん', 'つけそば', 'tsukemen'];
const ABURASOBA_KEYWORDS = ['油そば', 'まぜそば', '混ぜそば', 'aburasoba', 'mazesoba'];
const UDON_KEYWORDS = ['うどん', '饂飩', 'udon'];
const SOBA_KEYWORDS = ['そば', '蕎麦', 'soba'];
const JAPANESE_KEYWORDS = ['和食', '日本料理', 'japanese'];
const GENRE_KEYWORDS = new Map([
  ['焼肉', ['焼肉', 'ホルモン', 'ジンギスカン', 'yakiniku', 'bbq']],
  ['居酒屋', ['居酒屋', '酒場', '炉端', 'バル', 'izakaya']],
  ['韓国料理', ['韓国', 'サムギョプサル', 'チーズタッカルビ', '冷麺', 'korean']],
  ['カレー', ['カレー', 'スパイス', 'curry']],
  ['粉もの', ['お好み焼き', 'たこ焼き', 'もんじゃ', '粉もの']],
  ['たこ焼き', ['たこ焼き']],
  ['お好み焼き', ['お好み焼き', 'もんじゃ']],
  ['焼き鳥', ['焼き鳥', '焼鳥', 'やきとり', 'yakitori']],
  ['ピザ', ['ピザ', 'ピッツァ', 'pizza']],
  ['ハンバーガー', ['ハンバーガー', 'バーガー', 'hamburger', 'burger']],
  ['定食', ['定食', '食堂', 'ごはん', '御膳', '膳']],
  ['串カツ', ['串カツ', '串かつ', '串揚げ']],
  ['餃子', ['餃子', 'ぎょうざ', 'gyoza']],
  ['洋食', ['洋食', 'オムライス', 'ハンバーグ', 'ステーキ']],
  ['イタリアン', ['イタリアン', 'パスタ', 'トラットリア', 'italian']],
  ['中華', ['中華', '中国料理', '餃子', 'ラーメン', 'chinese']],
  ['寿司', ['寿司', '鮨', 'すし', 'sushi']],
  ['海鮮', ['海鮮', '魚介', '刺身', '寿司', 'seafood']],
  ['肉料理', ['肉', 'ステーキ', '焼肉', 'ハンバーグ', 'ローストビーフ']],
  ['スイーツ', ['スイーツ', 'ケーキ', 'パフェ', 'デザート', 'sweets']],
  ['カフェ', ['カフェ', '喫茶', 'coffee', 'cafe']],
  ['パン', ['パン', 'ベーカリー', 'bakery', 'bread']],
  ['各国料理', ['タイ', 'ベトナム', 'インド', 'ネパール', 'メキシコ', 'スペイン', 'エスニック']],
]);
const SUPPLEMENTAL_TARGET_COUNT = 10;
const RAMEN_NAME_SEARCH_TERMS = ['ラーメン', 'らーめん', '麺屋', '拉麺', '中華そば', 'つけ麺', '油そば', '担々麺'];
const RAMEN_SOBA_PHRASES = [
  '中華そば',
  '支那そば',
  'つけそば',
  '油そば',
  'まぜそば',
  '混ぜそば',
  'aburasoba',
  'mazesoba',
  'tsukesoba',
];

const includesAny = (source, keywords) =>
  keywords.some((keyword) => source.includes(normalizeText(keyword)));

const NON_RESTAURANT_TERMS = [
  'commercial.health_and_beauty',
  'commercial.hairdresser',
  'commercial.beauty',
  'commercial.beauty_salon',
  'commercial.cosmetics',
  'beauty',
  'beautysalon',
  'hairsalon',
  'hairdresser',
  'barber',
  'nailsalon',
  'eyelash',
  'esthetic',
  'esthe',
  '\u7f8e\u5bb9',
  '\u7f8e\u5bb9\u5ba4',
  '\u7406\u5bb9',
  '\u7406\u5bb9\u5ba4',
  '\u5e8a\u5c4b',
  '\u30d8\u30a2\u30b5\u30ed\u30f3',
  '\u30cd\u30a4\u30eb',
  '\u307e\u3064\u3052',
  '\u30a8\u30b9\u30c6',
  '\u8131\u6bdb',
];

const withoutRamenSobaPhrases = (source) =>
  RAMEN_SOBA_PHRASES.reduce((text, phrase) => text.replaceAll(normalizeText(phrase), ''), source);

const hasNonRamenUdonOrSoba = (source) =>
  includesAny(source, UDON_KEYWORDS) || includesAny(withoutRamenSobaPhrases(source), SOBA_KEYWORDS);

const stringValues = (value) => {
  if (!value || typeof value !== 'object') {
    return [];
  }
  return Object.values(value).filter((item) => typeof item === 'string' && item.trim());
};

const isLikelyFoodFeature = (feature) => {
  const properties = feature?.properties ?? {};
  const raw = properties.datasource?.raw ?? {};
  const source = normalizeText([
    properties.name,
    properties.formatted,
    ...(Array.isArray(properties.categories) ? properties.categories : []),
    ...stringValues(raw),
  ].join(' '));
  return !includesAny(source, NON_RESTAURANT_TERMS);
};

const featureSearchText = (restaurant, feature) => {
  const properties = feature?.properties ?? {};
  const raw = properties.datasource?.raw ?? {};
  return normalizeText([
    restaurant.name,
    restaurant.address,
    restaurant.note,
    ...(Array.isArray(properties.categories) ? properties.categories : []),
    ...stringValues(raw),
  ].join(' '));
};

const matchesRamenLike = (source) =>
  includesAny(source, RAMEN_POSITIVE_KEYWORDS) && !hasNonRamenUdonOrSoba(source);

const matchesRequestedGenre = (restaurant, feature, genre) => {
  const normalized = normalizeGenre(genre);
  if (ALL_GENRES.has(normalized)) {
    return true;
  }
  const source = featureSearchText(restaurant, feature);
  switch (normalized) {
    case 'ラーメン':
      return matchesRamenLike(source);
    case 'つけ麺':
      return includesAny(source, TSUKEMEN_KEYWORDS) && !hasNonRamenUdonOrSoba(source);
    case '油そば':
      return includesAny(source, ABURASOBA_KEYWORDS) && !includesAny(source, UDON_KEYWORDS);
    case 'うどん':
      return includesAny(source, UDON_KEYWORDS);
    case 'そば':
      return includesAny(withoutRamenSobaPhrases(source), SOBA_KEYWORDS);
    case '和食':
    case '日本料理':
      return includesAny(source, JAPANESE_KEYWORDS);
    default:
      return includesAny(source, GENRE_KEYWORDS.get(normalized) ?? [normalized]);
  }
};

const matchesBudget = (restaurant, budgetMin, budgetMax) => {
  const requestedMin = asNumber(budgetMin, 0) ?? 0;
  const requestedMax = asNumber(budgetMax, 0) ?? 0;
  if (!requestedMin && !requestedMax) {
    return true;
  }
  if (requestedMax > 0 && restaurant.budgetMin > requestedMax) {
    return false;
  }
  const average = Math.round(((restaurant.budgetMin ?? 0) + (restaurant.budgetMax ?? restaurant.budgetMin ?? 0)) / 2);
  return requestedMin <= 0 || average >= requestedMin;
};

const firstText = (...values) => values.find((value) => typeof value === 'string' && value.trim())?.trim();

const guessArea = (properties, address) => {
  const parts = [
    properties.city,
    properties.district,
    properties.suburb,
    properties.county,
    properties.state,
  ].filter((value) => typeof value === 'string' && value.trim());
  if (parts.length) {
    return parts[0].slice(0, 40);
  }
  const match = clampText(address, '周辺').match(/([^ 　,、]+市[^ 　,、]*区|[^ 　,、]+市|[^ 　,、]+区|[^ 　,、]+町|[^ 　,、]+村)/);
  return match?.[0] ?? clampText(address, '周辺').slice(0, 16);
};

const safeGeoapifyId = (value, fallback) =>
  clampText(value, fallback).replace(/[^A-Za-z0-9._:@-]/g, '_').slice(0, 120);

const toRestaurant = (feature, query, center, fetchedAt) => {
  const properties = feature?.properties ?? {};
  const geometryCoordinates = Array.isArray(feature?.geometry?.coordinates)
    ? feature.geometry.coordinates
    : [];
  const latitude = asNumber(properties.lat, undefined) ?? asNumber(geometryCoordinates[1], undefined);
  const longitude = asNumber(properties.lon, undefined) ?? asNumber(geometryCoordinates[0], undefined);
  const name = firstText(properties.name, properties.datasource?.raw?.name);
  if (!name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  const externalId = clampText(
    properties.place_id,
    `${name}:${latitude.toFixed(6)},${longitude.toFixed(6)}`,
  ).slice(0, 255);
  const requestedGenre = normalizeGenre(query.genre);
  const categories = Array.isArray(properties.categories) ? properties.categories : [];
  const displayGenre = ALL_GENRES.has(requestedGenre)
    ? categories.find((category) => typeof category === 'string' && category.includes('ramen')) ? 'ラーメン' : '飲食店'
    : requestedGenre;
  const address = firstText(properties.formatted, properties.address_line2, properties.address_line1, properties.street) ?? '住所未取得';
  const budget = defaultBudgetForGenre(displayGenre);
  const distanceMeters = asNumber(properties.distance, undefined)
    ?? Math.round(getDistanceMeters(center, { latitude, longitude }));

  return {
    id: `geoapify-${safeGeoapifyId(properties.place_id, `${latitude}_${longitude}_${name}`)}`,
    externalProvider: 'GEOAPIFY',
    externalId,
    source: 'geoapify',
    sourceFlags: ['geoapify'],
    hotpepperId: null,
    geoapifyId: externalId,
    name: clampText(name, '名称未取得'),
    area: guessArea(properties, address),
    genre: displayGenre,
    budgetMin: budget.min,
    budgetMax: budget.max,
    rating: 0,
    minutes: 0,
    address,
    photoUrl: null,
    note: `Geoapify Placesで補完${categories.length ? ` / ${categories.slice(0, 3).join(', ')}` : ''}`,
    latitude,
    longitude,
    googleRating: null,
    googleMapsUri: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${address}`)}`,
    openNow: null,
    nextOpenTime: null,
    nextCloseTime: null,
    googlePlaceId: null,
    priceRange: '',
    providerUrl: null,
    distanceMeters: Math.round(distanceMeters),
    lastFetchedAt: fetchedAt,
  };
};

const cacheKeyFor = ({ latitude, longitude, radius, genre, budgetMin, budgetMax }) =>
  [
    Number(latitude).toFixed(5),
    Number(longitude).toFixed(5),
    radius,
    normalizeGenre(genre),
    asNumber(budgetMin, 0) ?? 0,
    asNumber(budgetMax, 0) ?? 0,
  ].join('|');

const supplementalNameTermsForGenre = (genre, radius) => {
  const normalized = normalizeGenre(genre);
  if (radius < 3000 || !RAMEN_GENRES.has(normalized)) {
    return [];
  }
  if (normalized === 'つけ麺') {
    return ['つけ麺', 'つけめん'];
  }
  if (normalized === '油そば') {
    return ['油そば', 'まぜそば', '混ぜそば'];
  }
  return RAMEN_NAME_SEARCH_TERMS;
};

const featureKey = (feature) => {
  const properties = feature?.properties ?? {};
  const coordinates = Array.isArray(feature?.geometry?.coordinates) ? feature.geometry.coordinates : [];
  return [
    properties.place_id,
    properties.name,
    properties.lat ?? coordinates[1],
    properties.lon ?? coordinates[0],
  ].filter((value) => value != null && value !== '').join('|');
};

const uniqueFeatures = (features) => {
  const seen = new Set();
  return features.filter((feature) => {
    const key = featureKey(feature);
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

const featuresToRestaurants = (features, query, center, fetchedAt, radius, resultLimit) =>
  uniqueFeatures(features)
    .filter(isLikelyFoodFeature)
    .map((feature) => ({ feature, restaurant: toRestaurant(feature, query, center, fetchedAt) }))
    .filter((item) => item.restaurant)
    .filter((item) => item.restaurant.distanceMeters == null || item.restaurant.distanceMeters <= radius)
    .filter((item) => matchesRequestedGenre(item.restaurant, item.feature, query.genre))
    .map((item) => item.restaurant)
    .filter((restaurant) => matchesBudget(restaurant, query.budgetMin, query.budgetMax))
    .slice(0, resultLimit);

const requestGeoapifyFeatures = async ({ apiKey, categories, latitude, longitude, radius, limit, name }) => {
  const url = new URL(API_URL);
  url.searchParams.set('categories', categories.join(','));
  url.searchParams.set('filter', `circle:${longitude},${latitude},${radius}`);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('lang', 'ja');
  if (name) {
    url.searchParams.set('name', name);
  }
  url.searchParams.set('apiKey', apiKey);

  await incrementApiUsage('geoapify');
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`Geoapify API HTTP ${response.status}`);
  }
  const data = await response.json();
  return Array.isArray(data?.features) ? data.features : [];
};

const readCache = (key) => {
  const cached = GEOAPIFY_CACHE.get(key);
  if (!cached) {
    return null;
  }
  if (Date.now() - cached.fetchedAtMs > CACHE_TTL_MS) {
    GEOAPIFY_CACHE.delete(key);
    return null;
  }
  return cached.restaurants;
};

const searchGeoapifyRestaurants = async (query = {}) => {
  const apiKey = process.env.GEOAPIFY_API_KEY;
  if (!apiKey) {
    return [];
  }

  const latitude = asNumber(query.latitude, undefined);
  const longitude = asNumber(query.longitude, undefined);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return [];
  }

  const categories = categoriesForGenre(query.genre);
  if (!categories.length) {
    return [];
  }

  const radius = radiusMetersFromQuery(query);
  const resultLimit = resultLimitFromRadius(radius);
  const cacheKey = cacheKeyFor({
    latitude,
    longitude,
    radius,
    genre: query.genre,
    budgetMin: query.budgetMin,
    budgetMax: query.budgetMax,
  });
  const cached = readCache(cacheKey);
  if (cached) {
    return cached;
  }

  const baseFeatures = await requestGeoapifyFeatures({
    apiKey,
    categories,
    latitude,
    longitude,
    radius,
    limit: resultLimit,
  });
  const center = { latitude, longitude };
  const fetchedAt = new Date().toISOString();
  const allFeatures = [...baseFeatures];
  let restaurants = featuresToRestaurants(allFeatures, query, center, fetchedAt, radius, resultLimit);
  if (restaurants.length < SUPPLEMENTAL_TARGET_COUNT) {
    for (const name of supplementalNameTermsForGenre(query.genre, radius)) {
      try {
        allFeatures.push(...await requestGeoapifyFeatures({
          apiKey,
          categories: GENERIC_RESTAURANT_CATEGORIES,
          latitude,
          longitude,
          radius,
          limit: DEFAULT_LIMIT,
          name,
        }));
        restaurants = featuresToRestaurants(allFeatures, query, center, fetchedAt, radius, resultLimit);
        if (restaurants.length >= SUPPLEMENTAL_TARGET_COUNT) {
          break;
        }
      } catch (error) {
        console.warn(`[RANDISH] Geoapify supplemental name search failed: ${name}`, error);
      }
    }
  }

  GEOAPIFY_CACHE.set(cacheKey, {
    fetchedAtMs: Date.now(),
    restaurants,
  });
  return restaurants;
};

module.exports = {
  searchGeoapifyRestaurants,
};
