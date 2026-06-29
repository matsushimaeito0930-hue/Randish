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
  nextOpenTime?: string | null;
  nextCloseTime?: string | null;
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
  distanceMeters?: number;
};

export type RandomRestaurantParams = RestaurantSearchParams & {
  userId: string;
};

export type CandidatePlace = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  categories: string[];
  rating?: number | null;
  priceLevel?: number | null;
  openNow?: boolean | null;
  address?: string | null;
  distanceMeters?: number | null;
  googleMapsUri?: string | null;
};

export type NearbyPlacesParams = {
  latitude: number;
  longitude: number;
  radius: number;
  category?: string;
  priceRange?: string;
  openNow?: boolean;
};

export type NearbyPlacesResponse = {
  places: CandidatePlace[];
  cacheHit: boolean;
  source: 'GOOGLE_PLACES' | 'MOCK_PLACES' | string;
  fetchedAt: string;
  message: string;
};

export type User = {
  id: string;
  email: string;
  displayName: string;
  authProvider: string;
  createdAt: string;
  updatedAt: string;
};

export type UserCreateParams = {
  email: string;
  password?: string;
  displayName?: string;
};

export type UserLoginParams = {
  email: string;
  password: string;
};

export type AuthResponse = {
  user: User;
  accessToken: string | null;
  refreshToken?: string | null;
};

export type PremiumStatus = {
  isPro: boolean;
  entitlementKey: string;
  source: 'FREE' | 'GRANT' | 'SUBSCRIPTION' | string;
  activeUntil: string | null;
  provider: string | null;
  environment: string | null;
};

export type AiReportPayload = Record<string, unknown>;

export type AiReportResponse = {
  title?: string;
  summary?: string;
  mood?: string;
  highlights?: string[];
  recommendations?: string[];
  savingsTips?: string[];
  nextAction?: string;
  closingNotes?: string[];
  generatedAt?: string;
  source?: 'gemini' | 'fallback' | 'demo' | string;
};

export type EmailVerificationResponse = {
  email: string;
  expiresAt: string;
};

export type OAuthProvider = 'google' | 'apple';

export type OAuthAuthorizeResponse = {
  provider: OAuthProvider;
  authorizationUrl: string;
  redirectTo: string;
};

export type OAuthSessionParams = {
  accessToken: string;
};

export type OAuthRefreshParams = {
  refreshToken: string;
};

export type RandomHistory = {
  id: string;
  userId: string;
  provider: string;
  providerPlaceId: string;
  restaurantId: string | null;
  restaurant: Restaurant | null;
  area: string | null;
  genre: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  rangeMeters: number | null;
  createdAt: string;
};

export type Favorite = {
  id: string;
  userId: string;
  provider: string;
  providerPlaceId: string;
  restaurantId: string | null;
  savedArea: string | null;
  savedGenre: string | null;
  savedBudgetMin: number | null;
  savedBudgetMax: number | null;
  savedRangeMeters: number | null;
  userMemo: string | null;
  userTags: string | null;
  restaurant: Restaurant | null;
  createdAt: string;
};

export type FavoriteCreateParams = {
  userId: string;
  restaurantId?: string | null;
  provider: string;
  providerPlaceId: string;
  savedArea?: string | null;
  savedGenre?: string | null;
  savedBudgetMin?: number | null;
  savedBudgetMax?: number | null;
  savedRangeMeters?: number | null;
  userMemo?: string | null;
  userTags?: string | null;
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

export type ApiUsageProvider = {
  key: string;
  name: string;
  used: number;
  limit: number;
  remaining: number;
  display: string;
  available?: boolean;
};

export type ApiUsageResponse = {
  generatedAt: string;
  providers: ApiUsageProvider[];
};

type RequestOptions = {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
  skipAuth?: boolean;
  headers?: Record<string, string>;
};

type ApiBaseUrlInput = string | readonly string[];
type ApiErrorKind = 'connection' | 'timeout' | 'http';

const REQUEST_TIMEOUT_MS = 5000;
const REQUEST_TOTAL_TIMEOUT_MS = 9000;
const MIN_REQUEST_TIMEOUT_MS = 1200;

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
let authToken: string | null = null;

export const getLastSuccessfulBaseUrl = () => lastSuccessfulBaseUrl;
export const setAuthToken = (token: string | null) => {
  authToken = token;
};

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

const requestUrl = async <T>(url: string, options: RequestOptions = {}, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> => {
  const controller = new AbortController();
  const safeTimeoutMs = Math.max(MIN_REQUEST_TIMEOUT_MS, timeoutMs);
  const timeoutId = setTimeout(() => controller.abort(), safeTimeoutMs);

  let response: Response;
  try {
    const headers: Record<string, string> = { ...(options.headers ?? {}) };
    if (options.body) {
      headers['Content-Type'] = 'application/json';
    }
    if (authToken && !options.skipAuth) {
      headers.Authorization = `Bearer ${authToken}`;
    }

    response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: Object.keys(headers).length ? headers : undefined,
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
  const startedAt = Date.now();

  for (const candidate of candidates) {
    const remainingMs = REQUEST_TOTAL_TIMEOUT_MS - (Date.now() - startedAt);
    if (remainingMs <= 0) {
      break;
    }

    try {
      const result = await requestUrl<T>(
        buildUrl(candidate, path, params),
        options,
        Math.min(REQUEST_TIMEOUT_MS, remainingMs),
      );
      lastSuccessfulBaseUrl = candidate;
      return result;
    } catch (error) {
      lastError = error;
      if (candidates.length > 1 && isApiConnectivityError(error) && Date.now() - startedAt < REQUEST_TOTAL_TIMEOUT_MS) {
        continue;
      }
      throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('RANDISH API request failed.');
};

export const randishApi = {
  getLastSuccessfulBaseUrl,
  setAuthToken,

  getRestaurants: (baseUrl: ApiBaseUrlInput, params?: RestaurantSearchParams) =>
    request<Restaurant[]>(baseUrl, 'api/restaurants', params),

  getRestaurant: (baseUrl: ApiBaseUrlInput, restaurantId: string) =>
    request<Restaurant>(baseUrl, `api/restaurants/${restaurantId}`),

  getAdminApiUsage: (baseUrl: ApiBaseUrlInput, password: string) =>
    request<ApiUsageResponse>(baseUrl, 'api/admin/api-usage', undefined, {
      headers: { 'X-Randish-Admin-Password': password },
      skipAuth: true,
    }),

  registerUser: (baseUrl: ApiBaseUrlInput, params: UserCreateParams) =>
    request<EmailVerificationResponse>(baseUrl, 'api/auth/register', undefined, {
      method: 'POST',
      body: params,
      skipAuth: true,
    }),

  requestEmailRegistration: (baseUrl: ApiBaseUrlInput, params: UserCreateParams) =>
    request<EmailVerificationResponse>(baseUrl, 'api/auth/register/request', undefined, {
      method: 'POST',
      body: params,
      skipAuth: true,
    }),

  login: (baseUrl: ApiBaseUrlInput, params: UserLoginParams) =>
    request<AuthResponse>(baseUrl, 'api/auth/login', undefined, {
      method: 'POST',
      body: params,
      skipAuth: true,
    }),

  logout: (baseUrl: ApiBaseUrlInput) =>
    request<void>(baseUrl, 'api/auth/logout', undefined, { method: 'POST', skipAuth: true }),

  getOAuthAuthorizeUrl: (baseUrl: ApiBaseUrlInput, provider: OAuthProvider, redirectTo: string) =>
    request<OAuthAuthorizeResponse>(baseUrl, `api/auth/oauth/${provider}/authorize`, { redirectTo }, { skipAuth: true }),

  loginWithOAuthSession: (baseUrl: ApiBaseUrlInput, params: OAuthSessionParams) =>
    request<AuthResponse>(baseUrl, 'api/auth/oauth/session', undefined, {
      method: 'POST',
      body: params,
      skipAuth: true,
    }),

  refreshOAuthSession: (baseUrl: ApiBaseUrlInput, params: OAuthRefreshParams) =>
    request<AuthResponse>(baseUrl, 'api/auth/oauth/refresh', undefined, {
      method: 'POST',
      body: params,
    }),

  getCurrentUser: (baseUrl: ApiBaseUrlInput) =>
    request<AuthResponse>(baseUrl, 'api/users/me'),

  getUser: (baseUrl: ApiBaseUrlInput, userId: string) =>
    request<User>(baseUrl, `api/users/${userId}`),

  getPremiumStatus: (baseUrl: ApiBaseUrlInput, userId: string) =>
    request<PremiumStatus>(baseUrl, 'api/premium/status', { userId }),

  generateAiReport: (baseUrl: ApiBaseUrlInput, userId: string, payload: AiReportPayload) =>
    request<AiReportResponse>(baseUrl, 'api/premium/ai-report', { userId }, {
      method: 'POST',
      body: payload,
    }),

  chooseRandom: (baseUrl: ApiBaseUrlInput, params: RandomRestaurantParams) =>
    request<Restaurant>(baseUrl, 'api/restaurants/random', params),

  getNearbyPlaces: (baseUrl: ApiBaseUrlInput, params: NearbyPlacesParams) =>
    request<NearbyPlacesResponse>(baseUrl, 'api/places/nearby', undefined, {
      method: 'POST',
      body: params,
    }),

  getRandomHistories: (baseUrl: ApiBaseUrlInput, userId: string) =>
    request<RandomHistory[]>(baseUrl, `api/random-histories/user/${userId}`),

  getRandomHistoryRestaurant: (baseUrl: ApiBaseUrlInput, historyId: string) =>
    request<Restaurant>(baseUrl, `api/random-histories/${historyId}/restaurant`),

  addFavorite: (baseUrl: ApiBaseUrlInput, favorite: FavoriteCreateParams) =>
    request<Favorite>(baseUrl, 'api/favorites', undefined, {
      method: 'POST',
      body: favorite,
    }),

  removeFavorite: (baseUrl: ApiBaseUrlInput, favoriteId: string) =>
    request<void>(baseUrl, `api/favorites/${favoriteId}`, undefined, { method: 'DELETE' }),

  getFavorites: (baseUrl: ApiBaseUrlInput, userId: string) =>
    request<Favorite[]>(baseUrl, `api/favorites/user/${userId}`),

  getFavoriteRestaurant: (baseUrl: ApiBaseUrlInput, favoriteId: string) =>
    request<Restaurant>(baseUrl, `api/favorites/${favoriteId}/restaurant`),

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
