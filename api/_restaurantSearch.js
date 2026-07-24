const { searchRestaurants: searchHotPepperRestaurants } = require('./_hotpepper');
const { searchGeoapifyRestaurants } = require('./_geoapify');
const { searchGooglePlacesRestaurants } = require('./_googlePlaces');
const { withGeocodedCoordinates } = require('./_geocodeArea');

const DUPLICATE_DISTANCE_METERS = 80;
const LOOSE_DUPLICATE_DISTANCE_METERS = 180;
const TARGET_RESULT_COUNT = 50;
const MAX_GOOGLE_FALLBACK_COUNT = 20;
const MAX_MERGED_RESULT_COUNT = 300;

const normalizeComparableText = (value) =>
  String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[　、。，．・･\-ー－_'"`()（）【】\[\]]/g, '');

const asNumber = (value, fallback = undefined) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const NON_RESTAURANT_TERMS = [
  'beauty',
  'beautysalon',
  'hairsalon',
  'haircut',
  'hairmake',
  'barber',
  'nailsalon',
  'eyelash',
  'esthetic',
  'esthe',
  'cosmetic',
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

const isLikelyNonRestaurant = (restaurant) => {
  const source = normalizeComparableText([
    restaurant.name,
    restaurant.genre,
    restaurant.address,
    restaurant.note,
    restaurant.source,
    ...(restaurant.sourceFlags ?? []),
  ].join(' '));
  return NON_RESTAURANT_TERMS.some((term) => source.includes(normalizeComparableText(term)));
};

const filterRestaurantResults = (restaurants) =>
  restaurants.filter((restaurant) => !isLikelyNonRestaurant(restaurant));

const sourceFlagFor = (restaurant) => {
  if (Array.isArray(restaurant.sourceFlags) && restaurant.sourceFlags.length) {
    return restaurant.sourceFlags.map((flag) => String(flag).toLowerCase());
  }
  const provider = String(restaurant.externalProvider ?? restaurant.source ?? '').toUpperCase();
  if (provider === 'HOTPEPPER') return ['hotpepper'];
  if (provider === 'GEOAPIFY') return ['geoapify'];
  if (provider === 'GOOGLE_PLACES') return ['google_places'];
  return provider ? [provider.toLowerCase()] : [];
};

const getDistanceMeters = (first, second) => {
  const firstLatitude = asNumber(first.latitude, undefined);
  const firstLongitude = asNumber(first.longitude, undefined);
  const secondLatitude = asNumber(second.latitude, undefined);
  const secondLongitude = asNumber(second.longitude, undefined);
  if (![firstLatitude, firstLongitude, secondLatitude, secondLongitude].every(Number.isFinite)) {
    return null;
  }
  const toRadians = (value) => (value * Math.PI) / 180;
  const earthRadiusMeters = 6371000;
  const dLat = toRadians(secondLatitude - firstLatitude);
  const dLon = toRadians(secondLongitude - firstLongitude);
  const lat1 = toRadians(firstLatitude);
  const lat2 = toRadians(secondLatitude);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const sameProviderIdentity = (first, second) =>
  first.externalProvider
  && second.externalProvider
  && first.externalId
  && second.externalId
  && String(first.externalProvider).toUpperCase() === String(second.externalProvider).toUpperCase()
  && String(first.externalId) === String(second.externalId);

const comparableNamesMatch = (firstName, secondName) => {
  if (!firstName || !secondName) {
    return false;
  }
  return firstName === secondName
    || firstName.includes(secondName)
    || secondName.includes(firstName);
};

const comparableAddressesMatch = (firstAddress, secondAddress) => {
  if (!firstAddress || !secondAddress) {
    return false;
  }
  return firstAddress === secondAddress
    || firstAddress.includes(secondAddress)
    || secondAddress.includes(firstAddress);
};

const isSameRestaurant = (first, second) => {
  if (sameProviderIdentity(first, second)) {
    return true;
  }

  const firstName = normalizeComparableText(first.name);
  const secondName = normalizeComparableText(second.name);
  if (!comparableNamesMatch(firstName, secondName)) {
    return false;
  }

  const distanceMeters = getDistanceMeters(first, second);
  if (distanceMeters != null && distanceMeters <= DUPLICATE_DISTANCE_METERS) {
    return true;
  }

  const firstAddress = normalizeComparableText(first.address);
  const secondAddress = normalizeComparableText(second.address);
  if (comparableAddressesMatch(firstAddress, secondAddress)) {
    return distanceMeters == null || distanceMeters <= LOOSE_DUPLICATE_DISTANCE_METERS;
  }

  return false;
};

const mergeSourceFields = (first, second) => {
  const sourceFlags = [...new Set([...sourceFlagFor(first), ...sourceFlagFor(second)])];
  return {
    sourceFlags,
    source: sourceFlags.length > 1 ? 'merged' : sourceFlags[0] ?? first.source ?? second.source,
    hotpepperId: first.hotpepperId ?? second.hotpepperId
      ?? (String(first.externalProvider).toUpperCase() === 'HOTPEPPER' ? first.externalId : null)
      ?? (String(second.externalProvider).toUpperCase() === 'HOTPEPPER' ? second.externalId : null),
    geoapifyId: first.geoapifyId ?? second.geoapifyId
      ?? (String(first.externalProvider).toUpperCase() === 'GEOAPIFY' ? first.externalId : null)
      ?? (String(second.externalProvider).toUpperCase() === 'GEOAPIFY' ? second.externalId : null),
    googlePlaceId: first.googlePlaceId ?? second.googlePlaceId
      ?? (String(first.externalProvider).toUpperCase() === 'GOOGLE_PLACES' ? first.externalId : null)
      ?? (String(second.externalProvider).toUpperCase() === 'GOOGLE_PLACES' ? second.externalId : null),
    lastFetchedAt: first.lastFetchedAt ?? second.lastFetchedAt ?? new Date().toISOString(),
  };
};

const mergeRestaurant = (first, second) => ({
  ...first,
  address: first.address || second.address,
  area: first.area || second.area,
  genre: first.genre || second.genre,
  latitude: first.latitude ?? second.latitude,
  longitude: first.longitude ?? second.longitude,
  googleMapsUri: first.googleMapsUri ?? second.googleMapsUri,
  providerUrl: first.providerUrl ?? second.providerUrl,
  openNow: first.openNow ?? second.openNow,
  googleRating: first.googleRating ?? second.googleRating,
  note: first.note || second.note,
  ...mergeSourceFields(first, second),
});

const mergeRestaurants = (restaurants) => {
  const merged = [];
  for (const restaurant of restaurants.filter(Boolean)) {
    const existingIndex = merged.findIndex((candidate) => isSameRestaurant(candidate, restaurant));
    if (existingIndex >= 0) {
      merged[existingIndex] = mergeRestaurant(merged[existingIndex], restaurant);
    } else {
      merged.push(restaurant);
    }
  }
  return merged;
};

const safeProviderSearch = async (label, callback) => {
  try {
    return await callback();
  } catch (error) {
    console.warn(`[RANDISH] ${label} restaurant search failed`, error);
    return [];
  }
};

const hasCoordinates = (query = {}) =>
  Number.isFinite(asNumber(query.latitude, undefined))
  && Number.isFinite(asNumber(query.longitude, undefined));

const hasAreaFallback = (query = {}) =>
  typeof query.area === 'string'
  && query.area.trim()
  && query.area.trim() !== '現在地'
  && query.area.trim() !== '？';

const areaFallbackQuery = (query = {}) => {
  const fallback = { ...query };
  delete fallback.latitude;
  delete fallback.longitude;
  delete fallback.distanceMeters;
  delete fallback.radius;
  delete fallback.range;
  delete fallback.budgetMin;
  delete fallback.budgetMax;
  return fallback;
};

const searchAreaFallbackRestaurants = async (query = {}) => {
  if (!hasCoordinates(query) || !hasAreaFallback(query)) {
    return [];
  }
  return safeProviderSearch('Hot Pepper area fallback', () => searchHotPepperRestaurants(areaFallbackQuery(query)));
};

const resolveSearchQuery = async (query = {}) => {
  try {
    const resolvedQuery = await withGeocodedCoordinates(query, { defaultDistanceMeters: 3000 });
    return resolvedQuery.geocodedAreaSearchValue
      ? { ...resolvedQuery, area: resolvedQuery.geocodedAreaSearchValue }
      : resolvedQuery;
  } catch (error) {
    console.warn('[RANDISH] Area geocode failed', error);
    return query;
  }
};

const searchMergedRestaurants = async (query = {}) => {
  const resolvedQuery = await resolveSearchQuery(query);
  const hotPepperRestaurants = await safeProviderSearch('Hot Pepper', () => searchHotPepperRestaurants(resolvedQuery));
  const geoapifyRestaurants = await safeProviderSearch('Geoapify', () => searchGeoapifyRestaurants(resolvedQuery));
  const areaFallbackRestaurants = hotPepperRestaurants.length || geoapifyRestaurants.length
    ? []
    : await searchAreaFallbackRestaurants(resolvedQuery);
  const primaryRestaurants = mergeRestaurants([...hotPepperRestaurants, ...geoapifyRestaurants, ...areaFallbackRestaurants]);
  const googleLimit = Math.min(MAX_GOOGLE_FALLBACK_COUNT, Math.max(0, TARGET_RESULT_COUNT - primaryRestaurants.length));
  if (googleLimit <= 0) {
    return filterRestaurantResults(primaryRestaurants).slice(0, MAX_MERGED_RESULT_COUNT);
  }

  const googleRestaurants = await safeProviderSearch(
    'Google Places',
    () => searchGooglePlacesRestaurants(resolvedQuery, { limit: googleLimit }),
  );
  return filterRestaurantResults(mergeRestaurants([...primaryRestaurants, ...googleRestaurants])).slice(0, MAX_MERGED_RESULT_COUNT);
};

module.exports = {
  mergeRestaurants,
  searchMergedRestaurants,
};
