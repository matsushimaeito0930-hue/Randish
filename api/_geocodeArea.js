const { incrementApiUsage } = require('./_apiUsage');

const GEOCODE_URL = 'https://api.geoapify.com/v1/geocode/search';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const GEOCODE_CACHE = new Map();
const GEOCODE_RESULT_LIMIT = 8;

const PREFECTURES = [
  '北海道',
  '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
  '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
  '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県',
  '岐阜県', '静岡県', '愛知県', '三重県',
  '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県',
  '鳥取県', '島根県', '岡山県', '広島県', '山口県',
  '徳島県', '香川県', '愛媛県', '高知県',
  '福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県',
];

const STATIC_AREA_CENTERS = [
  {
    aliases: ['河内長野市', '大阪府 河内長野市', '大阪府河内長野市'],
    label: '河内長野市',
    formatted: '河内長野市',
    latitude: 34.45808,
    longitude: 135.56414,
    source: 'static',
    searchArea: '河内長野市',
  },
];

const normalizeAreaText = (value) =>
  String(value ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, '');

const asNumber = (value, fallback = null) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const cleanAreaText = (value) =>
  String(value ?? '').trim().slice(0, 180);

const isUsableCoordinate = (latitude, longitude) =>
  Number.isFinite(asNumber(latitude, undefined))
  && Number.isFinite(asNumber(longitude, undefined))
  && !(Number(latitude) === 0 && Number(longitude) === 0);

const findStaticCenter = (area) => {
  const normalized = normalizeAreaText(area);
  return STATIC_AREA_CENTERS.find((center) =>
    center.aliases.some((alias) => normalizeAreaText(alias) === normalized || normalized.includes(normalizeAreaText(alias)))) ?? null;
};

const unique = (values) => [...new Set(values.filter(Boolean))];

const governmentOfficeBaseArea = (area) => {
  const match = String(area).match(/([一-龯々ぁ-んァ-ヶーA-Za-z0-9]+?(?:市|区|町|村))(?:役所|役場)/);
  return match?.[1] ?? null;
};

const extractAreaHints = (area) => {
  const normalizedArea = normalizeAreaText(area);
  const prefectures = PREFECTURES.filter((prefecture) =>
    normalizedArea.includes(normalizeAreaText(prefecture)));
  const adminTokens = unique(
    [...String(area).matchAll(/([一-龯々ぁ-んァ-ヶーA-Za-z0-9]+?(?:市|区|町|村))/g)]
      .map((match) => match[1])
      .filter((token) => token.length >= 2 && token.length <= 24),
  );
  return {
    normalizedArea,
    prefectures,
    adminTokens,
    adminStems: unique(adminTokens.map((token) => token.replace(/[市区町村]$/, '')).filter((token) => token.length >= 2)),
    wantsGovernmentOffice: /(市役所|区役所|町役場|村役場|役所|役場)/.test(String(area)),
  };
};

const geocodeFeatureText = (feature) => {
  const properties = feature?.properties ?? {};
  return normalizeAreaText([
    properties.name,
    properties.formatted,
    properties.address_line1,
    properties.address_line2,
    properties.city,
    properties.county,
    properties.state,
    properties.suburb,
    properties.district,
  ].filter(Boolean).join(' '));
};

const scoreGeocodeFeature = (feature, hints, index) => {
  const properties = feature?.properties ?? {};
  const text = geocodeFeatureText(feature);
  const confidence = Number(properties.rank?.confidence);
  let score = Number.isFinite(confidence) ? confidence * 10 : 0;

  if (hints.normalizedArea && text.includes(hints.normalizedArea)) {
    score += 24;
  }

  const prefectureMatches = hints.prefectures.filter((prefecture) =>
    text.includes(normalizeAreaText(prefecture)));
  if (hints.prefectures.length) {
    score += prefectureMatches.length * 18;
    if (!prefectureMatches.length) {
      score -= 22;
    }
  }

  const adminMatches = hints.adminTokens.filter((token) =>
    text.includes(normalizeAreaText(token)));
  if (hints.adminTokens.length) {
    score += adminMatches.length * 30;
    if (!adminMatches.length) {
      score -= 34;
    }
  }

  const stemMatches = hints.adminStems.filter((token) =>
    text.includes(normalizeAreaText(token)));
  score += stemMatches.length * 8;

  if (hints.wantsGovernmentOffice) {
    const name = normalizeAreaText(properties.name);
    if (name.includes('役所') || name.includes('役場')) {
      score += 10;
    }
    if (adminMatches.length && (name.includes('役所') || name.includes('役場'))) {
      score += 18;
    }
  }

  if (properties.result_type === 'city' || properties.result_type === 'county') {
    score += 4;
  }

  return score - index * 0.2;
};

const pickBestGeocodeFeature = (features, area) => {
  const hints = extractAreaHints(area);
  return features
    .map((feature, index) => ({ feature, score: scoreGeocodeFeature(feature, hints, index) }))
    .sort((a, b) => b.score - a.score)[0]?.feature ?? null;
};

const readCache = (key) => {
  const cached = GEOCODE_CACHE.get(key);
  if (!cached) {
    return null;
  }
  if (Date.now() - cached.fetchedAtMs > CACHE_TTL_MS) {
    GEOCODE_CACHE.delete(key);
    return null;
  }
  return cached.result;
};

const writeCache = (key, result) => {
  GEOCODE_CACHE.set(key, { fetchedAtMs: Date.now(), result });
};

const geocodeWithGeoapify = async (area) => {
  const apiKey = process.env.GEOAPIFY_API_KEY;
  if (!apiKey) {
    return null;
  }

  const url = new URL(GEOCODE_URL);
  url.searchParams.set('text', area.includes('日本') ? area : `${area} 日本`);
  url.searchParams.set('limit', String(GEOCODE_RESULT_LIMIT));
  url.searchParams.set('lang', 'ja');
  url.searchParams.set('filter', 'countrycode:jp');
  url.searchParams.set('apiKey', apiKey);

  await incrementApiUsage('geoapify');
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`Geoapify Geocoding API HTTP ${response.status}`);
  }

  const data = await response.json();
  const features = Array.isArray(data?.features) ? data.features : [];
  const feature = pickBestGeocodeFeature(features, area);
  const properties = feature?.properties ?? {};
  const latitude = asNumber(properties.lat);
  const longitude = asNumber(properties.lon);
  if (!isUsableCoordinate(latitude, longitude)) {
    return null;
  }

  return {
    label: properties.city || properties.county || properties.state || properties.formatted || area,
    formatted: properties.formatted || area,
    latitude,
    longitude,
    source: 'geoapify_geocode',
  };
};

const geocodeArea = async (areaValue) => {
  const area = cleanAreaText(areaValue);
  if (!area || area === '現在地' || area === '？') {
    return null;
  }

  const staticCenter = findStaticCenter(area);
  if (staticCenter) {
    return staticCenter;
  }

  const officeBaseArea = governmentOfficeBaseArea(area);
  if (officeBaseArea && normalizeAreaText(officeBaseArea) !== normalizeAreaText(area)) {
    const staticOfficeBaseCenter = findStaticCenter(officeBaseArea);
    if (staticOfficeBaseCenter) {
      return staticOfficeBaseCenter;
    }
    const officeBaseResult = await geocodeWithGeoapify(officeBaseArea);
    if (officeBaseResult) {
      return { ...officeBaseResult, searchArea: officeBaseArea };
    }
  }

  const cacheKey = normalizeAreaText(area);
  const cached = readCache(cacheKey);
  if (cached) {
    return { ...cached, cacheHit: true };
  }

  const result = await geocodeWithGeoapify(area);
  if (!result) {
    return null;
  }
  writeCache(cacheKey, result);
  return { ...result, cacheHit: false };
};

const withGeocodedCoordinates = async (query = {}, options = {}) => {
  if (isUsableCoordinate(query.latitude, query.longitude)) {
    return query;
  }
  const area = cleanAreaText(query.area);
  const geocoded = await geocodeArea(area);
  if (!geocoded) {
    return query;
  }
  const nextQuery = {
    ...query,
    latitude: geocoded.latitude,
    longitude: geocoded.longitude,
    geocodedAreaLabel: geocoded.label,
    geocodedAreaSource: geocoded.source,
    geocodedAreaSearchValue: geocoded.searchArea ?? geocoded.label ?? area,
  };
  if (options.defaultDistanceMeters && !query.distanceMeters && !query.radius && !query.range) {
    nextQuery.distanceMeters = options.defaultDistanceMeters;
  }
  return nextQuery;
};

module.exports = {
  cleanAreaText,
  geocodeArea,
  isUsableCoordinate,
  normalizeAreaText,
  withGeocodedCoordinates,
};
