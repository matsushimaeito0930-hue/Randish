const { sendJson } = require('../_hotpepper');
const { searchMergedRestaurants } = require('../_restaurantSearch');
const { isUsableCoordinate, withGeocodedCoordinates } = require('../_geocodeArea');

const DEFAULT_RADIUS_METERS = 1500;
const MAX_RADIUS_METERS = 10000;
const MAX_NEARBY_CANDIDATES = 300;
const RADIUS_BOUNDARY_TOLERANCE_METERS = 25;
const EXPANDED_SEARCH_STEPS_METERS = [1500, 3000, 5000, 10000];
const SUPPLEMENTAL_NEARBY_PLACES = [
  {
    id: 'lucua-ginza-kagari',
    name: '銀座 篝',
    latitude: 34.702906,
    longitude: 135.4965,
    categories: ['ラーメン', 'ラーメン・うどん・麺類'],
    budgetMin: 0,
    budgetMax: 999,
    address: '大阪府大阪市北区梅田3-1-3 ルクア大阪 バルチカ B2F',
    googleMapsUri: 'https://www.google.com/maps/search/?api=1&query=%E9%8A%80%E5%BA%A7%20%E7%AF%9D%20%E3%83%AB%E3%82%AF%E3%82%A2%E5%A4%A7%E9%98%AA',
  },
  {
    id: 'lucua-jinrui-mina-menrui-premium',
    name: '人類みな麺類Premium',
    latitude: 34.702906,
    longitude: 135.4965,
    categories: ['ラーメン', 'ラーメン・うどん・麺類'],
    budgetMin: 1000,
    budgetMax: 1999,
    address: '大阪府大阪市北区梅田3-1-3 ルクア大阪 バルチカ B2F',
    googleMapsUri: 'https://www.google.com/maps/search/?api=1&query=%E4%BA%BA%E9%A1%9E%E3%81%BF%E3%81%AA%E9%BA%BA%E9%A1%9EPremium%20%E3%83%AB%E3%82%AF%E3%82%A2%E5%A4%A7%E9%98%AA',
  },
];

const asNumber = (value, fallback = undefined) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const clampRadius = (value) => {
  const radius = Math.round(asNumber(value, DEFAULT_RADIUS_METERS));
  return Math.max(1, Math.min(MAX_RADIUS_METERS, radius));
};

const toHotPepperRange = (radiusMeters) => {
  if (radiusMeters <= 300) return 1;
  if (radiusMeters <= 500) return 2;
  if (radiusMeters <= 1000) return 3;
  if (radiusMeters <= 2000) return 4;
  return 5;
};

const getDistanceMeters = (first, second) => {
  const toRadians = (value) => (value * Math.PI) / 180;
  const radius = 6371000;
  const dLat = toRadians(second.latitude - first.latitude);
  const dLon = toRadians(second.longitude - first.longitude);
  const lat1 = toRadians(first.latitude);
  const lat2 = toRadians(second.latitude);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const readBody = (req) => {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }
  if (typeof req.body === 'string' && req.body.trim()) {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return {};
};

const toCandidatePlace = (restaurant, center) => {
  const latitude = asNumber(restaurant.latitude, null);
  const longitude = asNumber(restaurant.longitude, null);
  if (latitude == null || longitude == null) {
    return null;
  }
  const distanceMeters = Math.round(getDistanceMeters(center, { latitude, longitude }));
  return {
    id: restaurant.id,
    name: restaurant.name,
    latitude,
    longitude,
    categories: [restaurant.genre].filter(Boolean),
    rating: restaurant.googleRating ?? restaurant.rating ?? null,
    priceLevel: null,
    openNow: restaurant.openNow ?? null,
    address: restaurant.address ?? null,
    distanceMeters,
    googleMapsUri: restaurant.googleMapsUri ?? restaurant.providerUrl ?? null,
    photoUrl: restaurant.photoUrl ?? null,
    source: restaurant.source ?? (restaurant.externalProvider || '').toLowerCase(),
    sourceFlags: restaurant.sourceFlags ?? [(restaurant.externalProvider || '').toLowerCase()].filter(Boolean),
    externalProvider: restaurant.externalProvider ?? null,
    externalId: restaurant.externalId ?? null,
    hotpepperId: restaurant.hotpepperId ?? null,
    geoapifyId: restaurant.geoapifyId ?? null,
    googlePlaceId: restaurant.googlePlaceId ?? (String(restaurant.externalProvider).toUpperCase() === 'GOOGLE_PLACES' ? restaurant.externalId : null),
  };
};

const normalizeText = (value) =>
  String(value ?? '').toLowerCase().replace(/\s+/g, '').replace(/[　]/g, '');

const includesAny = (source, terms) =>
  terms.some((term) => source.includes(normalizeText(term)));

const RAMEN_REQUEST_TERMS = ['ラーメン', 'らーめん', 'らぁめん', 'らあめん', '拉麺', '中華そば', 'つけ麺', 'つけめん', '油そば', 'まぜそば', 'ramen', 'tsukemen'];
const RAMEN_MATCH_TERMS = [
  ...RAMEN_REQUEST_TERMS,
  '担々麺',
  'タンメン',
  'ちゃんぽん',
  '来来亭',
  '一風堂',
  '天下一品',
  'まこと屋',
  '丸源',
  '魁力屋',
  '町田商店',
  '男塾',
  '横綱',
  '神座',
  '塩元帥',
  'ずんどう屋',
  '麺屋',
];
const NON_RAMEN_NOODLE_TERMS = ['うどん', '饂飩', '丸亀', '香の川製麺', 'そば', '蕎麦', '蕎麥', 'soba', 'udon'];
const CATEGORY_KEYWORDS = new Map([
  ['焼肉', ['焼肉', 'ホルモン', 'ジンギスカン', 'yakiniku', 'bbq']],
  ['居酒屋', ['居酒屋', '酒場', '炉端', 'バル', 'izakaya']],
  ['韓国料理', ['韓国', 'サムギョプサル', 'チーズタッカルビ', '冷麺', 'korean']],
  ['カレー', ['カレー', 'スパイス', 'curry']],
  ['うどん', ['うどん', '饂飩', 'udon']],
  ['そば', ['そば', '蕎麦', 'soba']],
  ['粉もの', ['お好み焼き', 'たこ焼き', 'もんじゃ', '粉もの']],
  ['たこ焼き', ['たこ焼き']],
  ['お好み焼き', ['お好み焼き', 'もんじゃ']],
  ['焼き鳥', ['焼き鳥', '焼鳥', 'やきとり', 'yakitori']],
  ['ピザ', ['ピザ', 'ピッツァ', 'pizza']],
  ['ハンバーガー', ['ハンバーガー', 'バーガー', 'hamburger', 'burger']],
  ['定食', ['定食', '食堂', 'ごはん', '御膳', '膳']],
  ['串カツ', ['串カツ', '串かつ', '串揚げ']],
  ['餃子', ['餃子', 'ぎょうざ', 'gyoza']],
  ['和食', ['和食', '日本料理', '定食', '寿司', 'うどん', 'そば']],
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

const categorySearchText = (place) =>
  normalizeText(`${place.name ?? ''} ${place.address ?? ''} ${(place.categories ?? []).join(' ')}`);

const isRamenCategoryRequest = (category) =>
  includesAny(normalizeText(category), RAMEN_REQUEST_TERMS);

const matchesRamenCategory = (place) => {
  const source = categorySearchText(place);
  return includesAny(source, RAMEN_MATCH_TERMS) && !includesAny(source, NON_RAMEN_NOODLE_TERMS);
};

const matchesCategory = (place, category) => {
  const cleanCategory = normalizeText(category);
  if (!cleanCategory || cleanCategory === normalizeText('すべて')) {
    return true;
  }
  if (isRamenCategoryRequest(category)) {
    return matchesRamenCategory(place);
  }
  const source = categorySearchText(place);
  const keywordEntry = [...CATEGORY_KEYWORDS.entries()].find(([label]) => normalizeText(label) === cleanCategory);
  if (keywordEntry) {
    return includesAny(source, keywordEntry[1]);
  }
  return source.includes(cleanCategory);
};

const matchesBudget = (place, priceRange) => {
  const max = asNumber(priceRange, 0) ?? 0;
  if (!max) {
    return true;
  }
  return (place.budgetMin ?? 0) <= max;
};

const expandedRadiusCandidatesFor = (radius) =>
  EXPANDED_SEARCH_STEPS_METERS.filter((candidate) => candidate > radius && candidate <= MAX_RADIUS_METERS);

const toSupplementalCandidatePlace = (place, center) => {
  const distanceMeters = Math.round(getDistanceMeters(center, place));
  return {
    id: place.id,
    name: place.name,
    latitude: place.latitude,
    longitude: place.longitude,
    categories: place.categories,
    rating: null,
    priceLevel: null,
    openNow: null,
    address: place.address,
    distanceMeters,
    googleMapsUri: place.googleMapsUri,
    source: 'supplemental',
    sourceFlags: ['supplemental'],
  };
};

const candidateKey = (place) =>
  String(`${place.name ?? ''}:${place.address ?? ''}`)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[　、。，．・･\-ー－_'"`()（）【】\[\]]/g, '');

const isSameCandidatePlace = (first, second) => {
  if (first.id && second.id && first.id === second.id) {
    return true;
  }
  const firstKey = candidateKey(first);
  const secondKey = candidateKey(second);
  if (!firstKey || !secondKey || firstKey !== secondKey) {
    return false;
  }
  const firstDistance = asNumber(first.distanceMeters, null);
  const secondDistance = asNumber(second.distanceMeters, null);
  return firstDistance == null || secondDistance == null || Math.abs(firstDistance - secondDistance) <= 120;
};

const mergeCandidatePlace = (first, second) => {
  const sourceFlags = [...new Set([
    ...(first.sourceFlags ?? [first.source]).filter(Boolean),
    ...(second.sourceFlags ?? [second.source]).filter(Boolean),
  ].map((source) => String(source).toLowerCase()))];
  return {
    ...first,
    address: first.address ?? second.address,
    googleMapsUri: first.googleMapsUri ?? second.googleMapsUri,
    rating: first.rating ?? second.rating,
    openNow: first.openNow ?? second.openNow,
    sourceFlags,
    source: sourceFlags.length > 1 ? 'merged' : sourceFlags[0] ?? first.source ?? second.source,
    hotpepperId: first.hotpepperId ?? second.hotpepperId ?? null,
    geoapifyId: first.geoapifyId ?? second.geoapifyId ?? null,
    googlePlaceId: first.googlePlaceId ?? second.googlePlaceId ?? null,
  };
};

const uniquePlaces = (places) => {
  const merged = [];
  places.filter(Boolean).forEach((place) => {
    const existingIndex = merged.findIndex((candidate) => isSameCandidatePlace(candidate, place));
    if (existingIndex >= 0) {
      merged[existingIndex] = mergeCandidatePlace(merged[existingIndex], place);
    } else {
      merged.push(place);
    }
  });
  return merged;
};

const responseSource = (places) => {
  const sourceFlags = [...new Set(places.flatMap((place) => place.sourceFlags ?? [place.source]).filter(Boolean))];
  if (!sourceFlags.length) {
    return 'NONE';
  }
  return sourceFlags.length > 1 ? 'MERGED' : String(sourceFlags[0]).toUpperCase();
};

const applyPostCors = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
};

module.exports = async (req, res) => {
  if (applyPostCors(req, res)) {
    return;
  }
  if (req.method !== 'POST' && req.method !== 'GET') {
    return sendJson(res, 405, { message: 'Method not allowed.' });
  }

  const body = req.method === 'GET' ? (req.query ?? {}) : readBody(req);
  try {
    const resolvedBody = await withGeocodedCoordinates(body);
    const latitude = asNumber(resolvedBody.latitude, null);
    const longitude = asNumber(resolvedBody.longitude, null);
    const radius = clampRadius(body.radius);
    if (!isUsableCoordinate(latitude, longitude)) {
      return sendJson(res, 400, { message: 'latitude and longitude, or a geocodable area, are required.' });
    }

    const center = { latitude, longitude };
    const requestedCategory = typeof resolvedBody.category === 'string' ? resolvedBody.category.trim() : '';
    const toFilteredProviderPlaces = (restaurants) => restaurants
      .map((restaurant) => toCandidatePlace(restaurant, center))
      .filter(Boolean)
      .filter((place) => matchesCategory(place, requestedCategory));

    const searchProviderPlaces = async (radiusMeters) => {
      const searchQuery = {
        area: resolvedBody.geocodedAreaSearchValue ?? resolvedBody.area,
        budgetMax: resolvedBody.priceRange,
        latitude,
        longitude,
        distanceMeters: radiusMeters,
        range: toHotPepperRange(radiusMeters + RADIUS_BOUNDARY_TOLERANCE_METERS),
      };
      const restaurants = await searchMergedRestaurants({
        ...searchQuery,
        genre: requestedCategory || undefined,
      });
      let places = toFilteredProviderPlaces(restaurants);
      if (!places.length && requestedCategory) {
        const broadRestaurants = await searchMergedRestaurants({
          ...searchQuery,
          genre: undefined,
        });
        places = toFilteredProviderPlaces(broadRestaurants);
      }
      return places;
    };

    const buildFinalPlaces = (places, radiusMeters) => uniquePlaces(places)
      .filter((place) => place && place.distanceMeters <= radiusMeters + RADIUS_BOUNDARY_TOLERANCE_METERS)
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
      .slice(0, MAX_NEARBY_CANDIDATES);

    const supplementalPlaces = SUPPLEMENTAL_NEARBY_PLACES
      .filter((place) => matchesCategory(place, requestedCategory))
      .filter((place) => matchesBudget(place, resolvedBody.priceRange))
      .map((place) => toSupplementalCandidatePlace(place, center));
    let providerPlaces = await searchProviderPlaces(radius);
    let effectiveRadius = radius;
    let expandedRadius = null;
    let places = buildFinalPlaces([...providerPlaces, ...supplementalPlaces], effectiveRadius);

    if (!places.length && requestedCategory) {
      for (const nextExpandedRadius of expandedRadiusCandidatesFor(radius)) {
        expandedRadius = nextExpandedRadius;
        effectiveRadius = expandedRadius;
        const alreadyFetchedExpandedPlaces = providerPlaces
          .filter((place) => place.distanceMeters <= effectiveRadius + RADIUS_BOUNDARY_TOLERANCE_METERS);
        providerPlaces = alreadyFetchedExpandedPlaces.length
          ? alreadyFetchedExpandedPlaces
          : await searchProviderPlaces(effectiveRadius);
        places = buildFinalPlaces([...providerPlaces, ...supplementalPlaces], effectiveRadius);
        if (places.length) {
          break;
        }
      }
    }

    return sendJson(res, 200, {
      places,
      cacheHit: false,
      source: responseSource(places),
      fetchedAt: new Date().toISOString(),
      requestedRadiusMeters: radius,
      effectiveRadiusMeters: effectiveRadius,
      expandedRadiusMeters: expandedRadius,
      center: {
        latitude,
        longitude,
        label: resolvedBody.geocodedAreaLabel ?? resolvedBody.area ?? null,
        source: resolvedBody.geocodedAreaSource ?? (body.latitude && body.longitude ? 'request' : null),
      },
      message: places.length
        ? expandedRadius
          ? `Nearby candidates found after expanding radius to ${expandedRadius}m.`
          : 'Nearby candidates found.'
        : 'No nearby candidates found from Hot Pepper or Geoapify.',
    });
  } catch (error) {
    const status = error?.statusCode ?? 502;
    return sendJson(res, status, {
      message: error instanceof Error ? error.message : 'Nearby place search failed.',
    });
  }
};
