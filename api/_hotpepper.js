const API_URL = 'https://webservice.recruit.co.jp/hotpepper/gourmet/v1/';
const { incrementApiUsage } = require('./_apiUsage');
const PAGE_SIZE = 30;
const MAX_SEARCH_PAGES = 1;
const CACHE_TTL_MS = 10 * 60 * 1000;
const HOTPEPPER_CACHE = new Map();
const OSAKA_AREA_HINTS = new Set([
  '大阪',
  '大阪府',
  '大阪市',
  '梅田',
  '大阪駅',
  '北新地',
  '中津',
  '中崎町',
  '天満',
  '扇町',
  '南森町',
  '天神橋筋六丁目',
  '福島',
  '野田',
  '新福島',
  '海老江',
  '心斎橋',
  '難波',
  'なんば',
  '日本橋',
  '本町',
  '淀屋橋',
  '北浜',
  '谷町四丁目',
  '松屋町',
  '森ノ宮',
  '堀江',
  '四ツ橋',
  '阿波座',
  '九条',
  '天王寺',
  '上本町',
  '四天王寺前夕陽ヶ丘',
  '寺田町',
  '阿倍野',
  '昭和町',
  '西田辺',
  '新世界',
  '大国町',
  '恵美須町',
  '桜川',
  '鶴橋',
  '桃谷',
  '今里',
  '緑橋',
  '京橋',
  '都島',
  '桜ノ宮',
  '新大阪',
  '十三',
  '西中島南方',
  '塚本',
  '弁天町',
  '大正',
  '住之江公園',
  '長居',
  '江坂',
  '吹田',
  '豊中',
  '池田',
  '高槻',
  '茨木',
  '枚方市',
  '守口市',
  '門真市',
  '寝屋川市',
  '東大阪',
  '布施',
  '八尾',
  '堺東',
  '堺',
  '中百舌鳥',
  '三国ヶ丘',
  '泉佐野',
  '岸和田',
]);

const GENRE_PLANS = new Map([
  ['ラーメン', [{ genre: 'G013', keywords: [] }]],
  ['焼肉', [{ genre: 'G008', keywords: ['焼肉'] }]],
  ['居酒屋', [{ genre: 'G001', keywords: [] }]],
  ['韓国料理', [{ genre: 'G017', keywords: ['韓国料理'] }, { genre: '', keywords: ['韓国料理'] }]],
  ['カレー', [{ genre: 'G009', keywords: ['カレー'] }, { genre: '', keywords: ['スパイスカレー'] }]],
  ['うどん', [{ genre: 'G004', keywords: ['うどん'] }, { genre: '', keywords: ['うどん'] }]],
  ['そば', [{ genre: 'G004', keywords: ['そば'] }, { genre: '', keywords: ['蕎麦'] }]],
  ['粉もの', [{ genre: 'G016', keywords: ['お好み焼き'] }, { genre: 'G016', keywords: ['たこ焼き'] }, { genre: '', keywords: ['粉もの'] }]],
  ['たこ焼き', [{ genre: 'G016', keywords: ['たこ焼き'] }, { genre: '', keywords: ['たこ焼き'] }]],
  ['お好み焼き', [{ genre: 'G016', keywords: ['お好み焼き'] }]],
  ['焼き鳥', [{ genre: 'G001', keywords: ['焼き鳥'] }, { genre: '', keywords: ['焼鳥'] }]],
  ['ピザ', [{ genre: 'G006', keywords: ['ピザ'] }, { genre: '', keywords: ['ピッツァ'] }]],
  ['ハンバーガー', [{ genre: 'G015', keywords: ['ハンバーガー'] }]],
  ['定食', [{ genre: 'G004', keywords: ['定食'] }, { genre: '', keywords: ['食堂'] }]],
  ['串カツ', [{ genre: 'G016', keywords: ['串カツ'] }, { genre: 'G001', keywords: ['串カツ'] }]],
  ['餃子', [{ genre: 'G007', keywords: ['餃子'] }, { genre: '', keywords: ['餃子'] }]],
  ['和食', [{ genre: 'G004', keywords: [] }]],
  ['洋食', [{ genre: 'G005', keywords: [] }]],
  ['イタリアン', [{ genre: 'G006', keywords: ['イタリアン'] }]],
  ['中華', [{ genre: 'G007', keywords: [] }]],
  ['寿司', [{ genre: 'G004', keywords: ['寿司'] }]],
  ['海鮮', [{ genre: 'G004', keywords: ['海鮮'] }, { genre: 'G001', keywords: ['海鮮'] }]],
  ['肉料理', [{ genre: 'G008', keywords: [] }, { genre: 'G005', keywords: ['ステーキ'] }]],
  ['スイーツ', [{ genre: 'G014', keywords: ['スイーツ'] }]],
  ['カフェ', [{ genre: 'G014', keywords: ['カフェ'] }]],
  ['パン', [{ genre: 'G014', keywords: ['パン'] }, { genre: 'G015', keywords: ['パン'] }]],
  ['各国料理', [{ genre: 'G010', keywords: [] }, { genre: 'G009', keywords: [] }, { genre: 'G017', keywords: [] }]],
  ['すべて', [{ genre: '', keywords: [] }]],
]);

const clampText = (value, fallback = '') =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, 180) : fallback;

const asNumber = (value, fallback = undefined) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const hotPepperCacheKeyFor = (query = {}) => JSON.stringify({
  area: clampText(query.area),
  genre: clampText(query.genre),
  budgetMin: asNumber(query.budgetMin, 0) ?? 0,
  budgetMax: asNumber(query.budgetMax, 0) ?? 0,
  latitude: asNumber(query.latitude, null),
  longitude: asNumber(query.longitude, null),
  range: asNumber(query.range, null),
  distanceMeters: asNumber(query.distanceMeters, null),
});

const readHotPepperCache = (key) => {
  const cached = HOTPEPPER_CACHE.get(key);
  if (!cached) {
    return null;
  }
  if (Date.now() - cached.fetchedAtMs > CACHE_TTL_MS) {
    HOTPEPPER_CACHE.delete(key);
    return null;
  }
  return cached.restaurants;
};

const parseBudget = (value) => {
  const text = typeof value === 'string' ? value : '';
  const numbers = [...text.matchAll(/\d[\d,]*/g)].map((match) => Number(match[0].replace(/,/g, '')));
  if (numbers.length >= 2) {
    return { min: numbers[0], max: numbers[1] };
  }
  if (numbers.length === 1) {
    return text.includes('～') || text.includes('〜') || text.includes('未満')
      ? { min: 0, max: numbers[0] }
      : { min: numbers[0], max: numbers[0] };
  }
  return { min: 0, max: 0 };
};

const matchesBudget = (restaurant, budgetMin, budgetMax) => {
  const requestedMin = asNumber(budgetMin, 0) ?? 0;
  const requestedMax = asNumber(budgetMax, 0) ?? 0;
  if (!requestedMin && !requestedMax) {
    return true;
  }
  const restaurantMin = restaurant.budgetMin || 0;
  const restaurantMax = restaurant.budgetMax || restaurantMin || 0;
  if (requestedMax > 0 && restaurantMin > requestedMax) {
    return false;
  }
  if (requestedMin > 0 && restaurantMax > 0 && restaurantMax < requestedMin) {
    return false;
  }
  return true;
};

const normalizeSearchText = (value) =>
  String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[　、。，．・･\-ー〜~'"`()（）[\]]/g, '');

const includesAny = (source, keywords) =>
  keywords.some((keyword) => source.includes(normalizeSearchText(keyword)));

const RAMEN_KEYWORDS = [
  'ラーメン',
  'らーめん',
  'らぁめん',
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
  '麺家',
  '麺や',
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
const RAMEN_SOBA_PHRASES = [
  '中華そば',
  '支那そば',
  'つけそば',
  '油そば',
  'まぜそば',
  '混ぜそば',
  'tsukesoba',
  'aburasoba',
  'mazesoba',
];

const withoutRamenSobaPhrases = (source) =>
  RAMEN_SOBA_PHRASES.reduce((text, phrase) => text.replaceAll(normalizeSearchText(phrase), ''), source);

const hasNonRamenUdonOrSoba = (source) =>
  includesAny(source, UDON_KEYWORDS) || includesAny(withoutRamenSobaPhrases(source), SOBA_KEYWORDS);

const hotPepperSearchText = (restaurant) =>
  normalizeSearchText([
    restaurant.name,
    restaurant.genre,
    restaurant.note,
    restaurant.address,
  ].filter(Boolean).join(' '));

const hotPepperIdentityText = (restaurant) =>
  normalizeSearchText([
    restaurant.name,
    restaurant.genre,
  ].filter(Boolean).join(' '));

const matchesRequestedGenre = (restaurant, genre) => {
  const requestedGenre = clampText(genre, 'すべて');
  if (!requestedGenre || requestedGenre === 'すべて' || requestedGenre === '？') {
    return true;
  }
  const source = hotPepperSearchText(restaurant);
  const identitySource = hotPepperIdentityText(restaurant);
  switch (requestedGenre) {
    case 'ラーメン':
      return includesAny(identitySource, RAMEN_KEYWORDS) && !hasNonRamenUdonOrSoba(identitySource);
    case 'つけ麺':
      return includesAny(identitySource, TSUKEMEN_KEYWORDS) && !hasNonRamenUdonOrSoba(identitySource);
    case '油そば':
      return includesAny(identitySource, ABURASOBA_KEYWORDS) && !includesAny(identitySource, UDON_KEYWORDS);
    case 'うどん':
      return includesAny(identitySource, UDON_KEYWORDS);
    case 'そば':
      return includesAny(withoutRamenSobaPhrases(identitySource), SOBA_KEYWORDS);
    default:
      return true;
  }
};

const DISPLAY_GENRE_OVERRIDES = new Set(['ラーメン', 'つけ麺', '油そば', 'うどん', 'そば']);

const withRequestedGenreLabel = (restaurant, genre) => {
  const requestedGenre = clampText(genre);
  if (!DISPLAY_GENRE_OVERRIDES.has(requestedGenre)) {
    return restaurant;
  }
  return {
    ...restaurant,
    genre: requestedGenre,
  };
};

const inferRequiredPrefecture = (area) => {
  const text = clampText(area);
  if (!text || text === '現在地' || text === '？') {
    return null;
  }
  if (text.includes('大阪府') || text.includes('大阪市')) return '大阪府';
  if (text.includes('京都府') || text.includes('京都市')) return '京都府';
  if (text.includes('兵庫県') || text.includes('神戸市')) return '兵庫県';
  if (text.includes('奈良県')) return '奈良県';
  if (text.includes('滋賀県')) return '滋賀県';
  if (text.includes('和歌山県')) return '和歌山県';
  if (OSAKA_AREA_HINTS.has(text)) return '大阪府';
  return null;
};

const matchesAreaScope = (restaurant, requiredPrefecture) => {
  if (!requiredPrefecture) {
    return true;
  }
  const source = `${restaurant.address} ${restaurant.area}`;
  return source.includes(requiredPrefecture);
};

const normalizeRange = (value) => {
  const number = Math.round(asNumber(value, 4) ?? 4);
  return Math.max(1, Math.min(5, number));
};

const buildPlans = (genre) => {
  const cleanGenre = clampText(genre, 'すべて');
  return GENRE_PLANS.get(cleanGenre) ?? [{ genre: '', keywords: [cleanGenre] }];
};

const buildKeyword = (area, keywords) => {
  const words = [];
  const cleanArea = clampText(area);
  if (cleanArea && cleanArea !== '現在地' && cleanArea !== '？') {
    words.push(cleanArea);
  }
  words.push(...keywords.filter(Boolean));
  return words.join(' ').trim();
};

const guessArea = (address) => {
  const text = clampText(address, '周辺');
  const match = text.match(/(大阪市[^ 　,、]*区|京都市[^ 　,、]*区|神戸市[^ 　,、]*区|東京都[^ 　,、]*区|[^ 　,、]+市|[^ 　,、]+区|[^ 　,、]+町|[^ 　,、]+村)/);
  return match?.[0] ?? text.slice(0, 16);
};

const toRestaurant = (shop, origin) => {
  const budget = parseBudget(shop?.budget?.name);
  return {
    id: `hotpepper-${shop.id}`,
    externalProvider: 'HOTPEPPER',
    externalId: shop.id,
    source: 'hotpepper',
    sourceFlags: ['hotpepper'],
    hotpepperId: shop.id,
    geoapifyId: null,
    name: clampText(shop.name, '名称未取得'),
    area: guessArea(shop.address),
    genre: clampText(shop?.genre?.name, 'ジャンル未分類'),
    budgetMin: budget.min,
    budgetMax: budget.max,
    rating: 0,
    minutes: 0,
    address: clampText(shop.address, '住所未取得'),
    photoUrl: shop?.photo?.pc?.l ?? shop?.photo?.pc?.m ?? shop?.photo?.mobile?.l ?? shop?.photo?.mobile?.s ?? null,
    note: clampText(shop.catch, shop.access ?? ''),
    latitude: asNumber(shop.lat, null),
    longitude: asNumber(shop.lng, null),
    googleRating: null,
    googleMapsUri: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${shop.name} ${shop.address}`)}`,
    openNow: null,
    nextOpenTime: null,
    nextCloseTime: null,
    googlePlaceId: null,
    priceRange: clampText(shop?.budget?.name),
    providerUrl: shop.urls?.pc ?? origin ?? null,
    lastFetchedAt: new Date().toISOString(),
  };
};

const requestHotPepperPage = async ({ apiKey, area, plan, latitude, longitude, range, start = 1, count = PAGE_SIZE }) => {
  const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude);
  const url = new URL(API_URL);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('format', 'json');
  url.searchParams.set('start', String(start));
  url.searchParams.set('count', String(count));
  if (hasCoordinates) {
    url.searchParams.set('lat', String(latitude));
    url.searchParams.set('lng', String(longitude));
    url.searchParams.set('range', String(normalizeRange(range)));
    url.searchParams.set('order', '4');
  }
  const keyword = hasCoordinates ? buildKeyword('', plan.keywords) : buildKeyword(area, plan.keywords);
  if (keyword) {
    url.searchParams.set('keyword', keyword);
  }
  if (plan.genre) {
    url.searchParams.set('genre', plan.genre);
  }

  await incrementApiUsage('hotpepper');
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`HotPepper API HTTP ${response.status}`);
  }
  const data = await response.json();
  const error = data?.results?.error;
  if (error) {
    throw new Error(`HotPepper API error: ${error.message ?? error.code ?? 'unknown'}`);
  }
  return data?.results ?? {};
};

const uniqueRestaurants = (restaurants) => {
  const seen = new Set();
  return restaurants.filter((restaurant) => {
    const key = `${restaurant.externalProvider}:${restaurant.externalId}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

const searchRestaurants = async (query = {}) => {
  const apiKey = process.env.HOTPEPPER_API_KEY;
  if (!apiKey) {
    const error = new Error('HOTPEPPER_API_KEY is not configured.');
    error.statusCode = 503;
    throw error;
  }

  const cacheKey = hotPepperCacheKeyFor(query);
  const cached = readHotPepperCache(cacheKey);
  if (cached) {
    return cached;
  }

  const area = clampText(query.area, '');
  const genre = clampText(query.genre, 'すべて');
  const budgetMin = asNumber(query.budgetMin, 0);
  const budgetMax = asNumber(query.budgetMax, 0);
  const latitude = asNumber(query.latitude, undefined);
  const longitude = asNumber(query.longitude, undefined);
  const range = asNumber(query.range, undefined);
  const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude);
  const requiredPrefecture = hasCoordinates ? null : inferRequiredPrefecture(area);
  const plans = buildPlans(genre);
  const allRestaurants = [];

  for (const plan of plans) {
    let start = 1;
    for (let page = 0; page < MAX_SEARCH_PAGES; page += 1) {
      const results = await requestHotPepperPage({ apiKey, area, plan, latitude, longitude, range, start });
      const shops = Array.isArray(results.shop) ? results.shop : [];
      allRestaurants.push(...shops.map((shop) => toRestaurant(shop)));
      const returned = Number(results.results_returned ?? shops.length);
      const available = Number(results.results_available ?? shops.length);
      if (!returned || start + returned > available) {
        break;
      }
      start += returned;
    }
  }

  const restaurants = uniqueRestaurants(allRestaurants)
    .filter((restaurant) => matchesBudget(restaurant, budgetMin, budgetMax))
    .filter((restaurant) => matchesRequestedGenre(restaurant, genre))
    .map((restaurant) => withRequestedGenreLabel(restaurant, genre))
    .filter((restaurant) => matchesAreaScope(restaurant, requiredPrefecture))
    .slice(0, 100);

  HOTPEPPER_CACHE.set(cacheKey, {
    fetchedAtMs: Date.now(),
    restaurants,
  });
  return restaurants;
};

const sendJson = (res, status, payload) => {
  res.status(status);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
};

const applyCors = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
};

module.exports = {
  applyCors,
  searchRestaurants,
  sendJson,
};
