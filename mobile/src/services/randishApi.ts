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
  photoAttributions?: PhotoAttribution[];
  premiumDetails?: PremiumPlaceDetails | null;
  facilities?: RestaurantFacilities | null;
};

/**
 * 席・設備。ホットペッパーの検索結果にもとから含まれている項目。
 * 「なぜこの店なのか」を、評価や価格帯ではなく個室・座敷・お子様連れ可といった
 * シチュエーションに直接効く事実で説明するために使う。
 */
export type RestaurantFacilities = {
  privateRoom?: boolean | null;
  tatami?: boolean | null;
  horigotatsu?: boolean | null;
  childFriendly?: boolean | null;
  charter?: boolean | null;
  freeDrink?: boolean | null;
  freeFood?: boolean | null;
  course?: boolean | null;
  lunch?: boolean | null;
  openLate?: boolean | null;
  parking?: boolean | null;
  barrierFree?: boolean | null;
  nonSmoking?: boolean | null;
  englishMenu?: boolean | null;
  capacity?: number | null;
  partyCapacity?: number | null;
  stationName?: string | null;
  openHours?: string | null;
};

export type PremiumPlaceDetails = {
  goodForChildren?: boolean | null;
  goodForGroups?: boolean | null;
  menuForChildren?: boolean | null;
  reservable?: boolean | null;
  dineIn?: boolean | null;
  takeout?: boolean | null;
  delivery?: boolean | null;
  outdoorSeating?: boolean | null;
  allowsDogs?: boolean | null;
  restroom?: boolean | null;
  servesVegetarianFood?: boolean | null;
  googleUserRatingCount?: number | null;
  paymentOptions?: string[];
  parkingOptions?: string[];
  accessibilityOptions?: string[];
};

export type PhotoAttribution = {
  displayName: string;
  uri?: string | null;
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
  /**
   * 誰の検索かをサーバーに伝える。Premium と dev のときだけ Google Places も引くため。
   * 無しでも検索はできる（無料枠として扱われる）。
   */
  userId?: string;
};

export type RandomRestaurantParams = RestaurantSearchParams & {
  userId: string;
};

export type CandidatePlace = {
  id: string;
  provider?: string | null;
  providerPlaceId?: string | null;
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
  photoUrl?: string | null;
  photoAttributions?: PhotoAttribution[];
};

export type NearbyPlacesParams = {
  latitude: number;
  longitude: number;
  radius: number;
  category?: string;
  priceRange?: string;
  openNow?: boolean;
  minRating?: number;
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
  source: 'FREE' | 'GRANT' | 'SUBSCRIPTION' | 'DEV' | string;
  activeUntil: string | null;
  provider: string | null;
  environment: string | null;
  /** 開発者権限。サーバー側の premium_grants でのみ付与される。 */
  isDev?: boolean;
};

export type AreaCenter = {
  area: string;
  latitude: number;
  longitude: number;
  sampleCount: number;
  spreadMeters: number;
  source: string;
};

export type DevDiagnostics = {
  generatedAt: string;
  providers: Record<string, unknown>[];
  apiUsage: Record<string, unknown>[];
  probe?: Record<string, unknown>;
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

export type FoodAiRecommendationPayload = Record<string, unknown>;

export type FoodAiRecommendationResponse = {
  candidateId?: string;
  headline?: string;
  reason?: string;
  comparison?: string;
  generatedAt?: string;
  source?: 'gemini' | 'fallback' | string;
};

export type EmailVerificationResponse = {
  email: string;
  expiresAt: string;
};

export type MagicLinkParams = {
  email: string;
  createUser?: boolean;
  redirectTo?: string;
  appRedirectTo?: string;
};

export type EmailOtpVerifyParams = {
  email: string;
  token: string;
};

export type PasswordResetRequestParams = {
  email: string;
  redirectTo?: string;
  appRedirectTo?: string;
};

export type PasswordResetConfirmParams = {
  accessToken: string;
  password: string;
};

export type ContactParams = {
  name: string;
  email: string;
  subject: string;
  content: string;
};

export type ContactResponse = {
  success: boolean;
  message: string;
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
  userRating: number | null;
  /** 本人が入力した実際の支払額。null は未入力で、そのときは予算帯から推定する。 */
  actualSpend: number | null;
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

export type RandomHistoryCreateParams = {
  userId: string;
  restaurantId?: string | null;
  provider: string;
  providerPlaceId: string;
  area?: string | null;
  genre?: string | null;
  budgetMin?: number | null;
  budgetMax?: number | null;
  rangeMeters?: number | null;
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
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  skipAuth?: boolean;
  timeoutMs?: number;
  totalTimeoutMs?: number;
};

type ApiBaseUrlInput = string | readonly string[];
type ApiErrorKind = 'connection' | 'timeout' | 'http';

// サーバー（Render無料プラン）はスリープからの復帰に60秒前後かかることがある。
// 以前は5秒/合計9秒で諦めていたため、起動待ちのあいだ通信が必ず失敗し、
// 画面には「候補0件」と出てしまっていた。起動を待てる長さにする。
const REQUEST_TIMEOUT_MS = 30000;
const REQUEST_TOTAL_TIMEOUT_MS = 75000;
const MAGIC_LINK_REQUEST_TIMEOUT_MS = 75000;
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
  const requestTimeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const totalTimeoutMs = options.totalTimeoutMs ?? REQUEST_TOTAL_TIMEOUT_MS;

  for (const candidate of candidates) {
    const remainingMs = totalTimeoutMs - (Date.now() - startedAt);
    if (remainingMs <= 0) {
      break;
    }

    try {
      const result = await requestUrl<T>(
        buildUrl(candidate, path, params),
        options,
        Math.min(requestTimeoutMs, remainingMs),
      );
      lastSuccessfulBaseUrl = candidate;
      return result;
    } catch (error) {
      lastError = error;
      if (candidates.length > 1 && isApiConnectivityError(error) && Date.now() - startedAt < totalTimeoutMs) {
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

  warmAuth: (baseUrl: ApiBaseUrlInput) =>
    request<void>(baseUrl, 'api/auth/ready', undefined, {
      skipAuth: true,
      timeoutMs: 15000,
      totalTimeoutMs: 15000,
    }),

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

  requestMagicLink: (baseUrl: ApiBaseUrlInput, params: MagicLinkParams) =>
    request<EmailVerificationResponse>(baseUrl, 'api/auth/magic-link', undefined, {
      method: 'POST',
      body: params,
      skipAuth: true,
      timeoutMs: MAGIC_LINK_REQUEST_TIMEOUT_MS,
      totalTimeoutMs: MAGIC_LINK_REQUEST_TIMEOUT_MS,
    }),

  verifyEmailOtp: (baseUrl: ApiBaseUrlInput, params: EmailOtpVerifyParams) =>
    request<AuthResponse>(baseUrl, 'api/auth/otp/verify', undefined, {
      method: 'POST',
      body: params,
      skipAuth: true,
    }),

  requestPasswordReset: (baseUrl: ApiBaseUrlInput, params: PasswordResetRequestParams) =>
    request<EmailVerificationResponse>(baseUrl, 'api/auth/password/reset/request', undefined, {
      method: 'POST',
      body: params,
      skipAuth: true,
    }),

  confirmPasswordReset: (baseUrl: ApiBaseUrlInput, params: PasswordResetConfirmParams) =>
    request<AuthResponse>(baseUrl, 'api/auth/password/reset/confirm', undefined, {
      method: 'POST',
      body: params,
      skipAuth: true,
    }),

  sendContact: (baseUrl: ApiBaseUrlInput, params: ContactParams) =>
    request<ContactResponse>(baseUrl, 'api/contact', undefined, {
      method: 'POST',
      body: params,
      skipAuth: true,
    }),

  logout: (baseUrl: ApiBaseUrlInput) =>
    request<void>(baseUrl, 'api/auth/logout', undefined, { method: 'POST', skipAuth: true }),

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

  getDevDiagnostics: (baseUrl: ApiBaseUrlInput, userId: string, probe = false) =>
    request<DevDiagnostics>(baseUrl, 'api/premium/dev-diagnostics', {
      userId,
      ...(probe ? { probe: 'true' } : {}),
    }),

  generateAiReport: (baseUrl: ApiBaseUrlInput, userId: string, payload: AiReportPayload) =>
    request<AiReportResponse>(baseUrl, 'api/premium/ai-report', { userId }, {
      method: 'POST',
      body: payload,
    }),

  generateFoodAiRecommendation: (baseUrl: ApiBaseUrlInput, userId: string, payload: FoodAiRecommendationPayload) =>
    request<FoodAiRecommendationResponse>(baseUrl, 'api/premium/food-ai', { userId }, {
      method: 'POST',
      body: payload,
    }),

  chooseRandom: (baseUrl: ApiBaseUrlInput, params: RandomRestaurantParams) =>
    request<Restaurant>(baseUrl, 'api/restaurants/random', params),

  /** エリア名から検索の中心座標を取得する。解決できない場合は 204 が返るので null になる。 */
  getAreaCenter: (baseUrl: ApiBaseUrlInput, area: string) =>
    request<AreaCenter | null>(baseUrl, 'api/places/area-center', { area }),

  getNearbyPlaces: (baseUrl: ApiBaseUrlInput, params: NearbyPlacesParams) =>
    request<NearbyPlacesResponse>(baseUrl, 'api/places/nearby', undefined, {
      method: 'POST',
      body: params,
    }),

  enrichPremiumBusinessStatus: (baseUrl: ApiBaseUrlInput, restaurant: Restaurant) =>
    request<Restaurant>(baseUrl, 'api/google-places/business-status', undefined, {
      method: 'POST',
      body: restaurant,
    }),

  getRandomHistories: (baseUrl: ApiBaseUrlInput, userId: string) =>
    request<RandomHistory[]>(baseUrl, `api/random-histories/user/${userId}`),

  getRandomHistoryRestaurant: (baseUrl: ApiBaseUrlInput, historyId: string) =>
    request<Restaurant>(baseUrl, `api/random-histories/${historyId}/restaurant`),

  addRandomHistory: (baseUrl: ApiBaseUrlInput, history: RandomHistoryCreateParams) =>
    request<RandomHistory>(baseUrl, 'api/random-histories', undefined, {
      method: 'POST',
      body: history,
    }),

  updateRandomHistoryRating: (baseUrl: ApiBaseUrlInput, historyId: string, rating: number) =>
    request<RandomHistory>(baseUrl, `api/random-histories/${historyId}/rating`, undefined, {
      method: 'PATCH',
      body: { rating },
    }),

  /** 実際に払った額を記録する。null を渡すと未入力に戻す。 */
  updateRandomHistorySpend: (baseUrl: ApiBaseUrlInput, historyId: string, actualSpend: number | null) =>
    request<RandomHistory>(baseUrl, `api/random-histories/${historyId}/spend`, undefined, {
      method: 'PATCH',
      body: { actualSpend },
    }),

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
