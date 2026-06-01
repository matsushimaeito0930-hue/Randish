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

const REQUEST_TIMEOUT_MS = 25000;

const normalizeBaseUrl = (baseUrl: string) =>
  baseUrl
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/api\/restaurants$/, '');

const buildUrl = (baseUrl: string, path: string, params?: Record<string, string | number | undefined>) => {
  const cleanBaseUrl = normalizeBaseUrl(baseUrl);
  const cleanPath = path.replace(/^\/+/, '');
  const query = Object.entries(params ?? {})
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
  return `${cleanBaseUrl}/${cleanPath}${query ? `?${query}` : ''}`;
};

const request = async <T>(url: string, options: RequestOptions = {}): Promise<T> => {
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
      throw new Error(`API timeout: ${url}`);
    }
    throw new Error(`API connection failed: ${url}`);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const message = errorBody?.message ?? `RANDISH API error: ${response.status}`;
    throw new Error(`${message} (${url})`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
};

export const randishApi = {
  getRestaurants: (baseUrl: string, params?: RestaurantSearchParams) =>
    request<Restaurant[]>(buildUrl(baseUrl, 'api/restaurants', params)),

  getRestaurant: (baseUrl: string, restaurantId: string) =>
    request<Restaurant>(buildUrl(baseUrl, `api/restaurants/${restaurantId}`)),

  chooseRandom: (baseUrl: string, params: RandomRestaurantParams) =>
    request<Restaurant>(buildUrl(baseUrl, 'api/restaurants/random', params)),

  getRandomHistories: (baseUrl: string, userId: string) =>
    request<RandomHistory[]>(buildUrl(baseUrl, `api/random-histories/user/${userId}`)),

  addFavorite: (baseUrl: string, userId: string, restaurantId: string) =>
    request<Favorite>(buildUrl(baseUrl, 'api/favorites'), {
      method: 'POST',
      body: { userId, restaurantId },
    }),

  removeFavorite: (baseUrl: string, favoriteId: string) =>
    request<void>(buildUrl(baseUrl, `api/favorites/${favoriteId}`), { method: 'DELETE' }),

  getFavorites: (baseUrl: string, userId: string) =>
    request<Favorite[]>(buildUrl(baseUrl, `api/favorites/user/${userId}`)),

  addVisit: (baseUrl: string, visit: {
    userId: string;
    restaurantId: string;
    visitDate?: string;
    photoUrl?: string;
    memo?: string;
    rating?: number;
  }) =>
    request<Visit>(buildUrl(baseUrl, 'api/visits'), {
      method: 'POST',
      body: visit,
    }),

  getVisits: (baseUrl: string, userId: string) =>
    request<Visit[]>(buildUrl(baseUrl, `api/visits/user/${userId}`)),

  getStatistics: (baseUrl: string, userId: string) =>
    request<Statistics>(buildUrl(baseUrl, `api/statistics/user/${userId}`)),
};
