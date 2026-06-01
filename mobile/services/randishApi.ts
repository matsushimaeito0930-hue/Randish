export type Restaurant = {
  id: string;
  externalProvider: string;
  externalId: string;
  name: string;
  area: string;
  genre: string;
  budgetMin: number;
  budgetMax: number;
  rating: number;
  minutes: number;
  address: string;
  photoUrl: string | null;
  note: string;
  latitude?: number | null;
  longitude?: number | null;
  googleRating?: number | null;
  googleMapsUri?: string | null;
  openNow?: boolean | null;
  googlePlaceId?: string | null;
};

export type RestaurantSearchParams = {
  area?: string;
  genre?: string;
  budgetMin?: number;
  budgetMax?: number;
  latitude?: number;
  longitude?: number;
  range?: number;
};

export type RandomRestaurantParams = RestaurantSearchParams & {
  userId: string;
};

export type RandomHistory = {
  id: string;
  userId: string;
  restaurant: Restaurant;
  area: string | null;
  genre: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  createdAt: string;
};

export type Favorite = {
  id: string;
  userId: string;
  restaurant: Restaurant;
  createdAt: string;
};

export type Visit = {
  id: string;
  userId: string;
  restaurant: Restaurant;
  visitDate: string;
  photoUrl: string | null;
  memo: string | null;
  rating: number;
  createdAt: string;
};

export type Statistics = {
  userId: string;
  totalVisits: number;
  favoriteGenre: string | null;
  favoriteArea: string | null;
  monthlyVisitCount: Record<string, number>;
  newRestaurantRate: number;
  favoriteCount: number;
  visitedRestaurantCount: number;
};

type RequestOptions = {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
};

type ApiBaseUrlInput = string | readonly string[];
type ApiErrorKind = 'connection' | 'timeout' | 'http';

const REQUEST_TIMEOUT_MS = 25000;

export class RandishApiError extends Error {
  constructor(
    message: string,
    public readonly kind: ApiErrorKind,
    public readonly url: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'RandishApiError';
  }
}

let lastSuccessfulBaseUrl: string | null = null;

export const getLastSuccessfulBaseUrl = () => lastSuccessfulBaseUrl;

export const isApiConnectivityError = (error: unknown) =>
  error instanceof RandishApiError && (error.kind === 'connection' || error.kind === 'timeout');

export const normalizeBaseUrl = (baseUrl: string) =>
  baseUrl
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/api\/restaurants$/, '');

const uniqueBaseUrls = (baseUrls: string[]) => {
  const seen = new Set<string>();
  return baseUrls
    .map(normalizeBaseUrl)
    .filter(Boolean)
    .filter((baseUrl) => {
      if (seen.has(baseUrl)) {
        return false;
      }
      seen.add(baseUrl);
      return true;
    });
};

const toBaseUrlCandidates = (baseUrl: ApiBaseUrlInput) => {
  const requestedBaseUrls = Array.isArray(baseUrl) ? [...baseUrl] : [baseUrl];
  const preferredBaseUrl = lastSuccessfulBaseUrl && requestedBaseUrls.includes(lastSuccessfulBaseUrl)
    ? [lastSuccessfulBaseUrl]
    : [];
  return uniqueBaseUrls([...preferredBaseUrl, ...requestedBaseUrls]);
};

const buildUrl = (baseUrl: string, path: string, params?: Record<string, string | number | undefined>) => {
  const cleanBaseUrl = normalizeBaseUrl(baseUrl);
  const cleanPath = path.replace(/^\/+/, '');
  const query = Object.entries(params ?? {})
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
  return `${cleanBaseUrl}/${cleanPath}${query ? `?${query}` : ''}`;
};

const requestUrl = async <T>(url: string, options: RequestOptions = {}): Promise<T> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new RandishApiError(`API timeout: ${url}`, 'timeout', url);
    }
    throw new RandishApiError(`API connection failed: ${url}`, 'connection', url);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const message = errorBody?.message ?? `RANDISH API error: ${response.status}`;
    throw new RandishApiError(`${message} (${url})`, 'http', url, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
};

const request = async <T>(
  baseUrl: ApiBaseUrlInput,
  path: string,
  params?: Record<string, string | number | undefined>,
  options: RequestOptions = {},
): Promise<T> => {
  const candidates = toBaseUrlCandidates(baseUrl);
  let lastError: unknown;

  for (const candidate of candidates) {
    try {
      const result = await requestUrl<T>(buildUrl(candidate, path, params), options);
      lastSuccessfulBaseUrl = candidate;
      return result;
    } catch (error) {
      lastError = error;
      if (candidates.length > 1 && isApiConnectivityError(error)) {
        continue;
      }
      throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('RANDISH API request failed.');
};

export const randishApi = {
  getLastSuccessfulBaseUrl,

  getRestaurants: (baseUrl: ApiBaseUrlInput, params?: RestaurantSearchParams) =>
    request<Restaurant[]>(baseUrl, 'api/restaurants', params),

  getRestaurant: (baseUrl: ApiBaseUrlInput, restaurantId: string) =>
    request<Restaurant>(baseUrl, `api/restaurants/${restaurantId}`),

  chooseRandom: (baseUrl: ApiBaseUrlInput, params: RandomRestaurantParams) =>
    request<Restaurant>(baseUrl, 'api/restaurants/random', params),

  getRandomHistories: (baseUrl: ApiBaseUrlInput, userId: string) =>
    request<RandomHistory[]>(baseUrl, `api/random-histories/user/${userId}`),

  addFavorite: (baseUrl: ApiBaseUrlInput, userId: string, restaurantId: string) =>
    request<Favorite>(baseUrl, 'api/favorites', undefined, {
      method: 'POST',
      body: { userId, restaurantId },
    }),

  removeFavorite: (baseUrl: ApiBaseUrlInput, favoriteId: string) =>
    request<void>(baseUrl, `api/favorites/${favoriteId}`, undefined, { method: 'DELETE' }),

  getFavorites: (baseUrl: ApiBaseUrlInput, userId: string) =>
    request<Favorite[]>(baseUrl, `api/favorites/user/${userId}`),

  addVisit: (baseUrl: ApiBaseUrlInput, visit: {
    userId: string;
    restaurantId: string;
    visitDate?: string;
    photoUrl?: string;
    memo?: string;
    rating?: number;
  }) =>
    request<Visit>(baseUrl, 'api/visits', undefined, {
      method: 'POST',
      body: visit,
    }),

  getVisits: (baseUrl: ApiBaseUrlInput, userId: string) =>
    request<Visit[]>(baseUrl, `api/visits/user/${userId}`),

  getStatistics: (baseUrl: ApiBaseUrlInput, userId: string) =>
    request<Statistics>(baseUrl, `api/statistics/user/${userId}`),
};
