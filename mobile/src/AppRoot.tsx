import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  ImageSourcePropType,
  Keyboard,
  Linking,
  Modal,
  NativeModules,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  View,
} from 'react-native';
import { isApiConnectivityError, RandishApiError, randishApi, Restaurant as ApiRestaurant } from './services/randishApi';
import type { AuthResponse, CandidatePlace, Favorite as ApiFavorite, OAuthProvider, PremiumStatus as ApiPremiumStatus, RandomHistory as ApiRandomHistory } from './services/randishApi';
import {
  getNativeBillingSetupMessage,
  presentPremiumPaywall,
  refreshNativePremiumStatus,
  restorePremiumPurchases,
  TRUST_NATIVE_REVENUECAT_STATUS,
} from './services/premiumBilling';
import { JAPAN_MUNICIPALITY_PRESETS } from './data/japanMunicipalities';
import { FontAwesome, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Circle, G } from 'react-native-svg';
import { getNativeMapModule } from './services/optionalMap';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import * as ImagePicker from 'expo-image-picker';
import * as SecureStore from 'expo-secure-store';
import { FAVORITE_PINK, INK, ORANGE } from './constants/theme';
import { styles } from './styles/appStyles';

WebBrowser.maybeCompleteAuthSession();

const consumedOAuthCallbackUrls = new Set<string>();
const MIDNIGHT_PURPLE = '#6c63ff';

type AppStage = 'splash' | 'login' | 'loggedOut' | 'main';
type TabKey = 'home' | 'search' | 'random' | 'save' | 'analytics';
type DrawAnimationKey = 'roulette' | 'lottery' | 'shuffle' | 'radar';
type DrawMode = 'condition' | 'everything' | 'travel';
type ConditionRandomField = 'area' | 'budget' | 'distance' | 'genre';
type MealSlotKey = 'morning' | 'lunch' | 'dinner' | 'midnight';
type TravelRevealStep = 'hidden' | 'genre' | 'area' | 'restaurant';
type AppLanguage = 'ja' | 'en' | 'zh' | 'ko';
type AlbumViewKey = 'photos' | 'slideshow' | 'favorites' | 'history';

type ConditionRandomState = Record<ConditionRandomField, boolean>;

type MealTicketDefinition = {
  key: MealSlotKey;
  label: string;
  timeLabel: string;
  startMinute: number;
  endMinute: number;
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
  genreHints: string[];
  proOnly?: boolean;
};

type MealTicketView = MealTicketDefinition & {
  active: boolean;
  used: boolean;
  past: boolean;
  available: boolean;
  locked: boolean;
  statusLabel: string;
  countdownLabel: string;
  upcomingStartAt: string;
};

type MealTicketState = {
  tickets: MealTicketView[];
  current: MealTicketView;
  nextUnlockLabel: string;
  nextUnlockAt: string;
  usedFreeCount: number;
  totalFreeCount: number;
  isProUser: boolean;
};

type Restaurant = ApiRestaurant & {
  priceRange?: string;
  latitude?: number;
  longitude?: number;
};

type DrawHistoryEntry = {
  id: string;
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

type SavedRestaurant = {
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
  createdAt: string;
  photoUri?: string | null;
  photoTakenAt?: string | null;
  snapshot?: Restaurant | null;
};

type AlbumPhotoEntry = {
  id: string;
  photoUri: string;
  createdAt: string;
  title: string;
  subtitle: string;
};

type AlbumPhotoPreview = {
  photoUri: string;
  imageSource?: ImageSourcePropType;
  title: string;
  subtitle: string;
  dateLabel: string;
};

type AlbumDiaryItem = {
  id: string;
  photoUri: string;
  photoSource?: ImageSourcePropType;
  createdAt: string;
  title: string;
  subtitle: string;
  source: 'album' | 'saved';
  onRetake?: () => void;
  onOpenSaved?: () => void;
};

type SubscriptionState = {
  isPro: boolean;
  source: 'free' | 'server' | 'native' | 'error';
  status: 'idle' | 'loading' | 'ready' | 'error';
  activeUntil: string | null;
  startProPurchase: () => void;
  restoreProPurchase: () => void;
  refresh: () => Promise<void>;
};

type AnalyticsTrendItem = {
  label: string;
  count: number;
  estimatedSpend: number;
};

type MonthlyAnalytics = {
  monthDate: Date;
  monthLabel: string;
  draws: DrawHistoryEntry[];
  drawCount: number;
  estimatedSpend: number;
  budgetSampleCount: number;
  averageBudget: number;
  weekSpends: Array<{ label: string; amount: number; percent: number }>;
  recentDraws: DrawHistoryEntry[];
  genreAnalytics: AnalyticsTrendItem[];
  areaAnalytics: AnalyticsTrendItem[];
  priceRangeAnalytics: AnalyticsTrendItem[];
  topGenre: string;
  topArea: string;
};

type SavedRestaurantAnalytics = {
  totalSaved: number;
  genreAnalytics: AnalyticsTrendItem[];
  priceRangeAnalytics: AnalyticsTrendItem[];
};

type YearlyAnalytics = {
  year: number;
  yearLabel: string;
  entries: DrawHistoryEntry[];
  drawCount: number;
  estimatedSpend: number;
  budgetSampleCount: number;
  averageBudget: number;
  genreAnalytics: AnalyticsTrendItem[];
  areaAnalytics: AnalyticsTrendItem[];
  priceRangeAnalytics: AnalyticsTrendItem[];
  monthlyAnalytics: MonthlyAnalytics[];
  topGenre: string;
  topArea: string;
  topMonth: MonthlyAnalytics | null;
  activeMonthCount: number;
};

type YearlyWrappedReport = {
  title: string;
  subtitle: string;
  heroLine: string;
  totalMealsLabel: string;
  totalSpendLabel: string;
  averageBudgetLabel: string;
  topGenreLabel: string;
  topAreaLabel: string;
  topMonthLabel: string;
  highlights: string[];
  nextYearMission: string;
};

type AiMonthlyReport = {
  title: string;
  summary: string;
  mood: string;
  highlights: string[];
  recommendations: string[];
  savingsTips: string[];
  nextAction: string;
  closingNotes: string[];
  generatedAt: string;
  source: 'gemini' | 'demo' | 'fallback';
};

type AiReportStatus = 'idle' | 'loading' | 'ready' | 'error';

type AiReportGenrePlan = {
  label: string;
  count: number;
  budget: number;
  budgets?: number[];
};

type GenreItem = {
  label: string;
  color: string;
  image: ImageSourcePropType;
};

type FooterItem = {
  key: TabKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};

type UserLocation = {
  latitude: number;
  longitude: number;
  label: string;
};

type StationAccessItem = {
  stationName: string;
  lineLabel?: string;
  walkingMinutes: number;
  distanceKm: number;
  location: UserLocation;
};

type LocationRequestMode = 'sync-search' | 'background';
type LocationIntroState = 'loading' | 'pending' | 'completed';
type MapRouletteStatus = 'idle' | 'locating' | 'locationReady' | 'searching' | 'candidatesReady' | 'spinning' | 'result' | 'empty' | 'error';

type StoredUserLocation = UserLocation & {
  updatedAt: number;
};

type CandidateCacheEntry = {
  key: string;
  center: UserLocation;
  candidates: CandidatePlace[];
  fetchedAt: number;
  usedIds: string[];
  lastSelectedId: string | null;
  source: string;
};

type CandidateQuery = {
  key: string;
  center: UserLocation;
  radius: number;
  category?: string;
  priceRange?: string;
  openNow?: boolean;
};

type AreaPreset = {
  label: string;
  group: string;
  value?: string;
  searchValue?: string;
  latitude: number;
  longitude: number;
  useCoordinates?: boolean;
};

type PrefectureRegion = {
  prefecture: string;
  region: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  image?: ImageSourcePropType;
};

type RegionGroup = {
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  prefectures: string[];
};

type DrawAnimationProfile = {
  key: DrawAnimationKey;
  idleStatus: string;
  activeStatus: string;
  hint: string;
  accent: string;
  loadingMessage: string;
  doneMessage: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const APP_USER_ID = 'guest';
const API_PORT = '8080';
const LOCATION_INTRO_STORAGE_KEY = 'randish.locationIntro.completed.v1';
const LOCATION_CACHE_STORAGE_KEY = 'randish.location.cached.v1';
const PLACES_CACHE_TTL_SECONDS = Number((globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process?.env?.EXPO_PUBLIC_PLACES_CACHE_TTL_SECONDS ?? 600);
const PLACES_CACHE_DISTANCE_METERS = Number((globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process?.env?.EXPO_PUBLIC_PLACES_CACHE_DISTANCE_METERS ?? 300);
const FEATURE_MEAL_TICKETS_ENABLED = true;
const DEV_DISABLE_MEAL_TICKET_LIMIT = true;
const DEV_LAN_API_BASE_URLS = ['http://10.230.36.34:8080'];
const LOCAL_API_BASE_URLS = Platform.select({
  android: ['http://10.0.2.2:8080', 'http://localhost:8080', 'http://127.0.0.1:8080'],
  web: ['http://localhost:8080', 'http://127.0.0.1:8080'],
  default: [],
}) ?? [];
const TETHER_HOST_PATTERN = /^http:\/\/10\.230\.36\.\d+(?::8080)?$/;
const LOCAL_NETWORK_HOST_PATTERN = /^(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/;
const LOCAL_NETWORK_HOST_IN_TEXT_PATTERN = /(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)/g;
const RANDISH_LOGO = require('../assets/randish-logo-square1.png');
const HOME_HEADER_MAP = require('../assets/home-map/homeHeader.png');
const ALBUM_FOOD_ICON = require('../assets/album-food-icon.png');
const ALBUM_FOOTER_ICON = require('../assets/album-footer-traced.png');
const GOOGLE_CONTINUE_BUTTON = require('../assets/google-continue-light-ios-3x.png');
const HOTPEPPER_CREDIT_URL = 'https://webservice.recruit.co.jp/';
const HOTPEPPER_CREDIT_IMAGE_URL = 'https://webservice.recruit.co.jp/banner/hotpepper-m.gif';
const NATIVE_OAUTH_REDIRECT_URI = 'randish://auth/callback';
const OAUTH_CALLBACK_PATH = 'auth/callback';
const AUTH_SESSION_STORAGE_KEY = 'randish.authSession.v1';

const OAUTH_PROVIDER_NAMES: Record<OAuthProvider, string> = {
  google: 'Google',
  apple: 'Apple',
};

type StoredAuthSession = {
  accessToken: string;
  refreshToken?: string | null;
  userId?: string;
  displayName?: string;
  savedAt?: string;
};

const getWebLocalStorage = () => {
  const runtimeGlobal = globalThis as typeof globalThis & {
    localStorage?: {
      getItem: (key: string) => string | null;
      setItem: (key: string, value: string) => void;
      removeItem: (key: string) => void;
    };
  };
  return runtimeGlobal.localStorage ?? null;
};

const parseStoredAuthSession = (value: string | null): StoredAuthSession | null => {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as Partial<StoredAuthSession>;
    return typeof parsed.accessToken === 'string' && parsed.accessToken.trim()
      ? { ...parsed, accessToken: parsed.accessToken.trim() }
      : null;
  } catch {
    return value.trim() ? { accessToken: value.trim() } : null;
  }
};

const readStoredAuthSession = async () => {
  try {
    const stored = Platform.OS === 'web'
      ? getWebLocalStorage()?.getItem(AUTH_SESSION_STORAGE_KEY) ?? null
      : await SecureStore.getItemAsync(AUTH_SESSION_STORAGE_KEY);
    return parseStoredAuthSession(stored);
  } catch {
    return null;
  }
};

const writeStoredAuthSession = async (session: StoredAuthSession) => {
  const cleanToken = session.accessToken.trim();
  if (!cleanToken) {
    return;
  }
  const payload = JSON.stringify({
    ...session,
    accessToken: cleanToken,
    savedAt: new Date().toISOString(),
  });
  try {
    if (Platform.OS === 'web') {
      getWebLocalStorage()?.setItem(AUTH_SESSION_STORAGE_KEY, payload);
      return;
    }
    await SecureStore.setItemAsync(AUTH_SESSION_STORAGE_KEY, payload);
  } catch {
    // If secure storage is unavailable, the user can still use the current session.
  }
};

const clearStoredAuthSession = async () => {
  try {
    if (Platform.OS === 'web') {
      getWebLocalStorage()?.removeItem(AUTH_SESSION_STORAGE_KEY);
      return;
    }
    await SecureStore.deleteItemAsync(AUTH_SESSION_STORAGE_KEY);
  } catch {
    // Storage cleanup should not block entering the guest flow.
  }
};

const isAuthTokenExpiredError = (error: unknown) =>
  error instanceof RandishApiError
  && error.kind === 'http'
  && (error.status === 401 || error.status === 403);

const isOAuthCallbackUrl = (url: string) =>
  url.startsWith(NATIVE_OAUTH_REDIRECT_URI) || url.includes('/auth/callback');

const decodeOAuthValue = (value: string) => {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value;
  }
};

const parseOAuthCallbackParams = (url: string) => {
  const [, hash = ''] = url.split('#');
  const queryPart = url.includes('?') ? url.slice(url.indexOf('?') + 1).split('#')[0] : '';
  const pairs = [...queryPart.split('&'), ...hash.split('&')].filter(Boolean);
  return pairs.reduce<Record<string, string>>((params, pair) => {
    const separatorIndex = pair.indexOf('=');
    const rawKey = separatorIndex >= 0 ? pair.slice(0, separatorIndex) : pair;
    const rawValue = separatorIndex >= 0 ? pair.slice(separatorIndex + 1) : '';
    if (rawKey) {
      params[decodeOAuthValue(rawKey)] = decodeOAuthValue(rawValue);
    }
    return params;
  }, {});
};

const getDefaultDisplayName = (email: string) => {
  const localPart = email.trim().split('@')[0]?.trim();
  return localPart ? localPart.slice(0, 120) : 'RANDISHユーザー';
};

const normalizeApiBaseUrl = (value: string) =>
  value.trim().replace(/\/+$/, '').replace(/\/api\/restaurants$/, '');

const getHostFromUrl = (value?: string) => {
  if (!value) {
    return null;
  }
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
};

const toApiBaseUrlFromHost = (host: string | null) => {
  if (!host || !LOCAL_NETWORK_HOST_PATTERN.test(host)) {
    return null;
  }
  return `http://${host}:${API_PORT}`;
};

const getConfiguredApiBaseUrl = () => {
  const runtimeGlobal = globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } };
  return runtimeGlobal.process?.env?.EXPO_PUBLIC_RANDISH_API_BASE_URL ?? null;
};

const getConfiguredOAuthRedirectUri = () => {
  const runtimeGlobal = globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } };
  return runtimeGlobal.process?.env?.EXPO_PUBLIC_RANDISH_OAUTH_REDIRECT_URI?.trim() || null;
};

const getMetroScriptUrl = () => {
  try {
    const sourceCode = NativeModules?.SourceCode as { scriptURL?: string } | undefined;
    return typeof sourceCode?.scriptURL === 'string' ? sourceCode.scriptURL : undefined;
  } catch {
    return undefined;
  }
};

const getWebLocationUrl = () => {
  const runtimeGlobal = globalThis as typeof globalThis & { location?: { href?: string } };
  return runtimeGlobal.location?.href;
};

const getWebOAuthRedirectUri = () => {
  const locationUrl = getWebLocationUrl();
  if (!locationUrl) {
    return null;
  }
  try {
    return `${new URL(locationUrl).origin}/${OAUTH_CALLBACK_PATH}`;
  } catch {
    return null;
  }
};

const getExpoGoOAuthRedirectUri = () => {
  const metroScriptUrl = getMetroScriptUrl();
  if (!metroScriptUrl) {
    return null;
  }
  try {
    const parsed = new URL(metroScriptUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    const scheme = parsed.protocol === 'https:' ? 'exps' : 'exp';
    return `${scheme}://${parsed.host}/--/${OAUTH_CALLBACK_PATH}`;
  } catch {
    return null;
  }
};

const getOAuthRedirectUri = () =>
  getConfiguredOAuthRedirectUri()
  ?? (Platform.OS === 'web'
    ? getWebOAuthRedirectUri()
    : getExpoGoOAuthRedirectUri())
  ?? NATIVE_OAUTH_REDIRECT_URI;

const getApiBaseUrlsFromRuntimeUrl = (value?: string) => {
  if (!value) {
    return [];
  }
  const urls: string[] = [];
  const directHost = toApiBaseUrlFromHost(getHostFromUrl(value));
  if (directHost) {
    urls.push(directHost);
  }

  try {
    const parsed = new URL(value);
    parsed.searchParams.forEach((paramValue) => {
      const nestedHost = toApiBaseUrlFromHost(getHostFromUrl(paramValue));
      if (nestedHost) {
        urls.push(nestedHost);
      }
    });
  } catch {
    // Some Expo URLs are not parseable by URL; the regex fallback below still catches LAN hosts.
  }

  const hostMatches = value.match(LOCAL_NETWORK_HOST_IN_TEXT_PATTERN) ?? [];
  hostMatches.forEach((host) => {
    const baseUrl = toApiBaseUrlFromHost(host);
    if (baseUrl) {
      urls.push(baseUrl);
    }
  });

  return uniqueApiBaseUrls(urls);
};

const getRuntimeApiBaseUrls = () =>
  uniqueApiBaseUrls([
    getConfiguredApiBaseUrl(),
    ...getApiBaseUrlsFromRuntimeUrl(getMetroScriptUrl()),
    ...getApiBaseUrlsFromRuntimeUrl(getWebLocationUrl()),
  ].filter((value): value is string => Boolean(value)));

const isDevFallbackApiBaseUrl = (baseUrl: string) =>
  DEV_LAN_API_BASE_URLS.includes(baseUrl) || LOCAL_API_BASE_URLS.includes(baseUrl) || TETHER_HOST_PATTERN.test(baseUrl);

const getRuntimeApiBaseUrl = () =>
  getRuntimeApiBaseUrls()[0] ?? DEV_LAN_API_BASE_URLS[0] ?? LOCAL_API_BASE_URLS[0];

const uniqueApiBaseUrls = (baseUrls: string[]) => {
  const seen = new Set<string>();
  return baseUrls
    .map(normalizeApiBaseUrl)
    .filter(Boolean)
    .filter((baseUrl) => {
      if (seen.has(baseUrl)) {
        return false;
      }
      seen.add(baseUrl);
      return true;
    });
};

const buildApiBaseUrlCandidates = (primaryBaseUrl: string, runtimeBaseUrl: string) => {
  const primary = normalizeApiBaseUrl(primaryBaseUrl);
  const primaryIsFallback = isDevFallbackApiBaseUrl(primary);
  return uniqueApiBaseUrls([
    ...(!primaryIsFallback ? [primary] : []),
    runtimeBaseUrl,
    ...getRuntimeApiBaseUrls(),
    ...DEV_LAN_API_BASE_URLS,
    ...(primaryIsFallback ? [primary] : []),
    ...LOCAL_API_BASE_URLS,
  ]);
};

const toAbsoluteApiAssetUrl = (value?: string | null) => {
  if (!value || !value.startsWith('/')) {
    return value ?? null;
  }
  const baseUrl = normalizeApiBaseUrl(randishApi.getLastSuccessfulBaseUrl() ?? getRuntimeApiBaseUrl());
  return `${baseUrl}${value}`;
};

const shouldReplaceWithRuntimeApiBaseUrl = (currentBaseUrl: string, runtimeBaseUrl: string) => {
  const current = normalizeApiBaseUrl(currentBaseUrl);
  const runtime = normalizeApiBaseUrl(runtimeBaseUrl);
  return !current || (current !== runtime && isDevFallbackApiBaseUrl(current));
};

const DRAW_ANIMATION_KEYS: DrawAnimationKey[] = ['roulette', 'lottery', 'shuffle', 'radar'];

const DRAW_ANIMATION_PROFILES: Record<DrawAnimationKey, DrawAnimationProfile> = {
  roulette: {
    key: 'roulette',
    idleStatus: 'RANDISH ROULETTE',
    activeStatus: 'ルーレット回転中',
    hint: '候補を回して',
    accent: '一店に決定',
    loadingMessage: '候補を回しています。',
    doneMessage: '今日の一店が決まりました。',
    icon: 'refresh',
  },
  lottery: {
    key: 'lottery',
    idleStatus: 'RANDISH KUJI',
    activeStatus: 'くじを引いています',
    hint: 'くじを一枚',
    accent: 'そっと引く',
    loadingMessage: 'くじを混ぜて、一枚だけ引いています。',
    doneMessage: 'くじが開きました。',
    icon: 'ticket-outline',
  },
  shuffle: {
    key: 'shuffle',
    idleStatus: 'CARD SHUFFLE',
    activeStatus: '候補を切っています',
    hint: 'カードを切って',
    accent: '直感で選ぶ',
    loadingMessage: '候補カードを切っています。',
    doneMessage: 'カードが一枚めくれました。',
    icon: 'albums-outline',
  },
  radar: {
    key: 'radar',
    idleStatus: 'NEARBY SCAN',
    activeStatus: '近くをスキャン中',
    hint: '近くの気配を',
    accent: '拾い上げる',
    loadingMessage: '近くの候補をスキャンしています。',
    doneMessage: '近くの候補から一店を拾いました。',
    icon: 'radio-outline',
  },
};

const pickNextDrawAnimation = (current: DrawAnimationKey) => {
  const candidates = DRAW_ANIMATION_KEYS.filter((key) => key !== current);
  return candidates[Math.floor(Math.random() * candidates.length)] ?? current;
};

const DISTANCE_OPTIONS = ['500m', '800m', '1km', '1.5km', '2km', '3km', '5km', '10km'];
const BUDGET_MAX_OPTIONS = ['1000', '1500', '2000', '3000', '4000', '5000', '8000'];
const FREE_MEAL_TICKET_COUNT = 3;

function useSubscription(userId: string, apiBaseUrlCandidates: readonly string[]): SubscriptionState {
  const [serverStatus, setServerStatus] = useState<ApiPremiumStatus | null>(null);
  const [nativeIsPro, setNativeIsPro] = useState(false);
  const [status, setStatus] = useState<SubscriptionState['status']>('idle');
  const [source, setSource] = useState<SubscriptionState['source']>('free');

  const refresh = useCallback(async () => {
    if (userId === APP_USER_ID) {
      setServerStatus(null);
      setNativeIsPro(false);
      setStatus('ready');
      setSource('free');
      return;
    }

    setStatus('loading');
    try {
      const nextStatus = await randishApi.getPremiumStatus(apiBaseUrlCandidates, userId);
      setServerStatus(nextStatus);
      setSource(nextStatus.isPro ? 'server' : 'free');

      try {
        const hasNativePremium = await refreshNativePremiumStatus(userId);
        setNativeIsPro(hasNativePremium);
        if (TRUST_NATIVE_REVENUECAT_STATUS && hasNativePremium && !nextStatus.isPro) {
          setSource('native');
        }
      } catch {
        setNativeIsPro(false);
      }

      setStatus('ready');
    } catch (error) {
      setServerStatus(null);
      try {
        const hasNativePremium = await refreshNativePremiumStatus(userId);
        setNativeIsPro(hasNativePremium);
        setStatus(TRUST_NATIVE_REVENUECAT_STATUS && hasNativePremium ? 'ready' : 'error');
        setSource(TRUST_NATIVE_REVENUECAT_STATUS && hasNativePremium ? 'native' : 'error');
      } catch {
        setNativeIsPro(false);
        setStatus('error');
        setSource('error');
      }
      if (!isApiConnectivityError(error)) {
        console.warn('[RANDISH PRO] premium status check failed', error);
      }
    }
  }, [apiBaseUrlCandidates, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const startProPurchase = useCallback(() => {
    if (userId === APP_USER_ID) {
      Alert.alert('会員登録が必要です', 'RANDISH PROはアカウントに紐づくため、先に会員登録またはログインしてください。');
      return;
    }

    const setupMessage = getNativeBillingSetupMessage();
    if (setupMessage) {
      Alert.alert('決済設定待ち', setupMessage);
      return;
    }

    void (async () => {
      try {
        const result = await presentPremiumPaywall(userId);
        setNativeIsPro(result.isPro);
        if (TRUST_NATIVE_REVENUECAT_STATUS && result.isPro) {
          setSource('native');
        }
        await refresh();
        Alert.alert(
          'RANDISH PRO',
          result.isPro && !TRUST_NATIVE_REVENUECAT_STATUS
            ? '購入状態を確認しました。サーバー同期後にRANDISH PROが反映されます。'
            : result.message,
        );
      } catch (error) {
        console.warn('[RANDISH PRO] purchase failed', error);
        Alert.alert('購入を開始できませんでした', 'ストア設定または通信状態を確認して、もう一度試してください。');
      }
    })();
  }, [refresh, userId]);

  const restoreProPurchase = useCallback(() => {
    if (userId === APP_USER_ID) {
      Alert.alert('会員登録が必要です', '購入履歴の復元には、先に会員登録またはログインが必要です。');
      return;
    }

    const setupMessage = getNativeBillingSetupMessage();
    if (setupMessage) {
      Alert.alert('決済設定待ち', setupMessage);
      return;
    }

    void (async () => {
      try {
        const result = await restorePremiumPurchases(userId);
        setNativeIsPro(result.isPro);
        if (TRUST_NATIVE_REVENUECAT_STATUS && result.isPro) {
          setSource('native');
        }
        await refresh();
        Alert.alert(
          'RANDISH PRO',
          result.isPro && !TRUST_NATIVE_REVENUECAT_STATUS
            ? '購入履歴を確認しました。サーバー同期後にRANDISH PROが反映されます。'
            : result.message,
        );
      } catch (error) {
        console.warn('[RANDISH PRO] restore failed', error);
        Alert.alert('復元できませんでした', 'ストア設定または通信状態を確認して、もう一度試してください。');
      }
    })();
  }, [refresh, userId]);

  const isPro = Boolean(serverStatus?.isPro || (TRUST_NATIVE_REVENUECAT_STATUS && nativeIsPro));

  return {
    isPro,
    source: isPro ? source === 'free' || source === 'error' ? 'native' : source : source,
    status,
    activeUntil: serverStatus?.activeUntil ?? null,
    startProPurchase,
    restoreProPurchase,
    refresh,
  };
}

const LANGUAGE_OPTIONS: { key: AppLanguage; label: string; nativeLabel: string }[] = [
  { key: 'ja', label: 'Japanese', nativeLabel: '日本語' },
  { key: 'en', label: 'English', nativeLabel: 'English' },
  { key: 'zh', label: 'Chinese', nativeLabel: '中文' },
  { key: 'ko', label: 'Korean', nativeLabel: '한국어' },
];

const UI_TEXT: Record<AppLanguage, Record<string, string>> = {
  ja: {
    accountSettings: 'アカウント設定',
    profile: 'プロフィール',
    profileValue: '名前と画像を変更',
    profileLocked: '会員登録後に変更できます',
    profileRegisterCta: '会員登録へ進む',
    displayName: '表示名',
    profilePlaceholder: '表示名',
    changeImage: '画像を変更',
    save: '保存',
    language: '言語',
    notifications: '通知',
    notificationsValue: '食券リマインド',
    dailyAccess: '利用枠',
    todayAccessTitle: '今日の利用枠',
    proLateNightGenres: 'Pro深夜ジャンル',
    ticketMorning: '朝',
    ticketLunch: '昼',
    ticketDinner: '夜',
    ticketMidnight: '深夜',
    ticketAvailable: 'いま使える',
    ticketUsed: '使用済み',
    ticketProOnly: 'Pro限定',
    ticketDoneToday: '本日終了',
    ticketUseThis: 'この一枚で引けます',
    ticketTomorrow: 'また明日',
    ticketNextTicketSuffix: 'で次の一枚',
    ticketMorningTicketSuffix: 'で朝の一枚',
    ticketCurrentReadySuffix: 'の一枚が使えます',
    fromPrefix: '',
    fromSuffix: 'から',
    noBudget: '予算なし',
    yenUnit: '円',
    yenMaxSuffix: '以内',
    aboutPrefix: '約',
    meterUnit: 'm',
    kilometerUnit: 'km',
    walkAboutPrefix: '徒歩約',
    minuteUnit: '分',
    creditTerms: 'クレジット・規約',
    creditTermsValue: 'サービス表記',
    areaSetup: 'AREA SETUP',
    homeTitle: 'どの街から探す？',
    homeLead: '現在地、駅名、市町村。今日の一店を決める起点を選びます。',
    travel: '旅をする',
    travelSub: '県・街・距離・ジャンルをおまかせ',
    searchPlaceholder: '梅田・美郷町・駅名で検索',
    close: '閉じる',
    logout: 'ログアウト',
    logoutValue: 'この端末のセッションを終了',
    logoutConfirmTitle: 'ログアウトしますか？',
    logoutConfirmMessage: 'この端末からログアウトして、登録画面に戻ります。',
    logoutConfirmCancel: 'キャンセル',
    logoutConfirmAction: 'ログアウト',
    lockedTitle: '会員限定です',
    profileLockedMessage: 'プロフィール変更は会員登録またはログイン後に使えます。',
    profilePhotoLockedMessage: 'プロフィール画像の変更は会員登録またはログイン後に使えます。',
    registrationPromptTitle: '会員登録しますか？',
    registrationPromptMessage: 'プロフィールを編集するには会員登録またはログインが必要です。',
    registrationPromptCancel: 'あとで',
    registrationPromptAction: 'はい',
    photoPermissionTitle: '写真へのアクセスが必要です',
    photoPermissionMessage: 'プロフィール画像を選ぶには写真ライブラリへのアクセスを許可してください。',
    currentLocation: '現在地',
    currentLocationFallback: '現在地を取得',
    currentLocationSync: 'タップして現在地を同期',
    currentLocationActive: '取得済み',
    currentLocationTap: 'タップで取得',
    currentLocationMap: '現在地マップ',
    currentLocationSearch: '現在地から探す',
    currentLocationNoApi: 'ミニマップで表示',
    travelKicker: 'FOOD TRIP',
    travelCta: '旅を始める',
    travelVehicleRail: '電車・船・バス・飛行機・車',
    chooseFromRegion: '地方から選ぶ',
    prefectureCount: '都道府県',
    cityAreaDefault: '県を選ぶと市町村が出ます',
    cityAreaSuffix: 'の市町村・主要エリア',
    osakaWardsTitle: '大阪市24区',
    osakaWardsLead: '区から探す',
    majorAreasTitle: '人気の周辺エリア',
    municipalitiesTitle: 'その他の市町村',
    areaTabPopular: '人気',
    areaTabStation: '駅',
    areaTabArea: 'エリア',
    popularAreasTitle: '人気の周辺エリア',
    otherAreasTitle: 'その他の候補',
    currentSetting: '現在の設定',
    changeSetting: '変更する',
    seeMoreCities: 'もっとまちを見る ＞',
    hideCities: 'きゅっと戻す',
    exploreAll: '全体で探す',
    exploreAllLead: '市町村を絞らず、県全域を対象にします',
    prefecturePrompt: '先に都道府県を選ぶと、市町村のまち札がここに並びます。',
    hiddenTown: 'その街はまだ隠れています',
    footerHome: 'ホーム',
    footerSearch: '条件',
    footerRandom: '抽選',
    footerSave: 'アルバム',
    footerAnalytics: '分析',
    pageConditionsTitle: '条件を整える',
    pageConditionsLead: '探し込みすぎず、決めるために必要な条件だけを残しました。',
    apiUrl: 'API URL',
    todayConditions: '今日の条件',
    refreshCandidates: '候補更新',
    areaInputPlaceholder: '現在地エリア',
    areaSearchTitle: 'エリアを検索',
    areaSearchPlaceholder: '例: 大阪 / 美郷町 / 北区 / 梅田',
    areaHiddenTitle: 'エリアは？',
    areaHiddenLead: 'ランダムを解除すると選べます',
    searchResults: '検索結果',
    noAreaResult: '該当エリアがありません',
    budget: '予算',
    budgetWithin: '円以内',
    distanceLabel: '距離',
    distanceOriginPrefix: '周辺エリア',
    distanceOriginCurrent: '現在地から',
    distanceOriginRandomArea: 'ランダムの街から',
    distanceOriginWideArea: '県全域では距離で絞りません',
    distanceOriginKeywordArea: '市町村名で探します（距離は強く絞りません）',
    distanceOriginAroundSuffix: 'から',
    genreLabel: 'ジャンル',
    random: 'ランダム',
    showAll: 'すべてを表示',
    showLessGenres: 'ジャンルを少なく表示',
    decisionButton: 'この条件で決める',
    checkingCandidates: '候補を確認中...',
    candidateDrawSuffix: '件から抽選',
    allRandom: '完全ランダム',
    candidateList: '候補一覧',
    resultKicker: "TODAY'S PICK",
    drawAgain: 'もう一回引く',
    goThisShop: 'この店に行く',
    saveRestaurant: 'お気に入りに追加',
    savedRestaurant: 'お気に入り済み',
    nearestStationFrom: '最寄り駅から',
    currentLocationFrom: '現在地から',
    selectedPrefix: '選択',
    mapCheck: '地図で確認',
    loading: '取得中',
    emptyResultTitle: 'まだ一店は決まっていません',
    emptyResultText: '大きなカードのSTARTを押すと抽選が始まります。',
    recentHistory: '最近の履歴',
    noHistory: '履歴なし',
    historyEmpty: '抽選すると、ここに履歴が残ります。',
    savedTitle: '食のアルバム',
    savedLead: 'また行きたい店を、あとで見返せるように残しておけます。',
    favoriteListTitle: 'お気に入り一覧',
    savedEmptyTitle: 'お気に入りはまだありません',
    savedEmptyText: '結果カードのハートから追加できます。',
    analyticsTitle: '分析',
    analyticsLead: '今月の食の傾向を、あとから見返せます。Proなら過去月も残せます。',
    registerTitle: '会員登録',
    registerDesc: 'アカウントを作成して、RANDISHをもっと便利に使いましょう。',
    passwordConfirmLabel: 'パスワード（確認）',
    nicknameLabel: 'ニックネーム',
    required: '必須',
    optional: '任意',
    authSocialLead: 'Google / Appleでログインできます。登録なしならゲストで使えます。',
    guestStart: 'ゲストではじめる',
    guestNote: '登録なしでRANDISHを試せます',
    or: 'または',
    googleRegister: 'Googleで続ける',
    appleRegister: 'Appleで続ける',
    lineRegister: 'LINEで登録',
    googleLogin: 'Googleで続ける',
    appleLogin: 'Appleで続ける',
    lineLogin: 'LINEでログイン',
    appleComingSoon: '準備中',
  },
  en: {
    accountSettings: 'Account Settings',
    profile: 'Profile',
    profileValue: 'Edit name and photo',
    profileLocked: 'Available after registration',
    profileRegisterCta: 'Create account',
    displayName: 'Display Name',
    profilePlaceholder: 'Display name',
    changeImage: 'Change Photo',
    save: 'Save',
    language: 'Language',
    notifications: 'Notifications',
    notificationsValue: 'Meal ticket reminders',
    dailyAccess: 'Daily Access',
    todayAccessTitle: "Today's Access",
    proLateNightGenres: 'Pro Late-Night Genres',
    ticketMorning: 'Morning',
    ticketLunch: 'Lunch',
    ticketDinner: 'Dinner',
    ticketMidnight: 'Late Night',
    ticketAvailable: 'Available now',
    ticketUsed: 'Used',
    ticketProOnly: 'Pro only',
    ticketDoneToday: 'Done today',
    ticketUseThis: 'Use this ticket to draw',
    ticketTomorrow: 'Tomorrow',
    ticketNextTicketSuffix: ' until next ticket',
    ticketMorningTicketSuffix: ' until morning ticket',
    ticketCurrentReadySuffix: ' ticket is available',
    fromPrefix: 'From ',
    fromSuffix: '',
    noBudget: 'No budget',
    yenUnit: 'yen',
    yenMaxSuffix: ' max',
    aboutPrefix: 'about ',
    meterUnit: ' m',
    kilometerUnit: ' km',
    walkAboutPrefix: 'about ',
    minuteUnit: ' min walk',
    creditTerms: 'Credits & Terms',
    creditTermsValue: 'Service info',
    areaSetup: 'AREA SETUP',
    homeTitle: 'Where should we search?',
    homeLead: 'Choose your starting point: current location, station, city, or town.',
    travel: 'Take a Food Trip',
    travelSub: 'Random area, distance, and genre',
    searchPlaceholder: 'Search Umeda, Misato, station...',
    close: 'Close',
    logout: 'Log out',
    logoutValue: 'End this device session',
    logoutConfirmTitle: 'Log out?',
    logoutConfirmMessage: 'You will leave this session and return to the sign-in screen.',
    logoutConfirmCancel: 'Cancel',
    logoutConfirmAction: 'Log out',
    lockedTitle: 'Members Only',
    profileLockedMessage: 'Profile editing is available after registration or login.',
    profilePhotoLockedMessage: 'Profile photo changes are available after registration or login.',
    registrationPromptTitle: 'Create an account?',
    registrationPromptMessage: 'Register or log in to edit your profile.',
    registrationPromptCancel: 'Later',
    registrationPromptAction: 'Yes',
    photoPermissionTitle: 'Photo Access Required',
    photoPermissionMessage: 'Allow photo library access to choose a profile image.',
    currentLocation: 'Current Location',
    currentLocationFallback: 'Get Current Location',
    currentLocationSync: 'Tap to sync your location',
    currentLocationActive: 'Synced',
    currentLocationTap: 'Tap to locate',
    currentLocationMap: 'Location Map',
    currentLocationSearch: 'Search Nearby',
    currentLocationNoApi: 'Shown on mini map',
    travelKicker: 'FOOD TRIP',
    travelCta: 'Start Trip',
    travelVehicleRail: 'Train, boat, bus, plane, car',
    chooseFromRegion: 'Choose by Region',
    prefectureCount: 'prefectures',
    cityAreaDefault: 'Choose a prefecture to see cities',
    cityAreaSuffix: ' cities and areas',
    osakaWardsTitle: 'Osaka City 24 Wards',
    osakaWardsLead: 'Search by ward',
    majorAreasTitle: 'Popular Nearby Areas',
    municipalitiesTitle: 'Other Cities and Towns',
    areaTabPopular: 'Popular',
    areaTabStation: 'Stations',
    areaTabArea: 'Areas',
    popularAreasTitle: 'Popular Nearby Areas',
    otherAreasTitle: 'Other Options',
    currentSetting: 'Current Setting',
    changeSetting: 'Change',
    seeMoreCities: 'See more towns >',
    hideCities: 'Show fewer',
    exploreAll: 'Explore All',
    exploreAllLead: 'Search the whole prefecture without choosing a city.',
    prefecturePrompt: 'Choose a prefecture first and city cards will appear here.',
    hiddenTown: 'That town is still hidden',
    footerHome: 'Home',
    footerSearch: 'Filters',
    footerRandom: 'Draw',
    footerSave: 'Album',
    footerAnalytics: 'Stats',
    pageConditionsTitle: 'Set Filters',
    pageConditionsLead: 'Keep only the filters that help you decide.',
    apiUrl: 'API URL',
    todayConditions: "Today's Filters",
    refreshCandidates: 'Refresh',
    areaInputPlaceholder: 'Current area',
    areaSearchTitle: 'Search Area',
    areaSearchPlaceholder: 'Osaka / Misato / Kita / Umeda',
    areaHiddenTitle: 'Area is ?',
    areaHiddenLead: 'Turn off random to choose an area',
    searchResults: 'Search Results',
    noAreaResult: 'No matching area',
    budget: 'Budget',
    budgetWithin: 'yen max',
    distanceLabel: 'Distance',
    distanceOriginPrefix: 'Nearby area',
    distanceOriginCurrent: 'within ',
    distanceOriginRandomArea: 'random town within ',
    distanceOriginWideArea: 'Whole-prefecture search does not narrow by distance',
    distanceOriginKeywordArea: 'Searching by city/town name without strong distance narrowing',
    distanceOriginAroundSuffix: ' within ',
    genreLabel: 'Genre',
    random: 'Random',
    showAll: 'Show all',
    showLessGenres: 'Show fewer genres',
    decisionButton: 'Decide With These',
    checkingCandidates: 'Checking spots...',
    candidateDrawSuffix: ' spots to draw',
    allRandom: 'Full Random',
    candidateList: 'Candidates',
    resultKicker: "TODAY'S PICK",
    drawAgain: 'Draw Again',
    goThisShop: 'Go Here',
    saveRestaurant: 'Add to Favorites',
    savedRestaurant: 'Favorited',
    nearestStationFrom: 'From nearest station',
    currentLocationFrom: 'From current location',
    selectedPrefix: 'Selected',
    mapCheck: 'Check map',
    loading: 'Loading',
    emptyResultTitle: 'No place chosen yet',
    emptyResultText: 'Press START on the big card to begin.',
    recentHistory: 'Recent History',
    noHistory: 'No history',
    historyEmpty: 'Your draw history will appear here.',
    savedTitle: 'Food Album',
    savedLead: 'Keep places you may want to visit again.',
    favoriteListTitle: 'Favorites',
    savedEmptyTitle: 'No favorites yet',
    savedEmptyText: 'Tap the heart on a result card to add one.',
    analyticsTitle: 'Stats',
    analyticsLead: 'View this month for free. Pro keeps past months and deeper trends.',
    registerTitle: 'Create Account',
    registerDesc: 'Create an account to make RANDISH more useful.',
    passwordConfirmLabel: 'Confirm Password',
    nicknameLabel: 'Nickname',
    required: 'Required',
    optional: 'Optional',
    authSocialLead: 'Continue with Google or Apple, or use RANDISH as a guest.',
    guestStart: 'Continue as Guest',
    guestNote: 'Try RANDISH without registering',
    or: 'or',
    googleRegister: 'Continue with Google',
    appleRegister: 'Continue with Apple',
    lineRegister: 'Sign up with LINE',
    googleLogin: 'Continue with Google',
    appleLogin: 'Continue with Apple',
    lineLogin: 'Log in with LINE',
    appleComingSoon: 'Soon',
  },
  zh: {
    accountSettings: '账户设置',
    profile: '个人资料',
    profileValue: '更改名称和头像',
    profileLocked: '注册后可使用',
    profileRegisterCta: '前往注册',
    displayName: '显示名称',
    profilePlaceholder: '显示名称',
    changeImage: '更改头像',
    save: '保存',
    language: '语言',
    notifications: '通知',
    notificationsValue: '餐券提醒',
    dailyAccess: '使用次数',
    todayAccessTitle: '今天的使用次数',
    proLateNightGenres: 'Pro深夜类型',
    ticketMorning: '早晨',
    ticketLunch: '午餐',
    ticketDinner: '晚餐',
    ticketMidnight: '深夜',
    ticketAvailable: '现在可用',
    ticketUsed: '已使用',
    ticketProOnly: 'Pro限定',
    ticketDoneToday: '今日结束',
    ticketUseThis: '可用这一张抽选',
    ticketTomorrow: '明天再来',
    ticketNextTicketSuffix: '后可用下一张',
    ticketMorningTicketSuffix: '后可用早晨券',
    ticketCurrentReadySuffix: '餐券可使用',
    fromPrefix: '从',
    fromSuffix: '起',
    noBudget: '无预算限制',
    yenUnit: '日元',
    yenMaxSuffix: '以内',
    aboutPrefix: '约',
    meterUnit: 'm',
    kilometerUnit: 'km',
    walkAboutPrefix: '步行约',
    minuteUnit: '分钟',
    creditTerms: '版权与条款',
    creditTermsValue: '服务说明',
    areaSetup: '区域设置',
    homeTitle: '从哪座城市开始找？',
    homeLead: '选择当前位置、车站、市区町村，作为今天选店的起点。',
    travel: '为了吃去旅行',
    travelSub: '随机选择地区、距离和类型',
    searchPlaceholder: '搜索梅田、美乡町、车站...',
    close: '关闭',
    logout: '退出登录',
    logoutValue: '结束此设备上的会话',
    logoutConfirmTitle: '要退出登录吗？',
    logoutConfirmMessage: '将退出此设备上的会话并返回登录页面。',
    logoutConfirmCancel: '取消',
    logoutConfirmAction: '退出登录',
    lockedTitle: '会员限定',
    profileLockedMessage: '注册或登录后可以编辑个人资料。',
    profilePhotoLockedMessage: '注册或登录后可以更改头像。',
    registrationPromptTitle: '要注册账号吗？',
    registrationPromptMessage: '编辑个人资料需要注册或登录。',
    registrationPromptCancel: '稍后',
    registrationPromptAction: '是',
    photoPermissionTitle: '需要照片权限',
    photoPermissionMessage: '请选择允许访问照片图库后再选择头像。',
    currentLocation: '当前位置',
    currentLocationFallback: '获取当前位置',
    currentLocationSync: '点击同步当前位置',
    currentLocationActive: '已获取',
    currentLocationTap: '点击定位',
    currentLocationMap: '当前位置地图',
    currentLocationSearch: '从当前位置搜索',
    currentLocationNoApi: '以迷你地图显示',
    travelKicker: 'FOOD TRIP',
    travelCta: '开始旅行',
    travelVehicleRail: '电车、船、巴士、飞机、汽车',
    chooseFromRegion: '按地区选择',
    prefectureCount: '都道府县',
    cityAreaDefault: '选择都道府县后显示市町村',
    cityAreaSuffix: '的市町村・主要区域',
    osakaWardsTitle: '大阪市24区',
    osakaWardsLead: '按区搜索',
    majorAreasTitle: '热门周边区域',
    municipalitiesTitle: '其他市町村',
    areaTabPopular: '热门',
    areaTabStation: '车站',
    areaTabArea: '区域',
    popularAreasTitle: '热门周边区域',
    otherAreasTitle: '其他候选',
    currentSetting: '当前设置',
    changeSetting: '更改',
    seeMoreCities: '查看更多城镇 >',
    hideCities: '收起',
    exploreAll: '全域探索',
    exploreAllLead: '不限定市町村，搜索整个都道府县。',
    prefecturePrompt: '请先选择都道府县，市町村卡片会显示在这里。',
    hiddenTown: '这个城镇还没有出现',
    footerHome: '首页',
    footerSearch: '条件',
    footerRandom: '抽选',
    footerSave: '相册',
    footerAnalytics: '分析',
    pageConditionsTitle: '调整条件',
    pageConditionsLead: '只保留帮助你决定的必要条件。',
    apiUrl: 'API URL',
    todayConditions: '今天的条件',
    refreshCandidates: '更新候选',
    areaInputPlaceholder: '当前位置区域',
    areaSearchTitle: '搜索区域',
    areaSearchPlaceholder: '大阪 / 美乡町 / 北区 / 梅田',
    areaHiddenTitle: '区域是？',
    areaHiddenLead: '关闭随机后可以选择区域',
    searchResults: '搜索结果',
    noAreaResult: '没有符合的区域',
    budget: '预算',
    budgetWithin: '日元以内',
    distanceLabel: '距离',
    distanceOriginPrefix: '周边区域',
    distanceOriginCurrent: '从当前位置',
    distanceOriginRandomArea: '从随机城镇',
    distanceOriginWideArea: '搜索整个都道府县时不按距离缩小',
    distanceOriginKeywordArea: '按市町村名搜索，不强制按距离缩小',
    distanceOriginAroundSuffix: '从',
    genreLabel: '类型',
    random: '随机',
    showAll: '显示全部',
    showLessGenres: '减少显示类型',
    decisionButton: '按此条件决定',
    checkingCandidates: '正在确认候选...',
    candidateDrawSuffix: '家中抽选',
    allRandom: '完全随机',
    candidateList: '候选列表',
    resultKicker: "TODAY'S PICK",
    drawAgain: '再抽一次',
    goThisShop: '去这家店',
    saveRestaurant: '加入收藏',
    savedRestaurant: '已收藏',
    nearestStationFrom: '从最近车站',
    currentLocationFrom: '从当前位置',
    selectedPrefix: '已选择',
    mapCheck: '查看地图',
    loading: '获取中',
    emptyResultTitle: '还没有决定店铺',
    emptyResultText: '点击大卡片的START开始抽选。',
    recentHistory: '最近记录',
    noHistory: '没有历史',
    historyEmpty: '抽选后历史会显示在这里。',
    savedTitle: '美食相册',
    savedLead: '想再去的店铺可以保存在这里。',
    favoriteListTitle: '收藏列表',
    savedEmptyTitle: '还没有收藏',
    savedEmptyText: '点击结果卡片上的爱心即可添加。',
    analyticsTitle: '分析',
    analyticsLead: '将饮食倾向可视化的高级功能。',
    registerTitle: '会员注册',
    registerDesc: '创建账号，让RANDISH更好用。',
    passwordConfirmLabel: '确认密码',
    nicknameLabel: '昵称',
    required: '必填',
    optional: '可选',
    authSocialLead: '使用 Google 或 Apple 登录，或以游客身份使用 RANDISH。',
    guestStart: '以游客开始',
    guestNote: '无需注册即可试用RANDISH',
    or: '或者',
    googleRegister: '使用 Google 继续',
    appleRegister: '使用 Apple 继续',
    lineRegister: '使用 LINE 注册',
    googleLogin: '使用 Google 继续',
    appleLogin: '使用 Apple 继续',
    lineLogin: '使用 LINE 登录',
    appleComingSoon: '准备中',
  },
  ko: {
    accountSettings: '계정 설정',
    profile: '프로필',
    profileValue: '이름과 사진 변경',
    profileLocked: '회원가입 후 이용 가능',
    profileRegisterCta: '회원가입으로 이동',
    displayName: '표시 이름',
    profilePlaceholder: '표시 이름',
    changeImage: '사진 변경',
    save: '저장',
    language: '언어',
    notifications: '알림',
    notificationsValue: '식권 리마인드',
    dailyAccess: '이용 횟수',
    todayAccessTitle: '오늘의 이용권',
    proLateNightGenres: 'Pro 심야 장르',
    ticketMorning: '아침',
    ticketLunch: '점심',
    ticketDinner: '저녁',
    ticketMidnight: '심야',
    ticketAvailable: '지금 사용 가능',
    ticketUsed: '사용 완료',
    ticketProOnly: 'Pro 전용',
    ticketDoneToday: '오늘 종료',
    ticketUseThis: '이 한 장으로 뽑을 수 있어요',
    ticketTomorrow: '내일 다시',
    ticketNextTicketSuffix: ' 후 다음 이용권',
    ticketMorningTicketSuffix: ' 후 아침 이용권',
    ticketCurrentReadySuffix: ' 이용권을 사용할 수 있어요',
    fromPrefix: '',
    fromSuffix: '에서',
    noBudget: '예산 없음',
    yenUnit: '엔',
    yenMaxSuffix: ' 이내',
    aboutPrefix: '약 ',
    meterUnit: 'm',
    kilometerUnit: 'km',
    walkAboutPrefix: '도보 약 ',
    minuteUnit: '분',
    creditTerms: '크레딧 및 약관',
    creditTermsValue: '서비스 표기',
    areaSetup: '지역 설정',
    homeTitle: '어느 동네에서 찾을까?',
    homeLead: '현재 위치, 역 이름, 시구정촌을 오늘 한 끼의 출발점으로 선택합니다.',
    travel: '먹으러 여행하기',
    travelSub: '지역, 거리, 장르를 랜덤 선택',
    searchPlaceholder: '우메다, 미사토, 역 이름 검색...',
    close: '닫기',
    logout: '로그아웃',
    logoutValue: '이 기기의 세션 종료',
    logoutConfirmTitle: '로그아웃할까요?',
    logoutConfirmMessage: '이 기기에서 로그아웃하고 로그인 화면으로 돌아갑니다.',
    logoutConfirmCancel: '취소',
    logoutConfirmAction: '로그아웃',
    lockedTitle: '회원 전용',
    profileLockedMessage: '프로필 변경은 회원가입 또는 로그인 후 사용할 수 있습니다.',
    profilePhotoLockedMessage: '프로필 사진 변경은 회원가입 또는 로그인 후 사용할 수 있습니다.',
    registrationPromptTitle: '회원가입할까요?',
    registrationPromptMessage: '프로필을 수정하려면 회원가입 또는 로그인이 필요합니다.',
    registrationPromptCancel: '나중에',
    registrationPromptAction: '예',
    photoPermissionTitle: '사진 접근 권한이 필요합니다',
    photoPermissionMessage: '프로필 이미지를 선택하려면 사진 라이브러리 접근을 허용해주세요.',
    currentLocation: '현재 위치',
    currentLocationFallback: '현재 위치 가져오기',
    currentLocationSync: '탭해서 현재 위치 동기화',
    currentLocationActive: '동기화됨',
    currentLocationTap: '탭해서 위치 확인',
    currentLocationMap: '현재 위치 지도',
    currentLocationSearch: '현재 위치로 찾기',
    currentLocationNoApi: '미니 지도에 표시',
    travelKicker: 'FOOD TRIP',
    travelCta: '여행 시작',
    travelVehicleRail: '전철, 배, 버스, 비행기, 자동차',
    chooseFromRegion: '지역으로 선택',
    prefectureCount: '도도부현',
    cityAreaDefault: '도도부현을 선택하면 시구정촌이 나옵니다',
    cityAreaSuffix: '의 시구정촌・주요 지역',
    osakaWardsTitle: '오사카시 24구',
    osakaWardsLead: '구에서 찾기',
    majorAreasTitle: '인기 주변 지역',
    municipalitiesTitle: '그 외 시구정촌',
    areaTabPopular: '인기',
    areaTabStation: '역',
    areaTabArea: '지역',
    popularAreasTitle: '인기 주변 지역',
    otherAreasTitle: '기타 후보',
    currentSetting: '현재 설정',
    changeSetting: '변경',
    seeMoreCities: '동네 더 보기 >',
    hideCities: '줄여 보기',
    exploreAll: '전체 탐색',
    exploreAllLead: '시구정촌을 좁히지 않고 현 전체를 대상으로 합니다.',
    prefecturePrompt: '먼저 도도부현을 선택하면 시구정촌 카드가 여기에 표시됩니다.',
    hiddenTown: '그 동네는 아직 숨어 있어요',
    footerHome: '홈',
    footerSearch: '조건',
    footerRandom: '추첨',
    footerSave: '앨범',
    footerAnalytics: '분석',
    pageConditionsTitle: '조건 정리',
    pageConditionsLead: '결정에 필요한 조건만 남겼습니다.',
    apiUrl: 'API URL',
    todayConditions: '오늘의 조건',
    refreshCandidates: '후보 갱신',
    areaInputPlaceholder: '현재 위치 지역',
    areaSearchTitle: '지역 검색',
    areaSearchPlaceholder: '오사카 / 미사토 / 기타구 / 우메다',
    areaHiddenTitle: '지역은 ?',
    areaHiddenLead: '랜덤을 끄면 지역을 선택할 수 있어요',
    searchResults: '검색 결과',
    noAreaResult: '해당 지역이 없습니다',
    budget: '예산',
    budgetWithin: '엔 이내',
    distanceLabel: '거리',
    distanceOriginPrefix: '주변 지역',
    distanceOriginCurrent: '현재 위치에서',
    distanceOriginRandomArea: '랜덤 동네에서',
    distanceOriginWideArea: '도도부현 전체 검색은 거리로 좁히지 않습니다',
    distanceOriginKeywordArea: '시구정촌명으로 찾고 거리는 강하게 좁히지 않습니다',
    distanceOriginAroundSuffix: '에서',
    genreLabel: '장르',
    random: '랜덤',
    showAll: '전체 보기',
    showLessGenres: '장르 줄여 보기',
    decisionButton: '이 조건으로 결정',
    checkingCandidates: '후보 확인 중...',
    candidateDrawSuffix: '곳에서 추첨',
    allRandom: '완전 랜덤',
    candidateList: '후보 목록',
    resultKicker: "TODAY'S PICK",
    drawAgain: '다시 뽑기',
    goThisShop: '이 가게로 가기',
    saveRestaurant: '즐겨찾기에 추가',
    savedRestaurant: '즐겨찾기 완료',
    nearestStationFrom: '가장 가까운 역에서',
    currentLocationFrom: '현재 위치에서',
    selectedPrefix: '선택',
    mapCheck: '지도에서 확인',
    loading: '불러오는 중',
    emptyResultTitle: '아직 가게가 정해지지 않았습니다',
    emptyResultText: '큰 카드의 START를 누르면 추첨이 시작됩니다.',
    recentHistory: '최근 기록',
    noHistory: '기록 없음',
    historyEmpty: '추첨하면 여기에 기록이 남습니다.',
    savedTitle: '음식 앨범',
    savedLead: '다시 가고 싶은 가게를 여기에 남겨둘 수 있습니다.',
    favoriteListTitle: '즐겨찾기 목록',
    savedEmptyTitle: '아직 즐겨찾기가 없습니다',
    savedEmptyText: '결과 카드의 하트를 눌러 추가할 수 있습니다.',
    analyticsTitle: '분석',
    analyticsLead: '식사 취향을 시각화하는 프리미엄 기능입니다.',
    registerTitle: '회원가입',
    registerDesc: '계정을 만들고 RANDISH를 더 편리하게 사용하세요.',
    passwordConfirmLabel: '비밀번호 확인',
    nicknameLabel: '닉네임',
    required: '필수',
    optional: '선택',
    authSocialLead: 'Google 또는 Apple로 로그인하거나, 게스트로 사용할 수 있습니다.',
    guestStart: '게스트로 시작',
    guestNote: '가입 없이 RANDISH를 체험할 수 있습니다',
    or: '또는',
    googleRegister: 'Google로 계속',
    appleRegister: 'Apple로 계속',
    lineRegister: 'LINE으로 가입',
    googleLogin: 'Google로 계속',
    appleLogin: 'Apple로 계속',
    lineLogin: 'LINE으로 로그인',
    appleComingSoon: '준비 중',
  },
};

const getUiLanguage = (uiText: Record<string, string>): AppLanguage => {
  if (uiText === UI_TEXT.en) {
    return 'en';
  }
  if (uiText === UI_TEXT.zh) {
    return 'zh';
  }
  if (uiText === UI_TEXT.ko) {
    return 'ko';
  }
  return 'ja';
};

const formatLocalizedYen = (value: number, uiText: Record<string, string>) => {
  const amount = Math.round(value).toLocaleString();
  const language = getUiLanguage(uiText);
  if (language === 'en') {
    return `¥${amount}`;
  }
  return `${amount}${uiText.yenUnit}`;
};

const formatLocalizedBudgetLimit = (budgetMax: string, uiText: Record<string, string>) => {
  const value = Number(budgetMax || 0);
  return value > 0 ? `${formatLocalizedYen(value, uiText)}${uiText.yenMaxSuffix}` : uiText.noBudget;
};

const formatUnknownPriceLabel = (uiText: Record<string, string>) => {
  const language = getUiLanguage(uiText);
  if (language === 'en') {
    return 'Price not listed';
  }
  if (language === 'zh') {
    return '价格未提供';
  }
  if (language === 'ko') {
    return '가격 정보 없음';
  }
  return '予算目安なし';
};

const formatLocalizedPrice = (restaurant: ApiRestaurant, uiText: Record<string, string>) => {
  const min = toOptionalNumber(restaurant.budgetMin);
  const max = toOptionalNumber(restaurant.budgetMax);
  const hasOpenEndedMax = max != null && max >= 100000;
  const hasFreeLikeMin = min == null || min <= 0;
  if ((min == null && max == null) || (hasFreeLikeMin && hasOpenEndedMax) || (min === 0 && max === 0)) {
    return formatUnknownPriceLabel(uiText);
  }
  if (hasOpenEndedMax && min != null && min > 0) {
    return `${formatLocalizedYen(min, uiText)}〜`;
  }
  if ((min == null || min <= 0) && max != null && max > 0) {
    return `${formatLocalizedYen(max, uiText)}${uiText.yenMaxSuffix}`;
  }
  if (min == null || max == null || min === max) {
    return formatLocalizedYen(min ?? max ?? 0, uiText);
  }
  return `${formatLocalizedYen(min, uiText)} - ${formatLocalizedYen(max, uiText)}`;
};

const formatLocalizedCountdownDate = (targetIso: string | undefined, uiText: Record<string, string>) => {
  const target = targetIso ? new Date(targetIso) : new Date();
  const diff = Math.max(0, target.getTime() - Date.now());
  const totalMinutes = Math.max(1, Math.ceil(diff / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const language = getUiLanguage(uiText);

  if (language === 'en') {
    if (hours <= 0) {
      return `in ${minutes}m`;
    }
    return minutes === 0 ? `in ${hours}h` : `in ${hours}h ${minutes}m`;
  }
  if (language === 'zh') {
    if (hours <= 0) {
      return `还有${minutes}分钟`;
    }
    return minutes === 0 ? `还有${hours}小时` : `还有${hours}小时${minutes}分钟`;
  }
  if (language === 'ko') {
    if (hours <= 0) {
      return `${minutes}분 후`;
    }
    return minutes === 0 ? `${hours}시간 후` : `${hours}시간 ${minutes}분 후`;
  }
  if (hours <= 0) {
    return `あと${minutes}分`;
  }
  return minutes === 0 ? `あと${hours}時間` : `あと${hours}時間${minutes}分`;
};

const formatMealTicketName = (key: MealSlotKey, uiText: Record<string, string>) => {
  const names: Record<MealSlotKey, string> = {
    morning: uiText.ticketMorning,
    lunch: uiText.ticketLunch,
    dinner: uiText.ticketDinner,
    midnight: uiText.ticketMidnight,
  };
  return names[key];
};

const formatTicketStartsAt = (timeLabel: string, uiText: Record<string, string>) =>
  `${uiText.fromPrefix}${timeLabel.split('-')[0]}${uiText.fromSuffix}`;

const getMealTicketDisplay = (ticket: MealTicketView, state: MealTicketState, uiText: Record<string, string>) => {
  const proLocked = Boolean(ticket.proOnly && !state.isProUser);
  const statusLabel = ticket.available
    ? uiText.ticketAvailable
    : ticket.used
      ? uiText.ticketUsed
      : proLocked
        ? uiText.ticketProOnly
        : ticket.past
          ? uiText.ticketDoneToday
          : formatTicketStartsAt(ticket.timeLabel, uiText);
  const countdownLabel = ticket.available
    ? uiText.ticketUseThis
    : ticket.used && ticket.active
      ? `${formatLocalizedCountdownDate(state.nextUnlockAt, uiText)}${uiText.ticketNextTicketSuffix}`
      : proLocked && ticket.active
        ? `${formatLocalizedCountdownDate(state.nextUnlockAt, uiText)}${uiText.ticketMorningTicketSuffix}`
        : ticket.past
          ? uiText.ticketTomorrow
          : formatLocalizedCountdownDate(ticket.upcomingStartAt, uiText);
  return {
    label: formatMealTicketName(ticket.key, uiText),
    statusLabel,
    countdownLabel,
  };
};

const MEAL_TICKET_DEFINITIONS: MealTicketDefinition[] = [
  {
    key: 'morning',
    label: '朝',
    timeLabel: '5:00-10:59',
    startMinute: 5 * 60,
    endMinute: 11 * 60,
    icon: 'fast-food-outline',
    accent: '#f2a51a',
    genreHints: ['カフェ', 'パン', '定食'],
  },
  {
    key: 'lunch',
    label: '昼',
    timeLabel: '11:00-15:59',
    startMinute: 11 * 60,
    endMinute: 16 * 60,
    icon: 'pizza-outline',
    accent: ORANGE,
    genreHints: ['イタリアン', '定食', 'カレー'],
  },
  {
    key: 'dinner',
    label: '夜',
    timeLabel: '16:00-23:59',
    startMinute: 16 * 60,
    endMinute: 24 * 60,
    icon: 'restaurant-outline',
    accent: '#4f7f58',
    genreHints: ['焼肉', '居酒屋', '和食'],
  },
  {
    key: 'midnight',
    label: '深夜',
    timeLabel: '0:00-4:59',
    startMinute: 0,
    endMinute: 5 * 60,
    icon: 'wine-outline',
    accent: MIDNIGHT_PURPLE,
    genreHints: ['バー', '締めラーメン', '深夜カフェ'],
    proOnly: true,
  },
];

const PREFECTURE_IMAGES: Record<string, ImageSourcePropType> = {
  北海道: require('../assets/prefecture-clean/hokkaido.png'),
  青森県: require('../assets/prefecture-clean/aomori.png'),
  岩手県: require('../assets/prefecture-clean/iwate.png'),
  宮城県: require('../assets/prefecture-clean/miyagi.png'),
  秋田県: require('../assets/prefecture-clean/akita.png'),
  山形県: require('../assets/prefecture-clean/yamagata.png'),
  福島県: require('../assets/prefecture-clean/fukushima.png'),
  茨城県: require('../assets/prefecture-clean/ibaraki.png'),
  栃木県: require('../assets/prefecture-clean/tochigi.png'),
  群馬県: require('../assets/prefecture-clean/gunma.png'),
  埼玉県: require('../assets/prefecture-clean/saitama.png'),
  千葉県: require('../assets/prefecture-clean/chiba.png'),
  東京都: require('../assets/prefecture-clean/tokyo.png'),
  神奈川県: require('../assets/prefecture-clean/kanagawa.png'),
  新潟県: require('../assets/prefecture-clean/niigata.png'),
  富山県: require('../assets/prefecture-clean/toyama.png'),
  石川県: require('../assets/prefecture-clean/ishikawa.png'),
  福井県: require('../assets/prefecture-clean/fukui.png'),
  山梨県: require('../assets/prefecture-clean/yamanashi.png'),
  長野県: require('../assets/prefecture-clean/nagano.png'),
  岐阜県: require('../assets/prefecture-clean/gifu.png'),
  静岡県: require('../assets/prefecture-clean/shizuoka.png'),
  愛知県: require('../assets/prefecture-clean/aichi.png'),
  三重県: require('../assets/prefecture-clean/mie.png'),
  滋賀県: require('../assets/prefecture-clean/shiga.png'),
  京都府: require('../assets/prefecture-clean/kyoto.png'),
  大阪府: require('../assets/prefecture-clean/osaka.png'),
  兵庫県: require('../assets/prefecture-clean/hyogo.png'),
  奈良県: require('../assets/prefecture-clean/nara.png'),
  和歌山県: require('../assets/prefecture-clean/wakayama.png'),
  鳥取県: require('../assets/prefecture-clean/tottori.png'),
  島根県: require('../assets/prefecture-clean/shimane.png'),
  岡山県: require('../assets/prefecture-clean/okayama.png'),
  広島県: require('../assets/prefecture-clean/hiroshima.png'),
  山口県: require('../assets/prefecture-clean/yamaguchi.png'),
  徳島県: require('../assets/prefecture-clean/tokushima.png'),
  香川県: require('../assets/prefecture-clean/kagawa.png'),
  愛媛県: require('../assets/prefecture-clean/ehime.png'),
  高知県: require('../assets/prefecture-clean/kochi.png'),
  福岡県: require('../assets/prefecture-clean/fukuoka.png'),
  佐賀県: require('../assets/prefecture-clean/saga.png'),
  長崎県: require('../assets/prefecture-clean/nagasaki.png'),
  熊本県: require('../assets/prefecture-clean/kumamoto.png'),
  大分県: require('../assets/prefecture-clean/oita.png'),
  宮崎県: require('../assets/prefecture-clean/miyazaki.png'),
  鹿児島県: require('../assets/prefecture-clean/kagoshima.png'),
  沖縄県: require('../assets/prefecture-clean/okinawa.png'),
};

const PREFECTURE_REGIONS: PrefectureRegion[] = [
  { prefecture: '北海道', region: '北海道地方', icon: 'snowflake' },
  { prefecture: '青森県', region: '東北地方', icon: 'pine-tree' },
  { prefecture: '岩手県', region: '東北地方', icon: 'pine-tree' },
  { prefecture: '宮城県', region: '東北地方', icon: 'pine-tree' },
  { prefecture: '秋田県', region: '東北地方', icon: 'pine-tree' },
  { prefecture: '山形県', region: '東北地方', icon: 'pine-tree' },
  { prefecture: '福島県', region: '東北地方', icon: 'pine-tree' },
  { prefecture: '茨城県', region: '関東地方', icon: 'city' },
  { prefecture: '栃木県', region: '関東地方', icon: 'city' },
  { prefecture: '群馬県', region: '関東地方', icon: 'city' },
  { prefecture: '埼玉県', region: '関東地方', icon: 'city' },
  { prefecture: '千葉県', region: '関東地方', icon: 'city' },
  { prefecture: '東京都', region: '関東地方', icon: 'city' },
  { prefecture: '神奈川県', region: '関東地方', icon: 'city' },
  { prefecture: '新潟県', region: '中部地方', icon: 'terrain' },
  { prefecture: '富山県', region: '中部地方', icon: 'terrain' },
  { prefecture: '石川県', region: '中部地方', icon: 'terrain' },
  { prefecture: '福井県', region: '中部地方', icon: 'terrain' },
  { prefecture: '山梨県', region: '中部地方', icon: 'terrain' },
  { prefecture: '長野県', region: '中部地方', icon: 'terrain' },
  { prefecture: '岐阜県', region: '中部地方', icon: 'terrain' },
  { prefecture: '静岡県', region: '中部地方', icon: 'terrain' },
  { prefecture: '愛知県', region: '中部地方', icon: 'terrain' },
  { prefecture: '三重県', region: '近畿地方', icon: 'castle' },
  { prefecture: '滋賀県', region: '近畿地方', icon: 'castle' },
  { prefecture: '京都府', region: '近畿地方', icon: 'gate' },
  { prefecture: '大阪府', region: '近畿地方', icon: 'castle' },
  { prefecture: '兵庫県', region: '近畿地方', icon: 'tower-beach' },
  { prefecture: '奈良県', region: '近畿地方', icon: 'horse-variant' },
  { prefecture: '和歌山県', region: '近畿地方', icon: 'waves' },
  { prefecture: '鳥取県', region: '中国地方', icon: 'terrain' },
  { prefecture: '島根県', region: '中国地方', icon: 'terrain' },
  { prefecture: '岡山県', region: '中国地方', icon: 'terrain' },
  { prefecture: '広島県', region: '中国地方', icon: 'terrain' },
  { prefecture: '山口県', region: '中国地方', icon: 'terrain' },
  { prefecture: '徳島県', region: '四国地方', icon: 'island' },
  { prefecture: '香川県', region: '四国地方', icon: 'island' },
  { prefecture: '愛媛県', region: '四国地方', icon: 'island' },
  { prefecture: '高知県', region: '四国地方', icon: 'island' },
  { prefecture: '福岡県', region: '九州・沖縄地方', icon: 'waves' },
  { prefecture: '佐賀県', region: '九州・沖縄地方', icon: 'waves' },
  { prefecture: '長崎県', region: '九州・沖縄地方', icon: 'waves' },
  { prefecture: '熊本県', region: '九州・沖縄地方', icon: 'waves' },
  { prefecture: '大分県', region: '九州・沖縄地方', icon: 'waves' },
  { prefecture: '宮崎県', region: '九州・沖縄地方', icon: 'waves' },
  { prefecture: '鹿児島県', region: '九州・沖縄地方', icon: 'waves' },
  { prefecture: '沖縄県', region: '九州・沖縄地方', icon: 'island' },
];

const AREA_REGION_GROUPS: RegionGroup[] = [
  {
    label: '北海道・東北地方',
    icon: 'snowflake',
    prefectures: ['北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県'],
  },
  {
    label: '関東地方',
    icon: 'city',
    prefectures: ['茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県'],
  },
  {
    label: '中部地方',
    icon: 'terrain',
    prefectures: ['新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県', '静岡県', '愛知県'],
  },
  {
    label: '近畿地方',
    icon: 'castle',
    prefectures: ['三重県', '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県'],
  },
  {
    label: '中国地方',
    icon: 'gate',
    prefectures: ['鳥取県', '島根県', '岡山県', '広島県', '山口県'],
  },
  {
    label: '四国地方',
    icon: 'island',
    prefectures: ['徳島県', '香川県', '愛媛県', '高知県'],
  },
  {
    label: '九州・沖縄地方',
    icon: 'waves',
    prefectures: ['福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'],
  },
];

const AREA_PRESETS: AreaPreset[] = [
  { label: '現在地', group: '現在地', latitude: 0, longitude: 0 },

  { label: '梅田', group: '大阪府 / 大阪市北区', latitude: 34.7025, longitude: 135.4959 },
  { label: '大阪駅', group: '大阪府 / 大阪市北区', latitude: 34.7024, longitude: 135.4959 },
  { label: '北新地', group: '大阪府 / 大阪市北区', latitude: 34.6977, longitude: 135.4973 },
  { label: '中津', group: '大阪府 / 大阪市北区', latitude: 34.7114, longitude: 135.4925 },
  { label: '中崎町', group: '大阪府 / 大阪市北区', latitude: 34.7071, longitude: 135.5055 },
  { label: '天満', group: '大阪府 / 大阪市北区', latitude: 34.7049, longitude: 135.5122 },
  { label: '扇町', group: '大阪府 / 大阪市北区', latitude: 34.7043, longitude: 135.5103 },
  { label: '南森町', group: '大阪府 / 大阪市北区', latitude: 34.6973, longitude: 135.5115 },
  { label: '天神橋筋六丁目', group: '大阪府 / 大阪市北区', latitude: 34.7106, longitude: 135.5105 },

  { label: '福島', group: '大阪府 / 大阪市福島区', latitude: 34.6971, longitude: 135.4862 },
  { label: '野田', group: '大阪府 / 大阪市福島区', latitude: 34.6894, longitude: 135.4747 },
  { label: '新福島', group: '大阪府 / 大阪市福島区', latitude: 34.6955, longitude: 135.486 },
  { label: '海老江', group: '大阪府 / 大阪市福島区', latitude: 34.6943, longitude: 135.4741 },

  { label: '心斎橋', group: '大阪府 / 大阪市中央区', latitude: 34.6751, longitude: 135.5002 },
  { label: '難波', group: '大阪府 / 大阪市中央区', latitude: 34.6658, longitude: 135.5011 },
  { label: '日本橋', group: '大阪府 / 大阪市中央区', latitude: 34.6651, longitude: 135.5061 },
  { label: '本町', group: '大阪府 / 大阪市中央区', latitude: 34.6813, longitude: 135.5008 },
  { label: '淀屋橋', group: '大阪府 / 大阪市中央区', latitude: 34.6923, longitude: 135.5017 },
  { label: '北浜', group: '大阪府 / 大阪市中央区', latitude: 34.6916, longitude: 135.5069 },
  { label: '谷町四丁目', group: '大阪府 / 大阪市中央区', latitude: 34.681, longitude: 135.517 },
  { label: '松屋町', group: '大阪府 / 大阪市中央区', latitude: 34.6746, longitude: 135.5125 },
  { label: '森ノ宮', group: '大阪府 / 大阪市中央区', latitude: 34.6814, longitude: 135.5331 },

  { label: '堀江', group: '大阪府 / 大阪市西区', latitude: 34.6721, longitude: 135.4934 },
  { label: '四ツ橋', group: '大阪府 / 大阪市西区', latitude: 34.674, longitude: 135.4962 },
  { label: '阿波座', group: '大阪府 / 大阪市西区', latitude: 34.6828, longitude: 135.4864 },
  { label: '九条', group: '大阪府 / 大阪市西区', latitude: 34.6749, longitude: 135.4731 },

  { label: '天王寺', group: '大阪府 / 大阪市天王寺区', latitude: 34.6501, longitude: 135.5138 },
  { label: '上本町', group: '大阪府 / 大阪市天王寺区', latitude: 34.6659, longitude: 135.5197 },
  { label: '四天王寺前夕陽ヶ丘', group: '大阪府 / 大阪市天王寺区', latitude: 34.6587, longitude: 135.5137 },
  { label: '寺田町', group: '大阪府 / 大阪市天王寺区', latitude: 34.6475, longitude: 135.5241 },

  { label: '阿倍野', group: '大阪府 / 大阪市阿倍野区', latitude: 34.6462, longitude: 135.5133 },
  { label: '昭和町', group: '大阪府 / 大阪市阿倍野区', latitude: 34.6339, longitude: 135.5164 },
  { label: '西田辺', group: '大阪府 / 大阪市阿倍野区', latitude: 34.6216, longitude: 135.5152 },

  { label: '新世界', group: '大阪府 / 大阪市浪速区', latitude: 34.6525, longitude: 135.5063 },
  { label: '大国町', group: '大阪府 / 大阪市浪速区', latitude: 34.6556, longitude: 135.4972 },
  { label: '恵美須町', group: '大阪府 / 大阪市浪速区', latitude: 34.6542, longitude: 135.5056 },
  { label: '桜川', group: '大阪府 / 大阪市浪速区', latitude: 34.6682, longitude: 135.4861 },

  { label: '鶴橋', group: '大阪府 / 大阪市生野区', latitude: 34.6655, longitude: 135.5301 },
  { label: '桃谷', group: '大阪府 / 大阪市生野区', latitude: 34.6586, longitude: 135.5278 },
  { label: '今里', group: '大阪府 / 大阪市東成区', latitude: 34.6686, longitude: 135.5435 },
  { label: '緑橋', group: '大阪府 / 大阪市東成区', latitude: 34.6812, longitude: 135.5444 },

  { label: '京橋', group: '大阪府 / 大阪市都島区', latitude: 34.6974, longitude: 135.5327 },
  { label: '都島', group: '大阪府 / 大阪市都島区', latitude: 34.7081, longitude: 135.5255 },
  { label: '桜ノ宮', group: '大阪府 / 大阪市都島区', latitude: 34.7041, longitude: 135.5202 },

  { label: '新大阪', group: '大阪府 / 大阪市淀川区', latitude: 34.7335, longitude: 135.5002 },
  { label: '十三', group: '大阪府 / 大阪市淀川区', latitude: 34.7209, longitude: 135.4829 },
  { label: '西中島南方', group: '大阪府 / 大阪市淀川区', latitude: 34.7264, longitude: 135.4993 },
  { label: '塚本', group: '大阪府 / 大阪市淀川区', latitude: 34.712, longitude: 135.4683 },

  { label: '弁天町', group: '大阪府 / 大阪市港区', latitude: 34.6692, longitude: 135.4624 },
  { label: '大正', group: '大阪府 / 大阪市大正区', latitude: 34.6654, longitude: 135.4798 },
  { label: '住之江公園', group: '大阪府 / 大阪市住之江区', latitude: 34.6099, longitude: 135.4723 },
  { label: '長居', group: '大阪府 / 大阪市住吉区', latitude: 34.6108, longitude: 135.5133 },

  { label: '江坂', group: '大阪府 / 吹田市', latitude: 34.7587, longitude: 135.4971 },
  { label: '吹田', group: '大阪府 / 吹田市', latitude: 34.763, longitude: 135.5232 },
  { label: '千里山', group: '大阪府 / 吹田市', latitude: 34.7796, longitude: 135.505 },
  { label: '万博記念公園', group: '大阪府 / 吹田市', latitude: 34.81, longitude: 135.5303 },
  { label: '千里中央', group: '大阪府 / 豊中市', latitude: 34.8095, longitude: 135.4954 },
  { label: '豊中', group: '大阪府 / 豊中市', latitude: 34.7876, longitude: 135.4617 },
  { label: '蛍池', group: '大阪府 / 豊中市', latitude: 34.7946, longitude: 135.4495 },
  { label: '池田', group: '大阪府 / 池田市', latitude: 34.8217, longitude: 135.4285 },
  { label: '石橋阪大前', group: '大阪府 / 池田市', latitude: 34.8078, longitude: 135.4459 },
  { label: '高槻', group: '大阪府 / 高槻市', latitude: 34.8519, longitude: 135.6173 },
  { label: '茨木', group: '大阪府 / 茨木市', latitude: 34.8164, longitude: 135.5686 },
  { label: '枚方市', group: '大阪府 / 枚方市', latitude: 34.8155, longitude: 135.6486 },
  { label: '樟葉', group: '大阪府 / 枚方市', latitude: 34.8617, longitude: 135.6753 },
  { label: '守口市', group: '大阪府 / 守口市', latitude: 34.7354, longitude: 135.5655 },
  { label: '門真市', group: '大阪府 / 門真市', latitude: 34.738, longitude: 135.5826 },
  { label: '寝屋川市', group: '大阪府 / 寝屋川市', latitude: 34.7636, longitude: 135.6216 },
  { label: '東大阪', group: '大阪府 / 東大阪市', latitude: 34.6795, longitude: 135.6008 },
  { label: '布施', group: '大阪府 / 東大阪市', latitude: 34.6646, longitude: 135.5636 },
  { label: '八尾', group: '大阪府 / 八尾市', latitude: 34.6269, longitude: 135.6009 },
  { label: '堺東', group: '大阪府 / 堺市堺区', latitude: 34.5755, longitude: 135.4849 },
  { label: '堺', group: '大阪府 / 堺市堺区', latitude: 34.5814, longitude: 135.4693 },
  { label: '中百舌鳥', group: '大阪府 / 堺市北区', latitude: 34.5564, longitude: 135.5044 },
  { label: '三国ヶ丘', group: '大阪府 / 堺市堺区', latitude: 34.5654, longitude: 135.4924 },
  { label: '泉佐野', group: '大阪府 / 泉佐野市', latitude: 34.4107, longitude: 135.3167 },
  { label: '岸和田', group: '大阪府 / 岸和田市', latitude: 34.4604, longitude: 135.3786 },

  { label: '河原町', group: '京都府 / 京都市中京区・下京区', latitude: 35.0037, longitude: 135.7689 },
  { label: '烏丸', group: '京都府 / 京都市中京区・下京区', latitude: 35.0031, longitude: 135.7595 },
  { label: '四条', group: '京都府 / 京都市中京区・下京区', latitude: 35.0035, longitude: 135.7599 },
  { label: '京都駅', group: '京都府 / 京都市下京区', latitude: 34.9858, longitude: 135.7588 },
  { label: '五条', group: '京都府 / 京都市下京区', latitude: 34.9951, longitude: 135.7598 },
  { label: '祇園', group: '京都府 / 京都市東山区', latitude: 35.0038, longitude: 135.7786 },
  { label: '清水五条', group: '京都府 / 京都市東山区', latitude: 34.9967, longitude: 135.7689 },
  { label: '三条', group: '京都府 / 京都市東山区', latitude: 35.0094, longitude: 135.7723 },
  { label: '出町柳', group: '京都府 / 京都市左京区', latitude: 35.0305, longitude: 135.7723 },
  { label: '百万遍', group: '京都府 / 京都市左京区', latitude: 35.0288, longitude: 135.7794 },
  { label: '北大路', group: '京都府 / 京都市北区', latitude: 35.0442, longitude: 135.7585 },
  { label: '西院', group: '京都府 / 京都市右京区', latitude: 35.0036, longitude: 135.7315 },
  { label: '嵐山', group: '京都府 / 京都市右京区', latitude: 35.0094, longitude: 135.6668 },
  { label: '伏見桃山', group: '京都府 / 京都市伏見区', latitude: 34.9337, longitude: 135.7652 },
  { label: '宇治', group: '京都府 / 宇治市', latitude: 34.8894, longitude: 135.803 },
  { label: '長岡天神', group: '京都府 / 長岡京市', latitude: 34.9254, longitude: 135.6928 },
  { label: '福知山', group: '京都府 / 福知山市', latitude: 35.2966, longitude: 135.1182 },
  { label: '舞鶴', group: '京都府 / 舞鶴市', latitude: 35.4748, longitude: 135.3861 },

  { label: '三宮', group: '兵庫県 / 神戸市中央区', latitude: 34.6941, longitude: 135.1955 },
  { label: '元町', group: '兵庫県 / 神戸市中央区', latitude: 34.6896, longitude: 135.1877 },
  { label: '花隈', group: '兵庫県 / 神戸市中央区', latitude: 34.6885, longitude: 135.1818 },
  { label: '神戸駅', group: '兵庫県 / 神戸市中央区', latitude: 34.6795, longitude: 135.1781 },
  { label: '旧居留地', group: '兵庫県 / 神戸市中央区', latitude: 34.6886, longitude: 135.193 },
  { label: '北野', group: '兵庫県 / 神戸市中央区', latitude: 34.6999, longitude: 135.1906 },
  { label: '灘', group: '兵庫県 / 神戸市灘区', latitude: 34.7107, longitude: 135.2161 },
  { label: '六甲道', group: '兵庫県 / 神戸市灘区', latitude: 34.7141, longitude: 135.2383 },
  { label: '御影', group: '兵庫県 / 神戸市東灘区', latitude: 34.7157, longitude: 135.2568 },
  { label: '住吉', group: '兵庫県 / 神戸市東灘区', latitude: 34.7191, longitude: 135.2625 },
  { label: '岡本', group: '兵庫県 / 神戸市東灘区', latitude: 34.7281, longitude: 135.2754 },
  { label: '芦屋', group: '兵庫県 / 芦屋市', latitude: 34.7341, longitude: 135.3068 },
  { label: '西宮北口', group: '兵庫県 / 西宮市', latitude: 34.745, longitude: 135.3567 },
  { label: '甲子園', group: '兵庫県 / 西宮市', latitude: 34.7213, longitude: 135.3616 },
  { label: '尼崎', group: '兵庫県 / 尼崎市', latitude: 34.7184, longitude: 135.4173 },
  { label: '塚口', group: '兵庫県 / 尼崎市', latitude: 34.7521, longitude: 135.4161 },
  { label: '伊丹', group: '兵庫県 / 伊丹市', latitude: 34.7805, longitude: 135.4127 },
  { label: '宝塚', group: '兵庫県 / 宝塚市', latitude: 34.8113, longitude: 135.3416 },
  { label: '川西能勢口', group: '兵庫県 / 川西市', latitude: 34.8271, longitude: 135.413 },
  { label: '明石', group: '兵庫県 / 明石市', latitude: 34.649, longitude: 134.9925 },
  { label: '姫路', group: '兵庫県 / 姫路市', latitude: 34.8275, longitude: 134.6908 },
  { label: '加古川', group: '兵庫県 / 加古川市', latitude: 34.7676, longitude: 134.8391 },
  { label: '豊岡', group: '兵庫県 / 豊岡市', latitude: 35.5447, longitude: 134.8202 },

  { label: '奈良', group: '奈良県 / 奈良市', latitude: 34.6851, longitude: 135.8048 },
  { label: '近鉄奈良', group: '奈良県 / 奈良市', latitude: 34.6844, longitude: 135.8277 },
  { label: '新大宮', group: '奈良県 / 奈良市', latitude: 34.6852, longitude: 135.8116 },
  { label: '西大寺', group: '奈良県 / 奈良市', latitude: 34.6938, longitude: 135.7835 },
  { label: '学園前', group: '奈良県 / 奈良市', latitude: 34.6975, longitude: 135.7497 },
  { label: '生駒', group: '奈良県 / 生駒市', latitude: 34.6938, longitude: 135.697 },
  { label: '大和西大寺', group: '奈良県 / 奈良市', latitude: 34.6938, longitude: 135.7835 },
  { label: '大和八木', group: '奈良県 / 橿原市', latitude: 34.5136, longitude: 135.7926 },
  { label: '橿原神宮前', group: '奈良県 / 橿原市', latitude: 34.4834, longitude: 135.7942 },
  { label: '王寺', group: '奈良県 / 王寺町', latitude: 34.5975, longitude: 135.7043 },
  { label: '天理', group: '奈良県 / 天理市', latitude: 34.5966, longitude: 135.8307 },
  { label: '大和郡山', group: '奈良県 / 大和郡山市', latitude: 34.6466, longitude: 135.7824 },

  { label: '大津', group: '滋賀県 / 大津市', latitude: 35.0045, longitude: 135.8686 },
  { label: '膳所', group: '滋賀県 / 大津市', latitude: 34.9997, longitude: 135.8804 },
  { label: '石山', group: '滋賀県 / 大津市', latitude: 34.9791, longitude: 135.9003 },
  { label: '草津', group: '滋賀県 / 草津市', latitude: 35.0229, longitude: 135.9626 },
  { label: '南草津', group: '滋賀県 / 草津市', latitude: 35.0036, longitude: 135.9479 },
  { label: '守山', group: '滋賀県 / 守山市', latitude: 35.0509, longitude: 135.994 },
  { label: '栗東', group: '滋賀県 / 栗東市', latitude: 35.0377, longitude: 135.981 },
  { label: '近江八幡', group: '滋賀県 / 近江八幡市', latitude: 35.1229, longitude: 136.1029 },
  { label: '彦根', group: '滋賀県 / 彦根市', latitude: 35.2723, longitude: 136.2634 },
  { label: '長浜', group: '滋賀県 / 長浜市', latitude: 35.3785, longitude: 136.2656 },

  { label: '和歌山', group: '和歌山県 / 和歌山市', latitude: 34.2324, longitude: 135.1917 },
  { label: '和歌山市', group: '和歌山県 / 和歌山市', latitude: 34.236, longitude: 135.1668 },
  { label: '紀三井寺', group: '和歌山県 / 和歌山市', latitude: 34.1878, longitude: 135.1905 },
  { label: '海南', group: '和歌山県 / 海南市', latitude: 34.1553, longitude: 135.2143 },
  { label: '岩出', group: '和歌山県 / 岩出市', latitude: 34.2563, longitude: 135.3114 },
  { label: '橋本', group: '和歌山県 / 橋本市', latitude: 34.3174, longitude: 135.6143 },
  { label: '御坊', group: '和歌山県 / 御坊市', latitude: 33.8914, longitude: 135.1524 },
  { label: '田辺', group: '和歌山県 / 田辺市', latitude: 33.7338, longitude: 135.3786 },
  { label: '白浜', group: '和歌山県 / 白浜町', latitude: 33.6782, longitude: 135.3481 },

  { label: '津', group: '三重県 / 津市', latitude: 34.733, longitude: 136.5102 },
  { label: '四日市', group: '三重県 / 四日市市', latitude: 34.965, longitude: 136.6244 },
  { label: '桑名', group: '三重県 / 桑名市', latitude: 35.0667, longitude: 136.6833 },
  { label: '鈴鹿', group: '三重県 / 鈴鹿市', latitude: 34.8821, longitude: 136.5842 },
  { label: '松阪', group: '三重県 / 松阪市', latitude: 34.5779, longitude: 136.5276 },
  { label: '伊勢市', group: '三重県 / 伊勢市', latitude: 34.491, longitude: 136.7092 },
  { label: '鳥羽', group: '三重県 / 鳥羽市', latitude: 34.4868, longitude: 136.8434 },
  { label: '伊賀上野', group: '三重県 / 伊賀市', latitude: 34.7686, longitude: 136.1301 },
  { label: '名張', group: '三重県 / 名張市', latitude: 34.6217, longitude: 136.0967 },

  { label: '札幌', group: '北海道 / 札幌市', latitude: 43.0618, longitude: 141.3545 },
  { label: 'すすきの', group: '北海道 / 札幌市', latitude: 43.0555, longitude: 141.3532 },
  { label: '函館', group: '北海道 / 函館市', latitude: 41.7687, longitude: 140.7288 },
  { label: '旭川', group: '北海道 / 旭川市', latitude: 43.7706, longitude: 142.365 },
  { label: '小樽', group: '北海道 / 小樽市', latitude: 43.1907, longitude: 140.9947 },
  { label: '帯広', group: '北海道 / 帯広市', latitude: 42.9237, longitude: 143.1967 },
  { label: '釧路', group: '北海道 / 釧路市', latitude: 42.9849, longitude: 144.3818 },
  { label: '青森', group: '青森県 / 青森市', latitude: 40.8222, longitude: 140.7474 },
  { label: '弘前', group: '青森県 / 弘前市', latitude: 40.6031, longitude: 140.4639 },
  { label: '八戸', group: '青森県 / 八戸市', latitude: 40.5123, longitude: 141.4884 },
  { label: '盛岡', group: '岩手県 / 盛岡市', latitude: 39.7017, longitude: 141.1367 },
  { label: '花巻', group: '岩手県 / 花巻市', latitude: 39.3886, longitude: 141.1167 },
  { label: '一関', group: '岩手県 / 一関市', latitude: 38.9348, longitude: 141.1265 },
  { label: '仙台', group: '宮城県 / 仙台市', latitude: 38.2682, longitude: 140.8694 },
  { label: '国分町', group: '宮城県 / 仙台市', latitude: 38.2636, longitude: 140.8706 },
  { label: '石巻', group: '宮城県 / 石巻市', latitude: 38.4345, longitude: 141.3029 },
  { label: '秋田', group: '秋田県 / 秋田市', latitude: 39.7186, longitude: 140.1024 },
  { label: '大館', group: '秋田県 / 大館市', latitude: 40.2716, longitude: 140.5646 },
  { label: '横手', group: '秋田県 / 横手市', latitude: 39.3137, longitude: 140.5667 },
  { label: '山形', group: '山形県 / 山形市', latitude: 38.2554, longitude: 140.3396 },
  { label: '米沢', group: '山形県 / 米沢市', latitude: 37.9222, longitude: 140.1168 },
  { label: '酒田', group: '山形県 / 酒田市', latitude: 38.9146, longitude: 139.8365 },
  { label: '福島', group: '福島県 / 福島市', latitude: 37.7608, longitude: 140.4748 },
  { label: '郡山', group: '福島県 / 郡山市', latitude: 37.4004, longitude: 140.3597 },
  { label: 'いわき', group: '福島県 / いわき市', latitude: 37.0505, longitude: 140.8877 },
  { label: '水戸', group: '茨城県 / 水戸市', latitude: 36.3659, longitude: 140.4714 },
  { label: 'つくば', group: '茨城県 / つくば市', latitude: 36.0835, longitude: 140.0764 },
  { label: '土浦', group: '茨城県 / 土浦市', latitude: 36.0785, longitude: 140.2046 },
  { label: '宇都宮', group: '栃木県 / 宇都宮市', latitude: 36.5551, longitude: 139.8828 },
  { label: '小山', group: '栃木県 / 小山市', latitude: 36.3147, longitude: 139.8001 },
  { label: '那須塩原', group: '栃木県 / 那須塩原市', latitude: 36.9312, longitude: 140.0196 },
  { label: '前橋', group: '群馬県 / 前橋市', latitude: 36.3895, longitude: 139.0634 },
  { label: '高崎', group: '群馬県 / 高崎市', latitude: 36.3222, longitude: 139.0033 },
  { label: '太田', group: '群馬県 / 太田市', latitude: 36.2912, longitude: 139.3754 },
  { label: '大宮', group: '埼玉県 / さいたま市', latitude: 35.9066, longitude: 139.6236 },
  { label: '浦和', group: '埼玉県 / さいたま市', latitude: 35.8585, longitude: 139.6575 },
  { label: '川越', group: '埼玉県 / 川越市', latitude: 35.9251, longitude: 139.4858 },
  { label: '所沢', group: '埼玉県 / 所沢市', latitude: 35.7995, longitude: 139.4686 },
  { label: '千葉', group: '千葉県 / 千葉市', latitude: 35.6074, longitude: 140.1065 },
  { label: '船橋', group: '千葉県 / 船橋市', latitude: 35.6947, longitude: 139.9826 },
  { label: '柏', group: '千葉県 / 柏市', latitude: 35.8623, longitude: 139.9709 },
  { label: '松戸', group: '千葉県 / 松戸市', latitude: 35.784, longitude: 139.9008 },
  { label: '東京駅', group: '東京都 / 千代田区', latitude: 35.6812, longitude: 139.7671 },
  { label: '有楽町', group: '東京都 / 千代田区', latitude: 35.6751, longitude: 139.7633 },
  { label: '銀座', group: '東京都 / 中央区', latitude: 35.6719, longitude: 139.7659 },
  { label: '日本橋', group: '東京都 / 中央区', latitude: 35.6825, longitude: 139.7745 },
  { label: '新宿', group: '東京都 / 新宿区', latitude: 35.6896, longitude: 139.7006 },
  { label: '歌舞伎町', group: '東京都 / 新宿区', latitude: 35.6954, longitude: 139.7036 },
  { label: '渋谷', group: '東京都 / 渋谷区', latitude: 35.658, longitude: 139.7016 },
  { label: '恵比寿', group: '東京都 / 渋谷区', latitude: 35.6467, longitude: 139.7101 },
  { label: '池袋', group: '東京都 / 豊島区', latitude: 35.7289, longitude: 139.7104 },
  { label: '上野', group: '東京都 / 台東区', latitude: 35.7138, longitude: 139.7773 },
  { label: '浅草', group: '東京都 / 台東区', latitude: 35.7148, longitude: 139.7967 },
  { label: '横浜', group: '神奈川県 / 横浜市', latitude: 35.4658, longitude: 139.6223 },
  { label: 'みなとみらい', group: '神奈川県 / 横浜市', latitude: 35.4573, longitude: 139.6329 },
  { label: '川崎', group: '神奈川県 / 川崎市', latitude: 35.5308, longitude: 139.7036 },
  { label: '武蔵小杉', group: '神奈川県 / 川崎市', latitude: 35.5756, longitude: 139.6597 },
  { label: '藤沢', group: '神奈川県 / 藤沢市', latitude: 35.3388, longitude: 139.4912 },
  { label: '鎌倉', group: '神奈川県 / 鎌倉市', latitude: 35.3192, longitude: 139.5467 },
  { label: '新潟', group: '新潟県 / 新潟市', latitude: 37.9161, longitude: 139.0364 },
  { label: '長岡', group: '新潟県 / 長岡市', latitude: 37.4464, longitude: 138.8512 },
  { label: '上越', group: '新潟県 / 上越市', latitude: 37.1479, longitude: 138.236 },
  { label: '富山', group: '富山県 / 富山市', latitude: 36.6953, longitude: 137.2113 },
  { label: '高岡', group: '富山県 / 高岡市', latitude: 36.7541, longitude: 137.0257 },
  { label: '魚津', group: '富山県 / 魚津市', latitude: 36.8274, longitude: 137.4092 },
  { label: '金沢', group: '石川県 / 金沢市', latitude: 36.5613, longitude: 136.6562 },
  { label: '片町', group: '石川県 / 金沢市', latitude: 36.5609, longitude: 136.652 },
  { label: '小松', group: '石川県 / 小松市', latitude: 36.4026, longitude: 136.4526 },
  { label: '福井', group: '福井県 / 福井市', latitude: 36.0641, longitude: 136.2196 },
  { label: '敦賀', group: '福井県 / 敦賀市', latitude: 35.6452, longitude: 136.0554 },
  { label: '鯖江', group: '福井県 / 鯖江市', latitude: 35.9566, longitude: 136.1846 },
  { label: '甲府', group: '山梨県 / 甲府市', latitude: 35.6622, longitude: 138.5683 },
  { label: '富士吉田', group: '山梨県 / 富士吉田市', latitude: 35.4875, longitude: 138.8077 },
  { label: '長野', group: '長野県 / 長野市', latitude: 36.6486, longitude: 138.1948 },
  { label: '松本', group: '長野県 / 松本市', latitude: 36.238, longitude: 137.9719 },
  { label: '上田', group: '長野県 / 上田市', latitude: 36.4019, longitude: 138.2491 },
  { label: '岐阜', group: '岐阜県 / 岐阜市', latitude: 35.4233, longitude: 136.7607 },
  { label: '大垣', group: '岐阜県 / 大垣市', latitude: 35.3667, longitude: 136.6177 },
  { label: '高山', group: '岐阜県 / 高山市', latitude: 36.1461, longitude: 137.2522 },
  { label: '静岡', group: '静岡県 / 静岡市', latitude: 34.9716, longitude: 138.3886 },
  { label: '浜松', group: '静岡県 / 浜松市', latitude: 34.7108, longitude: 137.7261 },
  { label: '沼津', group: '静岡県 / 沼津市', latitude: 35.0956, longitude: 138.8635 },
  { label: '名古屋', group: '愛知県 / 名古屋市', latitude: 35.1709, longitude: 136.8815 },
  { label: '栄', group: '愛知県 / 名古屋市', latitude: 35.1697, longitude: 136.9081 },
  { label: '金山', group: '愛知県 / 名古屋市', latitude: 35.1439, longitude: 136.9006 },
  { label: '豊橋', group: '愛知県 / 豊橋市', latitude: 34.7628, longitude: 137.3815 },
  { label: '岡崎', group: '愛知県 / 岡崎市', latitude: 34.9549, longitude: 137.1744 },
  { label: '津', group: '三重県 / 津市', latitude: 34.733, longitude: 136.5102 },
  { label: '四日市', group: '三重県 / 四日市市', latitude: 34.965, longitude: 136.6244 },
  { label: '桑名', group: '三重県 / 桑名市', latitude: 35.0667, longitude: 136.6833 },
  { label: '広島', group: '広島県 / 広島市', latitude: 34.3853, longitude: 132.4553 },
  { label: '八丁堀', group: '広島県 / 広島市', latitude: 34.3932, longitude: 132.4635 },
  { label: '福山', group: '広島県 / 福山市', latitude: 34.4859, longitude: 133.3623 },
  { label: '岡山', group: '岡山県 / 岡山市', latitude: 34.6664, longitude: 133.9186 },
  { label: '倉敷', group: '岡山県 / 倉敷市', latitude: 34.585, longitude: 133.7722 },
  { label: '鳥取', group: '鳥取県 / 鳥取市', latitude: 35.5011, longitude: 134.2351 },
  { label: '米子', group: '鳥取県 / 米子市', latitude: 35.4281, longitude: 133.3309 },
  { label: '松江', group: '島根県 / 松江市', latitude: 35.4681, longitude: 133.0484 },
  { label: '出雲', group: '島根県 / 出雲市', latitude: 35.367, longitude: 132.7547 },
  { label: '山口', group: '山口県 / 山口市', latitude: 34.1785, longitude: 131.4737 },
  { label: '下関', group: '山口県 / 下関市', latitude: 33.9578, longitude: 130.9415 },
  { label: '徳島', group: '徳島県 / 徳島市', latitude: 34.0703, longitude: 134.5548 },
  { label: '鳴門', group: '徳島県 / 鳴門市', latitude: 34.1726, longitude: 134.6088 },
  { label: '高松', group: '香川県 / 高松市', latitude: 34.3428, longitude: 134.0466 },
  { label: '丸亀', group: '香川県 / 丸亀市', latitude: 34.2895, longitude: 133.7977 },
  { label: '松山', group: '愛媛県 / 松山市', latitude: 33.8392, longitude: 132.7657 },
  { label: '今治', group: '愛媛県 / 今治市', latitude: 34.0662, longitude: 132.9978 },
  { label: '高知', group: '高知県 / 高知市', latitude: 33.5597, longitude: 133.5311 },
  { label: '福岡', group: '福岡県 / 福岡市', latitude: 33.5902, longitude: 130.4017 },
  { label: '天神', group: '福岡県 / 福岡市', latitude: 33.5903, longitude: 130.3987 },
  { label: '博多', group: '福岡県 / 福岡市', latitude: 33.5904, longitude: 130.4207 },
  { label: '北九州', group: '福岡県 / 北九州市', latitude: 33.8834, longitude: 130.8751 },
  { label: '久留米', group: '福岡県 / 久留米市', latitude: 33.3193, longitude: 130.5084 },
  { label: '佐賀', group: '佐賀県 / 佐賀市', latitude: 33.2635, longitude: 130.3009 },
  { label: '唐津', group: '佐賀県 / 唐津市', latitude: 33.45, longitude: 129.968 },
  { label: '長崎', group: '長崎県 / 長崎市', latitude: 32.7503, longitude: 129.8777 },
  { label: '佐世保', group: '長崎県 / 佐世保市', latitude: 33.1799, longitude: 129.7151 },
  { label: '熊本', group: '熊本県 / 熊本市', latitude: 32.8031, longitude: 130.7079 },
  { label: '下通', group: '熊本県 / 熊本市', latitude: 32.8021, longitude: 130.7072 },
  { label: '八代', group: '熊本県 / 八代市', latitude: 32.5075, longitude: 130.6017 },
  { label: '大分', group: '大分県 / 大分市', latitude: 33.2396, longitude: 131.6093 },
  { label: '別府', group: '大分県 / 別府市', latitude: 33.2795, longitude: 131.5009 },
  { label: '宮崎', group: '宮崎県 / 宮崎市', latitude: 31.9111, longitude: 131.4239 },
  { label: '都城', group: '宮崎県 / 都城市', latitude: 31.7196, longitude: 131.0616 },
  { label: '鹿児島中央', group: '鹿児島県 / 鹿児島市', latitude: 31.5833, longitude: 130.5417 },
  { label: '天文館', group: '鹿児島県 / 鹿児島市', latitude: 31.5907, longitude: 130.5571 },
  { label: '霧島', group: '鹿児島県 / 霧島市', latitude: 31.7411, longitude: 130.7631 },
  { label: '那覇', group: '沖縄県 / 那覇市', latitude: 26.2124, longitude: 127.6792 },
  { label: '国際通り', group: '沖縄県 / 那覇市', latitude: 26.2154, longitude: 127.6891 },
  { label: '沖縄市', group: '沖縄県 / 沖縄市', latitude: 26.3344, longitude: 127.8056 },
  { label: '浦添', group: '沖縄県 / 浦添市', latitude: 26.2458, longitude: 127.7219 },
];

const SUPPLEMENTAL_AREA_NAMES: Record<string, string[]> = {
  北海道: ['北見市', '室蘭市', '苫小牧市', '江別市', '千歳市', '岩見沢市', '網走市', '稚内市', '名寄市', '根室市', '富良野市', '登別市', '北斗市'],
  青森県: ['五所川原市', '十和田市', 'むつ市', '三沢市', '黒石市', 'つがる市', '平川市', '七戸町', '藤崎町', '鰺ヶ沢町'],
  岩手県: ['宮古市', '大船渡市', '北上市', '奥州市', '久慈市', '遠野市', '釜石市', '二戸市', '八幡平市', '滝沢市', '紫波町'],
  宮城県: ['塩竈市', '気仙沼市', '白石市', '名取市', '角田市', '多賀城市', '岩沼市', '登米市', '栗原市', '東松島市', '大崎市', '富谷市'],
  秋田県: ['能代市', '男鹿市', '湯沢市', '由利本荘市', '潟上市', '大仙市', '北秋田市', 'にかほ市', '仙北市', '鹿角市', '羽後町'],
  山形県: ['鶴岡市', '新庄市', '寒河江市', '上山市', '村山市', '長井市', '天童市', '東根市', '尾花沢市', '南陽市', '河北町'],
  福島県: ['会津若松市', '白河市', '須賀川市', '喜多方市', '相馬市', '二本松市', '田村市', '南相馬市', '伊達市', '本宮市', '猪苗代町'],
  茨城県: ['日立市', '古河市', '石岡市', '結城市', '龍ケ崎市', '下妻市', '常総市', '常陸太田市', '笠間市', '取手市', '牛久市', '鹿嶋市', '守谷市', 'ひたちなか市'],
  栃木県: ['足利市', '栃木市', '佐野市', '鹿沼市', '日光市', '真岡市', '大田原市', '矢板市', 'さくら市', '那須烏山市', '下野市', '壬生町'],
  群馬県: ['桐生市', '伊勢崎市', '沼田市', '館林市', '渋川市', '藤岡市', '富岡市', '安中市', 'みどり市', '草津町', '中之条町'],
  埼玉県: ['熊谷市', '川口市', '行田市', '秩父市', '飯能市', '加須市', '本庄市', '春日部市', '狭山市', '深谷市', '上尾市', '草加市', '越谷市', '入間市', '朝霞市'],
  千葉県: ['銚子市', '市川市', '館山市', '木更津市', '野田市', '茂原市', '成田市', '佐倉市', '東金市', '旭市', '習志野市', '市原市', '流山市', '八千代市', '鴨川市'],
  東京都: ['八王子市', '立川市', '武蔵野市', '三鷹市', '青梅市', '調布市', '町田市', '小金井市', '日野市', '国分寺市', '国立市', '福生市', '狛江市', '東村山市', '多摩市'],
  神奈川県: ['横須賀市', '平塚市', '小田原市', '茅ヶ崎市', '逗子市', '相模原市', '三浦市', '秦野市', '厚木市', '大和市', '伊勢原市', '海老名市', '座間市'],
  新潟県: ['三条市', '柏崎市', '新発田市', '小千谷市', '加茂市', '十日町市', '見附市', '村上市', '燕市', '糸魚川市', '妙高市', '佐渡市', '南魚沼市'],
  富山県: ['氷見市', '滑川市', '黒部市', '砺波市', '小矢部市', '南砺市', '射水市', '入善町', '立山町', '上市町'],
  石川県: ['七尾市', '輪島市', '珠洲市', '加賀市', '羽咋市', 'かほく市', '白山市', '能美市', '野々市市', '津幡町', '志賀町'],
  福井県: ['小浜市', '大野市', '勝山市', 'あわら市', '越前市', '坂井市', '永平寺町', '越前町', '若狭町', '高浜町'],
  山梨県: ['山梨市', '大月市', '韮崎市', '南アルプス市', '北杜市', '甲斐市', '笛吹市', '上野原市', '甲州市', '中央市', '富士河口湖町'],
  長野県: ['岡谷市', '諏訪市', '飯田市', '伊那市', '駒ヶ根市', '中野市', '大町市', '飯山市', '茅野市', '塩尻市', '佐久市', '千曲市', '安曇野市', '軽井沢町'],
  岐阜県: ['多治見市', '関市', '中津川市', '美濃市', '瑞浪市', '羽島市', '恵那市', '美濃加茂市', '土岐市', '各務原市', '可児市', '郡上市', '下呂市'],
  静岡県: ['熱海市', '三島市', '富士宮市', '伊東市', '島田市', '富士市', '磐田市', '焼津市', '掛川市', '藤枝市', '御殿場市', '袋井市', '下田市', '伊豆市', '菊川市'],
  愛知県: ['一宮市', '瀬戸市', '半田市', '春日井市', '豊川市', '碧南市', '刈谷市', '豊田市', '安城市', '西尾市', '蒲郡市', '犬山市', '常滑市', '小牧市', '稲沢市'],
  三重県: ['亀山市', '熊野市', 'いなべ市', '志摩市', '尾鷲市', '菰野町', '多気町', '明和町', '玉城町', '紀北町'],
  滋賀県: ['甲賀市', '野洲市', '湖南市', '高島市', '東近江市', '米原市', '日野町', '愛荘町', '多賀町'],
  京都府: ['亀岡市', '城陽市', '向日市', '八幡市', '京田辺市', '京丹後市', '南丹市', '木津川市', '久御山町', '精華町'],
  大阪府: ['箕面市', '摂津市', '大東市', '四條畷市', '交野市', '富田林市', '河内長野市', '和泉市', '貝塚市', '泉大津市', '羽曳野市', '藤井寺市', '松原市', '高石市', '泉南市', '阪南市'],
  兵庫県: ['三田市', '丹波篠山市', '丹波市', '洲本市', '淡路市', '南あわじ市', '赤穂市', '相生市', '西脇市', '小野市', '加西市', '宍粟市', '養父市', '朝来市', 'たつの市'],
  奈良県: ['桜井市', '五條市', '御所市', '香芝市', '葛城市', '宇陀市', '斑鳩町', '田原本町', '広陵町', '吉野町', '大淀町'],
  和歌山県: ['有田市', '新宮市', '紀の川市', 'かつらぎ町', '湯浅町', '有田川町', '美浜町', 'みなべ町', '串本町', '那智勝浦町'],
  鳥取県: ['倉吉市', '境港市', '岩美町', '若桜町', '智頭町', '八頭町', '三朝町', '琴浦町', '北栄町', '大山町'],
  島根県: ['浜田市', '益田市', '大田市', '安来市', '江津市', '雲南市', '奥出雲町', '飯南町', '川本町', '隠岐の島町'],
  岡山県: ['津山市', '玉野市', '笠岡市', '井原市', '総社市', '高梁市', '新見市', '備前市', '瀬戸内市', '赤磐市', '真庭市', '美作市'],
  広島県: ['呉市', '竹原市', '三原市', '尾道市', '三次市', '庄原市', '大竹市', '東広島市', '廿日市市', '安芸高田市', '江田島市'],
  山口県: ['宇部市', '萩市', '防府市', '下松市', '岩国市', '光市', '長門市', '柳井市', '美祢市', '周南市', '山陽小野田市', '周防大島町'],
  徳島県: ['小松島市', '阿南市', '吉野川市', '阿波市', '美馬市', '三好市', '石井町', '藍住町', '松茂町', '北島町', '海陽町'],
  香川県: ['坂出市', '善通寺市', '観音寺市', 'さぬき市', '東かがわ市', '三豊市', '土庄町', '小豆島町', '宇多津町', '琴平町', '多度津町'],
  愛媛県: ['宇和島市', '八幡浜市', '新居浜市', '西条市', '大洲市', '伊予市', '四国中央市', '西予市', '東温市', '松前町', '砥部町', '内子町'],
  高知県: ['室戸市', '安芸市', '南国市', '土佐市', '須崎市', '宿毛市', '土佐清水市', '四万十市', '香南市', '香美市', 'いの町', '佐川町'],
  福岡県: ['大牟田市', '直方市', '飯塚市', '柳川市', '八女市', '筑後市', '大川市', '行橋市', '豊前市', '中間市', '小郡市', '筑紫野市', '春日市', '宗像市', '太宰府市', '糸島市'],
  佐賀県: ['鳥栖市', '多久市', '伊万里市', '武雄市', '鹿島市', '小城市', '嬉野市', '神埼市', '吉野ヶ里町', '有田町', '白石町'],
  長崎県: ['島原市', '諫早市', '大村市', '平戸市', '松浦市', '対馬市', '壱岐市', '五島市', '西海市', '雲仙市', '南島原市', '波佐見町'],
  熊本県: ['人吉市', '荒尾市', '水俣市', '玉名市', '山鹿市', '菊池市', '宇土市', '上天草市', '宇城市', '阿蘇市', '天草市', '合志市', '菊陽町'],
  大分県: ['中津市', '日田市', '佐伯市', '臼杵市', '津久見市', '竹田市', '豊後高田市', '杵築市', '宇佐市', '豊後大野市', '由布市', '国東市'],
  宮崎県: ['延岡市', '日南市', '小林市', '日向市', '串間市', '西都市', 'えびの市', '三股町', '高鍋町', '新富町', '高千穂町'],
  鹿児島県: ['鹿屋市', '枕崎市', '阿久根市', '出水市', '指宿市', '西之表市', '垂水市', '薩摩川内市', '日置市', '曽於市', 'いちき串木野市', '南さつま市', '奄美市'],
  沖縄県: ['宜野湾市', '名護市', '糸満市', '豊見城市', 'うるま市', '宮古島市', '石垣市', '南城市', '北谷町', '読谷村', '恩納村', '本部町', '与那原町'],
};

const OSAKA_CITY_WARDS = [
  '北区',
  '都島区',
  '福島区',
  '此花区',
  '中央区',
  '西区',
  '港区',
  '大正区',
  '天王寺区',
  '浪速区',
  '西淀川区',
  '淀川区',
  '東淀川区',
  '東成区',
  '生野区',
  '旭区',
  '城東区',
  '阿倍野区',
  '住吉区',
  '東住吉区',
  '西成区',
  '住之江区',
  '平野区',
  '鶴見区',
];

const OSAKA_CITY_WARD_SET = new Set(OSAKA_CITY_WARDS);

const OSAKA_WARD_CENTER_PRESETS: AreaPreset[] = [
  { label: '北区', value: '大阪市北区', searchValue: '大阪府 大阪市 北区', group: '大阪府 / 大阪市北区', latitude: 34.7055, longitude: 135.5101 },
  { label: '都島区', value: '大阪市都島区', searchValue: '大阪府 大阪市 都島区', group: '大阪府 / 大阪市都島区', latitude: 34.7087, longitude: 135.5259 },
  { label: '福島区', value: '大阪市福島区', searchValue: '大阪府 大阪市 福島区', group: '大阪府 / 大阪市福島区', latitude: 34.6923, longitude: 135.4722 },
  { label: '此花区', value: '大阪市此花区', searchValue: '大阪府 大阪市 此花区', group: '大阪府 / 大阪市此花区', latitude: 34.6831, longitude: 135.4524 },
  { label: '中央区', value: '大阪市中央区', searchValue: '大阪府 大阪市 中央区', group: '大阪府 / 大阪市中央区', latitude: 34.6813, longitude: 135.5098 },
  { label: '西区', value: '大阪市西区', searchValue: '大阪府 大阪市 西区', group: '大阪府 / 大阪市西区', latitude: 34.6762, longitude: 135.4863 },
  { label: '港区', value: '大阪市港区', searchValue: '大阪府 大阪市 港区', group: '大阪府 / 大阪市港区', latitude: 34.6639, longitude: 135.4605 },
  { label: '大正区', value: '大阪市大正区', searchValue: '大阪府 大阪市 大正区', group: '大阪府 / 大阪市大正区', latitude: 34.6502, longitude: 135.4726 },
  { label: '天王寺区', value: '大阪市天王寺区', searchValue: '大阪府 大阪市 天王寺区', group: '大阪府 / 大阪市天王寺区', latitude: 34.6578, longitude: 135.5194 },
  { label: '浪速区', value: '大阪市浪速区', searchValue: '大阪府 大阪市 浪速区', group: '大阪府 / 大阪市浪速区', latitude: 34.6592, longitude: 135.4996 },
  { label: '西淀川区', value: '大阪市西淀川区', searchValue: '大阪府 大阪市 西淀川区', group: '大阪府 / 大阪市西淀川区', latitude: 34.7114, longitude: 135.4562 },
  { label: '淀川区', value: '大阪市淀川区', searchValue: '大阪府 大阪市 淀川区', group: '大阪府 / 大阪市淀川区', latitude: 34.7211, longitude: 135.4867 },
  { label: '東淀川区', value: '大阪市東淀川区', searchValue: '大阪府 大阪市 東淀川区', group: '大阪府 / 大阪市東淀川区', latitude: 34.7413, longitude: 135.5292 },
  { label: '東成区', value: '大阪市東成区', searchValue: '大阪府 大阪市 東成区', group: '大阪府 / 大阪市東成区', latitude: 34.6701, longitude: 135.5417 },
  { label: '生野区', value: '大阪市生野区', searchValue: '大阪府 大阪市 生野区', group: '大阪府 / 大阪市生野区', latitude: 34.6537, longitude: 135.5346 },
  { label: '旭区', value: '大阪市旭区', searchValue: '大阪府 大阪市 旭区', group: '大阪府 / 大阪市旭区', latitude: 34.7212, longitude: 135.5444 },
  { label: '城東区', value: '大阪市城東区', searchValue: '大阪府 大阪市 城東区', group: '大阪府 / 大阪市城東区', latitude: 34.7034, longitude: 135.5448 },
  { label: '阿倍野区', value: '大阪市阿倍野区', searchValue: '大阪府 大阪市 阿倍野区', group: '大阪府 / 大阪市阿倍野区', latitude: 34.6387, longitude: 135.5186 },
  { label: '住吉区', value: '大阪市住吉区', searchValue: '大阪府 大阪市 住吉区', group: '大阪府 / 大阪市住吉区', latitude: 34.6037, longitude: 135.5005 },
  { label: '東住吉区', value: '大阪市東住吉区', searchValue: '大阪府 大阪市 東住吉区', group: '大阪府 / 大阪市東住吉区', latitude: 34.6217, longitude: 135.5262 },
  { label: '西成区', value: '大阪市西成区', searchValue: '大阪府 大阪市 西成区', group: '大阪府 / 大阪市西成区', latitude: 34.6422, longitude: 135.4943 },
  { label: '住之江区', value: '大阪市住之江区', searchValue: '大阪府 大阪市 住之江区', group: '大阪府 / 大阪市住之江区', latitude: 34.6094, longitude: 135.4828 },
  { label: '平野区', value: '大阪市平野区', searchValue: '大阪府 大阪市 平野区', group: '大阪府 / 大阪市平野区', latitude: 34.6213, longitude: 135.5461 },
  { label: '鶴見区', value: '大阪市鶴見区', searchValue: '大阪府 大阪市 鶴見区', group: '大阪府 / 大阪市鶴見区', latitude: 34.7048, longitude: 135.5742 },
];

const OSAKA_WARD_REPRESENTATIVE_ORIGIN_PRESETS: Record<string, AreaPreset> = {
  北区: { label: '梅田', group: '大阪府 / 大阪市北区', latitude: 34.7025, longitude: 135.4959 },
  都島区: { label: '都島', group: '大阪府 / 大阪市都島区', latitude: 34.7081, longitude: 135.5255 },
  福島区: { label: '福島', group: '大阪府 / 大阪市福島区', latitude: 34.6971, longitude: 135.4862 },
  此花区: { label: '西九条', group: '大阪府 / 大阪市此花区', latitude: 34.6825, longitude: 135.4669 },
  中央区: { label: '本町', group: '大阪府 / 大阪市中央区', latitude: 34.6813, longitude: 135.5008 },
  西区: { label: '阿波座', group: '大阪府 / 大阪市西区', latitude: 34.6828, longitude: 135.4864 },
  港区: { label: '弁天町', group: '大阪府 / 大阪市港区', latitude: 34.6692, longitude: 135.4624 },
  大正区: { label: '大正', group: '大阪府 / 大阪市大正区', latitude: 34.6654, longitude: 135.4798 },
  天王寺区: { label: '天王寺', group: '大阪府 / 大阪市天王寺区', latitude: 34.6501, longitude: 135.5138 },
  浪速区: { label: '難波', group: '大阪府 / 大阪市浪速区', latitude: 34.6658, longitude: 135.5011 },
  西淀川区: { label: '御幣島', group: '大阪府 / 大阪市西淀川区', latitude: 34.7117, longitude: 135.4556 },
  淀川区: { label: '十三', group: '大阪府 / 大阪市淀川区', latitude: 34.7209, longitude: 135.4829 },
  東淀川区: { label: '淡路', group: '大阪府 / 大阪市東淀川区', latitude: 34.7386, longitude: 135.5169 },
  東成区: { label: '緑橋', group: '大阪府 / 大阪市東成区', latitude: 34.6812, longitude: 135.5444 },
  生野区: { label: '鶴橋', group: '大阪府 / 大阪市生野区', latitude: 34.6655, longitude: 135.5301 },
  旭区: { label: '千林大宮', group: '大阪府 / 大阪市旭区', latitude: 34.7244, longitude: 135.5442 },
  城東区: { label: '蒲生四丁目', group: '大阪府 / 大阪市城東区', latitude: 34.7017, longitude: 135.5478 },
  阿倍野区: { label: '阿倍野', group: '大阪府 / 大阪市阿倍野区', latitude: 34.6462, longitude: 135.5133 },
  住吉区: { label: '長居', group: '大阪府 / 大阪市住吉区', latitude: 34.6108, longitude: 135.5133 },
  東住吉区: { label: '駒川中野', group: '大阪府 / 大阪市東住吉区', latitude: 34.6219, longitude: 135.5326 },
  西成区: { label: '天下茶屋', group: '大阪府 / 大阪市西成区', latitude: 34.6372, longitude: 135.4966 },
  住之江区: { label: '住之江公園', group: '大阪府 / 大阪市住之江区', latitude: 34.6099, longitude: 135.4723 },
  平野区: { label: '平野', group: '大阪府 / 大阪市平野区', latitude: 34.6212, longitude: 135.5499 },
  鶴見区: { label: '横堤', group: '大阪府 / 大阪市鶴見区', latitude: 34.7044, longitude: 135.5744 },
};

const PREFECTURE_POPULAR_AREA_ORDER: Record<string, string[]> = {
  大阪府: [
    '梅田',
    '大阪駅',
    '難波',
    '心斎橋',
    '京橋',
    '天王寺',
    '鶴橋',
    '北新地',
    '天満',
    '福島',
    '中崎町',
    '天神橋筋六丁目',
    '南森町',
    '堀江',
    '新世界',
    '本町',
    '淀屋橋',
    '北浜',
    '日本橋',
    '上本町',
    '阿倍野',
    '新大阪',
    '十三',
    '弁天町',
  ],
};

const SUPPLEMENTAL_AREA_PRESETS: AreaPreset[] = Object.entries(SUPPLEMENTAL_AREA_NAMES).flatMap(([prefecture, labels]) =>
  labels.map((label) => ({
    label,
    group: `${prefecture} / ${label}`,
    latitude: 0,
    longitude: 0,
    useCoordinates: false,
  })),
);

const FOOTER_ITEMS: FooterItem[] = [
  { key: 'home', label: 'ホーム', icon: 'home' },
  { key: 'search', label: '条件', icon: 'search' },
  { key: 'random', label: '抽選', icon: 'restaurant' },
  { key: 'save', label: 'アルバム', icon: 'albums-outline' },
  { key: 'analytics', label: '分析', icon: 'bar-chart-outline' },
];

const GENRES: GenreItem[] = [
  { label: 'すべて', color: '#111111', image: require('../assets/category/world.png') },
  { label: 'ラーメン', color: '#d94b42', image: require('../assets/category/chuka.png') },
  { label: '焼肉', color: '#d84527', image: require('../assets/category/yakiniku.png') },
  { label: '居酒屋', color: '#db8b00', image: require('../assets/category/izakaya.png') },
  { label: '韓国料理', color: '#f37768', image: require('../assets/category/korean.png') },
  { label: 'カレー', color: '#e5a100', image: require('../assets/category/curry.png') },
  { label: 'うどん', color: '#9a6a43', image: require('../assets/category/udon.png') },
  { label: 'そば', color: '#5d7f32', image: require('../assets/category/soba.png') },
  { label: '粉もの', color: '#e17400', image: require('../assets/category/okonomiyaki.png') },
  { label: '焼き鳥', color: '#8d5a35', image: require('../assets/category/yakitori.png') },
  { label: 'ピザ', color: '#df482f', image: require('../assets/category/pizza.png') },
  { label: '定食', color: '#2f70b3', image: require('../assets/category/teishoku.png') },
  { label: '餃子', color: '#5f8f45', image: require('../assets/category/gyoza-new.jpg') },
  { label: '中華', color: '#d94b42', image: require('../assets/category/chuka.png') },
  { label: '寿司', color: '#a06f47', image: require('../assets/category/sushi.png') },
  { label: '海鮮', color: '#3f6bad', image: require('../assets/category/seafood.png') },
  { label: '洋食', color: '#f28c18', image: require('../assets/category/yoshoku.png') },
  { label: 'イタリアン', color: '#6b9144', image: require('../assets/category/italian.png') },
  { label: 'カフェ', color: '#469fa0', image: require('../assets/category/cafe.png') },
  { label: 'スイーツ', color: '#a465a4', image: require('../assets/category/sweets.png') },
  { label: '郷土料理', color: '#de5b3d', image: require('../assets/category/washoku.png') },
  { label: 'その他', color: '#8f7f68', image: require('../assets/category/world.png') },
];

const AI_REPORT_MONTHLY_NOTICE = 'ルーレットで出た結果を月次レポートに直接反映します。ジャンルや金額は手入力せず、今月の履歴から届きます。';
const AI_REPORT_SAMPLE_MEAL_COUNT = 10;
const AI_REPORT_SAMPLE_GENRE_PLANS: AiReportGenrePlan[] = [
  { label: 'ラーメン', count: 2, budget: 1200, budgets: [980, 1380] },
  { label: 'ファストフード', count: 2, budget: 900, budgets: [780, 920] },
  { label: '寿司', count: 1, budget: 3200, budgets: [3200] },
  { label: '焼肉', count: 1, budget: 5200, budgets: [5200] },
  { label: '洋食', count: 1, budget: 1900, budgets: [1900] },
  { label: 'カレー', count: 1, budget: 1300, budgets: [1300] },
  { label: '定食', count: 1, budget: 1100, budgets: [1100] },
  { label: 'カフェ', count: 1, budget: 1450, budgets: [1450] },
];
const YEARLY_WRAPPED_DEMO_PLANS = [
  { genre: 'ラーメン', area: '大阪府', budget: 1180 },
  { genre: '寿司', area: '東京都', budget: 3600 },
  { genre: '焼肉', area: '福岡県', budget: 5200 },
  { genre: 'カフェ', area: '京都府', budget: 1450 },
  { genre: '定食', area: '兵庫県', budget: 1280 },
  { genre: 'イタリアン', area: '神奈川県', budget: 3100 },
  { genre: '中華', area: '愛知県', budget: 1850 },
  { genre: '海鮮', area: '北海道', budget: 4300 },
  { genre: 'カレー', area: '大阪府', budget: 1350 },
  { genre: 'うどん', area: '香川県', budget: 920 },
  { genre: 'そば', area: '長野県', budget: 1600 },
  { genre: '韓国料理', area: '東京都', budget: 2700 },
  { genre: '粉もの', area: '大阪府', budget: 1700 },
  { genre: '焼き鳥', area: '福岡県', budget: 2800 },
  { genre: 'ピザ', area: '神奈川県', budget: 2400 },
  { genre: '洋食', area: '京都府', budget: 2200 },
  { genre: '餃子', area: '栃木県', budget: 1250 },
  { genre: 'スイーツ', area: '兵庫県', budget: 1100 },
  { genre: '居酒屋', area: '広島県', budget: 3800 },
  { genre: '郷土料理', area: '沖縄県', budget: 3300 },
] as const;

const hexToRgba = (hex: string, alpha: number) => {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) {
    return `rgba(0,0,0,${alpha})`;
  }
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red},${green},${blue},${alpha})`;
};

const LEGACY_GENRE_VISUAL_LABELS: Record<string, string> = {
  たこ焼き: '粉もの',
  お好み焼き: '粉もの',
  肉料理: '焼肉',
  串カツ: '焼き鳥',
  和食: '定食',
  ハンバーガー: '洋食',
  ハンバーグ: '洋食',
  サラダ: 'その他',
  'サラダ・野菜': 'その他',
  スープ: 'その他',
  パン: 'その他',
  ファストフード: 'その他',
  'お酒・バー': '居酒屋',
  各国料理: 'その他',
};

const normalizeGenreLabel = (genre?: string | null) => {
  const label = genre?.trim() ?? '';
  return LEGACY_GENRE_VISUAL_LABELS[label] ?? label;
};

const getGenreVisual = (genre?: string | null) =>
  GENRES.find((item) => item.label === normalizeGenreLabel(genre)) ?? GENRES[0];

const getAlbumDiaryImageSource = (item: AlbumDiaryItem): ImageSourcePropType =>
  item.photoSource ?? { uri: item.photoUri };

const createDemoAlbumSlideItems = (): AlbumDiaryItem[] => {
  const now = new Date();
  const demoSlides = [
    { genre: 'ラーメン', title: '締めのラーメン', subtitle: '6月のリピート枠' },
    { genre: '洋食', title: '洋食で気分転換', subtitle: 'いつもと違う選択' },
    { genre: 'ハンバーガー', title: 'バーガーの日', subtitle: '軽めに済ませたい日' },
    { genre: '寿司', title: '週末の寿司', subtitle: '少し特別な一食' },
  ];
  return demoSlides.map((item, index) => {
    const visual = getGenreVisual(item.genre);
    const createdAt = new Date(now.getFullYear(), now.getMonth(), 4 + index * 6, 19, 10).toISOString();
    return {
      id: `demo-album-slide-${item.genre}`,
      photoUri: '',
      photoSource: visual.image,
      createdAt,
      title: item.title,
      subtitle: `${item.genre} / ${item.subtitle}`,
      source: 'album',
    };
  });
};

const isWideGenreLabel = (label: string) => label.length >= 6 || label.includes('・');

const TRAVEL_GENRES = GENRES.filter((item) => item.label !== 'すべて' && item.label !== 'その他').map((item) => item.label);

const pickRandomTravelGenre = (currentGenre: string) => pickRandomDifferent(TRAVEL_GENRES, currentGenre);

const pickRandomDifferent = <T,>(items: T[], current: T) => {
  if (items.length <= 1) {
    return items[0];
  }
  const nextItems = items.filter((item) => item !== current);
  return nextItems[Math.floor(Math.random() * nextItems.length)];
};

const pickRandomBudgetValue = (currentMax: string) => pickRandomDifferent(BUDGET_MAX_OPTIONS, currentMax);

const formatBudgetLimit = (budgetMax: string, uiText = UI_TEXT.ja) => formatLocalizedBudgetLimit(budgetMax, uiText);

const padDatePart = (value: number) => String(value).padStart(2, '0');

const getLocalDayKey = (date: Date) =>
  `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;

const getMinutesOfDay = (date: Date) => date.getHours() * 60 + date.getMinutes();

const getDateAtMinute = (date: Date, minute: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), Math.floor(minute / 60), minute % 60, 0, 0);

const addDays = (date: Date, days: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds());

const getMealTicketDefinitionForDate = (date: Date) => {
  const minutes = getMinutesOfDay(date);
  return MEAL_TICKET_DEFINITIONS.find((ticket) => minutes >= ticket.startMinute && minutes < ticket.endMinute)
    ?? MEAL_TICKET_DEFINITIONS[2];
};

const formatCountdown = (target: Date, now: Date) => {
  const diff = Math.max(0, target.getTime() - now.getTime());
  const totalMinutes = Math.max(1, Math.ceil(diff / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) {
    return `あと${minutes}分`;
  }
  if (minutes === 0) {
    return `あと${hours}時間`;
  }
  return `あと${hours}時間${minutes}分`;
};

const getUpcomingStartDateForTicket = (now: Date, ticket: MealTicketDefinition) => {
  let candidate = getDateAtMinute(now, ticket.startMinute);
  if (candidate.getTime() <= now.getTime()) {
    candidate = addDays(candidate, 1);
  }
  return candidate;
};

const getNextTicketStartDate = (now: Date, isProUser: boolean) => {
  const candidates = MEAL_TICKET_DEFINITIONS
    .filter((ticket) => isProUser || !ticket.proOnly)
    .map((ticket) => getUpcomingStartDateForTicket(now, ticket))
    .sort((a, b) => a.getTime() - b.getTime());
  return candidates[0] ?? addDays(now, 1);
};

const buildMealTicketState = (now: Date, drawHistories: DrawHistoryEntry[], isProUser: boolean, disableLimit = false): MealTicketState => {
  const dayKey = getLocalDayKey(now);
  const minutes = getMinutesOfDay(now);
  const currentDefinition = getMealTicketDefinitionForDate(now);
  const effectiveIsProUser = isProUser || disableLimit;
  const nextUnlockDate = getNextTicketStartDate(now, effectiveIsProUser);
  const nextUnlockLabel = formatCountdown(nextUnlockDate, now);

  const usedKeys = new Set<MealSlotKey>();
  if (!disableLimit) {
    drawHistories.forEach((entry) => {
      const createdAt = new Date(entry.createdAt);
      if (Number.isNaN(createdAt.getTime()) || getLocalDayKey(createdAt) !== dayKey) {
        return;
      }
      usedKeys.add(getMealTicketDefinitionForDate(createdAt).key);
    });
  }

  const tickets = MEAL_TICKET_DEFINITIONS.map((ticket) => {
    const active = currentDefinition.key === ticket.key;
    const used = usedKeys.has(ticket.key);
    const proLocked = Boolean(ticket.proOnly && !effectiveIsProUser);
    const upcomingStart = getUpcomingStartDateForTicket(now, ticket);
    const past = !active && !ticket.proOnly && ticket.endMinute <= minutes;
    const available = active && !used && !proLocked;
    const locked = !available;
    const statusLabel = available
      ? 'いま使える'
      : used
        ? '使用済み'
        : proLocked
          ? 'Pro限定'
          : past
            ? '本日終了'
            : `${ticket.timeLabel.split('-')[0]}から`;
    const countdownLabel = available
      ? 'この一枚で引けます'
      : used && active
        ? `${nextUnlockLabel}で次の一枚`
        : proLocked && active
          ? `${nextUnlockLabel}で朝の一枚`
          : past
            ? 'また明日'
            : formatCountdown(upcomingStart, now);

    return {
      ...ticket,
      active,
      used,
      past,
      available,
      locked,
      statusLabel,
      countdownLabel,
      upcomingStartAt: upcomingStart.toISOString(),
    };
  });

  const current = tickets.find((ticket) => ticket.active) ?? tickets[0];
  const usedFreeCount = tickets.filter((ticket) => !ticket.proOnly && ticket.used).length;

  return {
    tickets,
    current,
    nextUnlockLabel,
    nextUnlockAt: nextUnlockDate.toISOString(),
    usedFreeCount,
    totalFreeCount: FREE_MEAL_TICKET_COUNT,
    isProUser: effectiveIsProUser,
  };
};

const MOCK_RESTAURANTS: Restaurant[] = [
  {
    id: 'mock-ramen',
    externalProvider: 'mock',
    externalId: 'mock-ramen',
    name: '麺や RANDISH',
    area: '梅田',
    genre: 'ラーメン',
    budgetMin: 900,
    budgetMax: 1400,
    rating: 4.5,
    minutes: 8,
    address: '大阪府大阪市北区梅田1-1',
    photoUrl: null,
    note: '香ばしいスープと細麺。迷った日の一杯に。',
    priceRange: '900円〜1,400円',
    latitude: 34.7025,
    longitude: 135.4959,
  },
  {
    id: 'mock-yakiniku',
    externalProvider: 'mock',
    externalId: 'mock-yakiniku',
    name: '炭火焼肉 夕映え',
    area: '難波',
    genre: '焼肉',
    budgetMin: 2500,
    budgetMax: 4500,
    rating: 4.3,
    minutes: 12,
    address: '大阪府大阪市中央区難波2-2',
    photoUrl: null,
    note: '軽く贅沢したい夜にちょうどいい焼肉。',
    priceRange: '2,500円〜4,500円',
    latitude: 34.6658,
    longitude: 135.5011,
  },
  {
    id: 'mock-cafe',
    externalProvider: 'mock',
    externalId: 'mock-cafe',
    name: '白い皿のカフェ',
    area: '天王寺',
    genre: 'カフェ',
    budgetMin: 1000,
    budgetMax: 2200,
    rating: 4.6,
    minutes: 6,
    address: '大阪府大阪市天王寺区茶臼山町1-1',
    photoUrl: null,
    note: '静かに決めたい昼ごはんに。',
    priceRange: '1,000円〜2,200円',
    latitude: 34.6501,
    longitude: 135.5138,
  },
];

const formatPrice = (restaurant: ApiRestaurant, uiText = UI_TEXT.ja) => formatLocalizedPrice(restaurant, uiText);

const toOptionalNumber = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : undefined;
  }
  return undefined;
};

const normalizeRestaurant = (restaurant: ApiRestaurant): Restaurant => {
  const locationSource = restaurant as ApiRestaurant & {
    latitude?: number | string | null;
    longitude?: number | string | null;
    lat?: number | string | null;
    lng?: number | string | null;
  };
  const rating = toOptionalNumber(restaurant.googleRating) ?? toOptionalNumber(restaurant.rating) ?? 0;

  return {
    ...restaurant,
    photoUrl: toAbsoluteApiAssetUrl(restaurant.photoUrl),
    latitude: toOptionalNumber(locationSource.latitude ?? locationSource.lat),
    longitude: toOptionalNumber(locationSource.longitude ?? locationSource.lng),
    rating,
    priceRange: formatPrice(restaurant),
  };
};

const getEstimatedBudget = (restaurant: Restaurant) => {
  const min = toOptionalNumber(restaurant.budgetMin);
  const max = toOptionalNumber(restaurant.budgetMax);
  if (min == null && max == null) {
    return null;
  }
  if ((max ?? 0) >= 100000) {
    return null;
  }
  const safeMin = min ?? max ?? 0;
  const safeMax = Math.max(max ?? safeMin, safeMin);
  return Math.round((safeMin + safeMax) / 2);
};

const formatYen = (value: number) => `${Math.round(value).toLocaleString()}円`;

const getAiReportPlanTotal = (plans: AiReportGenrePlan[]) =>
  plans.reduce((total, plan) => total + Math.max(0, plan.count), 0);

const normalizeAiReportBudget = (value: number, fallback = 1500) => {
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.min(50000, Math.max(500, Math.round(value)));
};

const getAiReportPlanBudgets = (plan: AiReportGenrePlan) => {
  const count = Math.max(0, Math.round(plan.count));
  const fallbackBudget = normalizeAiReportBudget(plan.budget);
  return Array.from({ length: count }, (_, index) =>
    normalizeAiReportBudget(plan.budgets?.[index] ?? fallbackBudget, fallbackBudget));
};

const normalizeAiReportPlans = (plans: AiReportGenrePlan[]) =>
  plans
    .map((plan) => {
      const count = Math.max(0, Math.round(plan.count));
      const fallbackBudget = normalizeAiReportBudget(plan.budget);
      const budgets = Array.from({ length: count }, (_, index) =>
        normalizeAiReportBudget(plan.budgets?.[index] ?? fallbackBudget, fallbackBudget));
      return {
        ...plan,
        count,
        budget: budgets[budgets.length - 1] ?? fallbackBudget,
        budgets,
      };
    })
    .filter((plan) => plan.count > 0);

const trimAiReportPlansToMealCount = (plans: AiReportGenrePlan[], mealCount: number) => {
  const nextPlans = plans.map((plan) => ({ ...plan }));
  let total = getAiReportPlanTotal(nextPlans);
  for (let index = nextPlans.length - 1; index >= 0 && total > mealCount; index -= 1) {
    const removable = Math.min(nextPlans[index].count, total - mealCount);
    nextPlans[index].count -= removable;
    total -= removable;
  }
  return normalizeAiReportPlans(nextPlans);
};

const parseDistanceMeters = (value?: string | null) => {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (normalized.endsWith('km')) {
    const km = Number(normalized.replace('km', ''));
    return Number.isFinite(km) && km > 0 ? Math.round(km * 1000) : null;
  }
  if (normalized.endsWith('m')) {
    const meters = Number(normalized.replace('m', ''));
    return Number.isFinite(meters) && meters > 0 ? Math.round(meters) : null;
  }
  return null;
};

const formatDistanceMeters = (meters?: number | null) => {
  if (meters == null || !Number.isFinite(meters) || meters <= 0) {
    return '距離おまかせ';
  }
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  const kilometers = meters / 1000;
  return Number.isInteger(kilometers) ? `${kilometers}km` : `${kilometers.toFixed(1)}km`;
};

const getSafePlacesCacheTtlMs = () => {
  const ttlSeconds = Number.isFinite(PLACES_CACHE_TTL_SECONDS) && PLACES_CACHE_TTL_SECONDS > 0
    ? PLACES_CACHE_TTL_SECONDS
    : 600;
  return ttlSeconds * 1000;
};

const getSafePlacesCacheDistanceMeters = () =>
  Number.isFinite(PLACES_CACHE_DISTANCE_METERS) && PLACES_CACHE_DISTANCE_METERS > 0
    ? PLACES_CACHE_DISTANCE_METERS
    : 300;

const distanceBetweenLocationsMeters = (from: UserLocation, to: UserLocation) => {
  const km = getDistanceKm(from, {
    id: 'distance-target',
    externalProvider: 'LOCAL',
    externalId: 'distance-target',
    name: 'distance target',
    area: to.label,
    genre: '',
    budgetMin: 0,
    budgetMax: 0,
    rating: 0,
    minutes: 0,
    address: to.label,
    photoUrl: null,
    note: '',
    latitude: to.latitude,
    longitude: to.longitude,
  });
  return km == null ? Number.POSITIVE_INFINITY : Math.round(km * 1000);
};

const formatCandidatePriceRange = (priceLevel?: number | null) => {
  switch (priceLevel) {
    case 0:
      return '価格情報なし';
    case 1:
      return 'お手頃';
    case 2:
      return '標準';
    case 3:
      return '少し高め';
    case 4:
      return '高め';
    default:
      return '価格確認中';
  }
};

const estimateBudgetFromPriceLevel = (priceLevel?: number | null) => {
  switch (priceLevel) {
    case 1:
      return { min: 0, max: 1500 };
    case 2:
      return { min: 1200, max: 3500 };
    case 3:
      return { min: 3000, max: 8000 };
    case 4:
      return { min: 8000, max: 20000 };
    default:
      return { min: 0, max: 999999 };
  }
};

const candidatePlaceToRestaurant = (place: CandidatePlace, area: string, genre: string): Restaurant => {
  const displayGenre = place.categories?.find((category) => category && !category.includes('_')) ?? genre ?? '飲食店';
  const budget = estimateBudgetFromPriceLevel(place.priceLevel);
  return {
    id: `google-places-${place.id.replace(/[^A-Za-z0-9_-]/g, '_')}`,
    externalProvider: 'GOOGLE_PLACES',
    externalId: place.id,
    name: place.name,
    area: area === '現在地' ? '現在地周辺' : area,
    genre: displayGenre,
    budgetMin: budget.min,
    budgetMax: budget.max,
    rating: place.rating ?? 0,
    minutes: place.distanceMeters ? Math.max(1, Math.round((place.distanceMeters / 1000) * 12.5)) : 0,
    address: place.address ?? 'Google Mapsで住所を確認してください',
    photoUrl: null,
    note: 'Google Placesの近隣候補から選ばれました。',
    priceRange: formatCandidatePriceRange(place.priceLevel),
    latitude: place.latitude,
    longitude: place.longitude,
    googleRating: place.rating ?? null,
    googleMapsUri: place.googleMapsUri ?? null,
    openNow: place.openNow ?? null,
    googlePlaceId: place.id,
  };
};

const pickCandidateFromPool = (candidates: CandidatePlace[], usedIds: string[], lastSelectedId: string | null) => {
  if (candidates.length === 0) {
    return { selected: null, nextUsedIds: usedIds };
  }

  const used = new Set(usedIds);
  let pool = candidates.filter((candidate) => !used.has(candidate.id));
  if (pool.length === 0) {
    used.clear();
    pool = candidates;
  }
  if (pool.length > 1 && lastSelectedId) {
    const different = pool.filter((candidate) => candidate.id !== lastSelectedId);
    if (different.length) {
      pool = different;
    }
  }
  const selected = pool[Math.floor(Math.random() * pool.length)] ?? candidates[0];
  return {
    selected,
    nextUsedIds: [...used, selected.id],
  };
};

const toDrawHistoryEntry = (history: ApiRandomHistory): DrawHistoryEntry => ({
  id: history.id,
  provider: history.provider,
  providerPlaceId: history.providerPlaceId,
  restaurantId: history.restaurantId,
  restaurant: history.restaurant ? normalizeRestaurant(history.restaurant) : null,
  area: history.area,
  genre: history.genre,
  budgetMin: history.budgetMin,
  budgetMax: history.budgetMax,
  rangeMeters: history.rangeMeters,
  createdAt: history.createdAt,
});

const cleanTextOrNull = (value?: string | null) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const parseBudgetNumber = (value: string) => {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) && numeric > 0 && numeric < 100000 ? numeric : null;
};

const getProviderLabel = (provider: string) => {
  const normalized = provider.toUpperCase();
  if (normalized === 'GOOGLE_PLACES') {
    return 'Google Maps';
  }
  if (normalized === 'GEOAPIFY') {
    return 'Geoapify';
  }
  if (normalized === 'HOTPEPPER') {
    return 'Hot Pepper';
  }
  return 'RANDISH';
};

const getProviderPlaceId = (restaurant: Restaurant) =>
  restaurant.externalId || restaurant.googlePlaceId || restaurant.id;

const shouldPersistRestaurantId = (restaurant: Restaurant) =>
  (restaurant.externalProvider || '').toUpperCase() === 'RANDISH_SEED';

const toSavedRestaurantFromApi = (favorite: ApiFavorite): SavedRestaurant => ({
  id: favorite.id,
  userId: favorite.userId,
  provider: favorite.provider,
  providerPlaceId: favorite.providerPlaceId,
  restaurantId: favorite.restaurantId,
  savedArea: favorite.savedArea,
  savedGenre: favorite.savedGenre,
  savedBudgetMin: favorite.savedBudgetMin,
  savedBudgetMax: favorite.savedBudgetMax,
  savedRangeMeters: favorite.savedRangeMeters,
  userMemo: favorite.userMemo,
  userTags: favorite.userTags,
  createdAt: favorite.createdAt,
  photoUri: null,
  photoTakenAt: null,
  snapshot: favorite.restaurant ? normalizeRestaurant(favorite.restaurant) : null,
});

const toSavedRestaurantFromSelection = ({
  restaurant,
  userId,
  area,
  genre,
  budgetMin,
  budgetMax,
  distance,
}: {
  restaurant: Restaurant;
  userId: string;
  area: string;
  genre: string;
  budgetMin: string;
  budgetMax: string;
  distance: string;
}): SavedRestaurant => {
  const provider = (restaurant.externalProvider || 'RANDISH_SEED').toUpperCase();
  const createdAt = new Date().toISOString();
  return {
    id: `local-${provider}-${getProviderPlaceId(restaurant)}-${createdAt}`,
    userId,
    provider,
    providerPlaceId: getProviderPlaceId(restaurant),
    restaurantId: shouldPersistRestaurantId(restaurant) ? restaurant.id : null,
    savedArea: cleanTextOrNull(area === '現在地' ? '現在地周辺' : area),
    savedGenre: cleanTextOrNull(genre === 'すべて' ? null : genre),
    savedBudgetMin: parseBudgetNumber(budgetMin),
    savedBudgetMax: parseBudgetNumber(budgetMax),
    savedRangeMeters: parseDistanceMeters(distance),
    userMemo: null,
    userTags: null,
    createdAt,
    photoUri: null,
    photoTakenAt: null,
    snapshot: restaurant,
  };
};

const isSameSavedRestaurant = (first: SavedRestaurant, second: SavedRestaurant) =>
  first.provider === second.provider && first.providerPlaceId === second.providerPlaceId;

const formatSavedBudgetLabel = (favorite: SavedRestaurant) => {
  if (favorite.savedBudgetMin != null && favorite.savedBudgetMax != null) {
    return `${formatYen(favorite.savedBudgetMin)}〜${formatYen(favorite.savedBudgetMax)}`;
  }
  if (favorite.savedBudgetMax != null) {
    return `〜${formatYen(favorite.savedBudgetMax)}`;
  }
  if (favorite.savedBudgetMin != null) {
    return `${formatYen(favorite.savedBudgetMin)}〜`;
  }
  return '予算おまかせ';
};

const buildSavedMetaLine = (favorite: SavedRestaurant) => [
  favorite.savedGenre ?? 'ジャンルおまかせ',
  favorite.savedArea ?? 'エリアおまかせ',
  formatSavedBudgetLabel(favorite),
  formatDistanceMeters(favorite.savedRangeMeters),
].join(' / ');

const formatHistoryBudgetLabel = (entry: DrawHistoryEntry) => {
  if (entry.budgetMin != null && entry.budgetMax != null) {
    return `${formatYen(entry.budgetMin)}〜${formatYen(entry.budgetMax)}`;
  }
  if (entry.budgetMax != null) {
    return `〜${formatYen(entry.budgetMax)}`;
  }
  if (entry.budgetMin != null) {
    return `${formatYen(entry.budgetMin)}〜`;
  }
  return '予算おまかせ';
};

const buildHistoryMetaLine = (entry: DrawHistoryEntry) => [
  entry.genre ?? 'ジャンルおまかせ',
  entry.area ?? 'エリアおまかせ',
  formatHistoryBudgetLabel(entry),
  formatDistanceMeters(entry.rangeMeters),
].join(' / ');

const API_CONNECTION_MESSAGE = 'お店データに接続できませんでした。サーバーを確認して、もう一度試してください。';
const API_DRAW_MESSAGE = '抽選データに接続できませんでした。少し時間をおいてもう一度押してください。';

const toDebugErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === 'string' ? error : 'unknown error';
};

const toAuthErrorMessage = (error: unknown, fallback: string) => {
  const rawMessage = error instanceof Error ? error.message : fallback;
  const message = rawMessage.replace(/\s*\(https?:\/\/[^)]+\)\s*$/i, '').trim();
  if (isApiConnectivityError(error) || /API timeout|API connection failed/i.test(message)) {
    return 'APIに接続できませんでした。サーバーを再起動して、スマホとPCが同じWi-Fiにつながっているか確認してください。';
  }
  if (!message) {
    return fallback;
  }
  if (/Email is already registered/i.test(message)) {
    return 'このアカウントはすでに登録されています。同じ方法でログインしてください。';
  }
  if (/Email or password is incorrect|Invalid login credentials/i.test(message)) {
    return 'ログイン情報を確認してください。';
  }
  if (/email format is invalid|email address.*invalid|invalid email/i.test(message)) {
    return 'アカウント情報を確認してください。';
  }
  if (/Supabase signup failed/i.test(message) && /email/i.test(message)) {
    return 'アカウント作成に失敗しました。認証設定を確認してください。';
  }
  if (/Resend email verification is not configured/i.test(message)) {
    return 'メール認証は現在使っていません。Googleかゲストで続けてください。';
  }
  if (/Resend email send failed/i.test(message) && /own email address|testing emails|verify a domain|domain/i.test(message)) {
    return 'メール認証は送信設定で止まりました。Googleかゲストで続けてください。';
  }
  if (/Resend email send failed/i.test(message) && /API key|authentication|unauthorized|forbidden/i.test(message)) {
    return 'メール認証の設定が未反映です。Googleかゲストで続けてください。';
  }
  if (/Resend email send failed/i.test(message) && /from|sender/i.test(message)) {
    return 'メール認証の送信元設定が未反映です。Googleかゲストで続けてください。';
  }
  if (/Resend email send failed/i.test(message)) {
    return 'メール認証は現在使えません。Googleかゲストで続けてください。';
  }
  if (/verification token is invalid or expired/i.test(message)) {
    return '認証URLが無効か期限切れです。もう一度ログインしてください。';
  }
  if (/password must be at least 8 characters/i.test(message)) {
    return '古いサーバーが動いています。Spring Bootを止めてから再起動してください。';
  }
  if (/Supabase Auth is not configured/i.test(message)) {
    return '認証サーバーの設定が未反映です。Spring BootとSupabaseのOAuth設定を確認してください。';
  }
  if (/Please use the social login used for this account/i.test(message)) {
    return 'このアカウントはGoogle / Appleログインで作られています。同じ方法でログインしてください。';
  }
  return message;
};

const logApiUiError = (context: string, error: unknown, baseUrls: readonly string[]) => {
  console.warn(`[RANDISH] ${context}`, {
    baseUrls,
    message: toDebugErrorMessage(error),
  });
};

const isNoRestaurantMatchError = (error: unknown) =>
  error instanceof RandishApiError && error.kind === 'http' && error.status === 404;

const isSameMonth = (dateText: string, monthDate: Date) => {
  const date = new Date(dateText);
  return !Number.isNaN(date.getTime())
    && date.getFullYear() === monthDate.getFullYear()
    && date.getMonth() === monthDate.getMonth();
};

const isSameYear = (dateText: string, yearDate: Date) => {
  const date = new Date(dateText);
  return !Number.isNaN(date.getTime())
    && date.getFullYear() === yearDate.getFullYear();
};

const formatShortDate = (dateText: string) => {
  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return `${date.getMonth() + 1}/${date.getDate()}`;
};

const formatShortDateTime = (dateText: string) => {
  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${date.getMonth() + 1}/${date.getDate()} ${hours}:${minutes}`;
};

const getAlbumMonthKey = (dateText: string) => {
  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) {
    return 'unknown';
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const formatAlbumMonthLabel = (monthKey: string) => {
  const [year, month] = monthKey.split('-');
  if (!year || !month || monthKey === 'all') {
    return 'すべて';
  }
  return `${year}年${Number(month)}月`;
};

const getAlbumDiaryGenreLabel = (item?: AlbumDiaryItem | null) => {
  const subtitleGenre = item?.subtitle?.split('/')?.[0]?.trim();
  return normalizeGenreLabel(subtitleGenre || item?.title || 'ごはん');
};

const getAlbumSlideshowMoodLine = (item: AlbumDiaryItem, index: number, total: number) => {
  const genre = getAlbumDiaryGenreLabel(item);
  const moodByGenre: Record<string, string> = {
    ラーメン: '湯気まで思い出す、今月の主役級の一杯。',
    カフェ: '少し立ち止まった日の、ゆっくりしたごほうび。',
    焼肉: '元気を足したい日に選んだ、満足度の高い一食。',
    寿司: 'いつもの月に、少し特別感を足してくれた一皿。',
    洋食: '気分を変えたい日にちょうどよかった、外食のアクセント。',
    カレー: '迷った日でも背中を押してくれる、安心の一皿。',
    ハンバーガー: '軽く済ませたい日にも記憶に残る、楽しい選択。',
  };
  return moodByGenre[genre] ?? `${index + 1}/${total}枚目。${genre}の日を、もう一度見返せます。`;
};

const getFreeAlbumCutoffDate = (baseDate = new Date()) =>
  new Date(baseDate.getFullYear(), baseDate.getMonth() - 2, 1);

const isInFreeAlbumWindow = (dateText: string, baseDate = new Date()) => {
  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) {
    return false;
  }
  return date >= getFreeAlbumCutoffDate(baseDate);
};

const getMonthStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);

const getYearStart = (date: Date) => new Date(date.getFullYear(), 0, 1);

const addMonthsToStart = (date: Date, monthOffset: number) =>
  new Date(date.getFullYear(), date.getMonth() + monthOffset, 1);

const getAnalyticsMonthLabel = (date: Date) => `${date.getMonth() + 1}月`;

const getPriceRangeBucketLabel = (estimatedBudget: number | null) => {
  if (estimatedBudget == null) {
    return '推定不可';
  }
  if (estimatedBudget <= 1000) {
    return '1,000円以下';
  }
  if (estimatedBudget <= 2000) {
    return '1,001〜2,000円';
  }
  if (estimatedBudget <= 4000) {
    return '2,001〜4,000円';
  }
  return '4,001円以上';
};

const getHistoryGenreLabel = (entry: DrawHistoryEntry) =>
  entry.genre?.trim() || entry.restaurant?.genre?.trim() || 'ジャンル未分類';

const getHistoryEstimatedBudget = (entry: DrawHistoryEntry) => {
  if (entry.budgetMin != null || entry.budgetMax != null) {
    const min = entry.budgetMin ?? entry.budgetMax ?? 0;
    const max = entry.budgetMax ?? entry.budgetMin ?? min;
    return Math.round((min + max) / 2);
  }
  return entry.restaurant ? getEstimatedBudget(entry.restaurant) : null;
};

const getGenreAnalytics = (entries: DrawHistoryEntry[]): AnalyticsTrendItem[] => {
  const counts = new Map<string, AnalyticsTrendItem>();
  entries.forEach((entry) => {
    const label = getHistoryGenreLabel(entry);
    const estimatedBudget = getHistoryEstimatedBudget(entry);
    const current = counts.get(label) ?? { label, count: 0, estimatedSpend: 0 };
    counts.set(label, {
      ...current,
      count: current.count + 1,
      estimatedSpend: current.estimatedSpend + (estimatedBudget ?? 0),
    });
  });
  return [...counts.values()].sort((a, b) => b.count - a.count || b.estimatedSpend - a.estimatedSpend);
};

const getPriceRangeAnalytics = (entries: DrawHistoryEntry[]): AnalyticsTrendItem[] => {
  const counts = new Map<string, AnalyticsTrendItem>();
  entries.forEach((entry) => {
    const estimatedBudget = getHistoryEstimatedBudget(entry);
    const label = getPriceRangeBucketLabel(estimatedBudget);
    const current = counts.get(label) ?? { label, count: 0, estimatedSpend: 0 };
    counts.set(label, {
      ...current,
      count: current.count + 1,
      estimatedSpend: current.estimatedSpend + (estimatedBudget ?? 0),
    });
  });
  return [...counts.values()].sort((a, b) => b.count - a.count || b.estimatedSpend - a.estimatedSpend);
};

const getAreaAnalytics = (entries: DrawHistoryEntry[]): AnalyticsTrendItem[] => {
  const counts = new Map<string, AnalyticsTrendItem>();
  entries.forEach((entry) => {
    const label = entry.area?.trim() || entry.restaurant?.area?.trim() || 'エリア未設定';
    const estimatedBudget = getHistoryEstimatedBudget(entry);
    const current = counts.get(label) ?? { label, count: 0, estimatedSpend: 0 };
    counts.set(label, {
      ...current,
      count: current.count + 1,
      estimatedSpend: current.estimatedSpend + (estimatedBudget ?? 0),
    });
  });
  return [...counts.values()].sort((a, b) => b.count - a.count || b.estimatedSpend - a.estimatedSpend);
};

const getMonthlyAnalytics = (entries: DrawHistoryEntry[], monthDate: Date): MonthlyAnalytics => {
  const monthStart = getMonthStart(monthDate);
  const monthEntries = entries
    .filter((entry) => isSameMonth(entry.createdAt, monthStart))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const budgetValues = monthEntries
    .map(getHistoryEstimatedBudget)
    .filter((value): value is number => value != null);
  const estimatedSpend = budgetValues.reduce((total, value) => total + value, 0);
  const buckets = [0, 0, 0, 0, 0];

  monthEntries.forEach((entry) => {
    const date = new Date(entry.createdAt);
    const budget = getHistoryEstimatedBudget(entry);
    if (Number.isNaN(date.getTime()) || budget == null) {
      return;
    }
    const weekIndex = Math.min(4, Math.floor((date.getDate() - 1) / 7));
    buckets[weekIndex] += budget;
  });

  const max = Math.max(...buckets, 1);
  const genreAnalytics = getGenreAnalytics(monthEntries);
  const areaAnalytics = getAreaAnalytics(monthEntries);

  return {
    monthDate: monthStart,
    monthLabel: getAnalyticsMonthLabel(monthStart),
    draws: monthEntries,
    drawCount: monthEntries.length,
    estimatedSpend,
    budgetSampleCount: budgetValues.length,
    averageBudget: budgetValues.length ? Math.round(estimatedSpend / budgetValues.length) : 0,
    weekSpends: buckets.map((amount, index) => ({
      label: `${index + 1}週`,
      amount,
      percent: amount > 0 ? Math.max(18, Math.round((amount / max) * 100)) : 0,
    })),
    recentDraws: monthEntries.slice(0, 3),
    genreAnalytics,
    areaAnalytics,
    priceRangeAnalytics: getPriceRangeAnalytics(monthEntries),
    topGenre: genreAnalytics[0]?.label ?? 'まだなし',
    topArea: areaAnalytics[0]?.label ?? 'まだなし',
  };
};

const getCurrentMonthAnalytics = (entries: DrawHistoryEntry[], now = new Date()) =>
  getMonthlyAnalytics(entries, now);

const buildDemoYearlyWrappedEntries = (now = new Date()): DrawHistoryEntry[] => {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 19, 0, 0, 0);
  const yearEnd = new Date(now.getFullYear(), 11, 31, 20, 30, 0, 0);
  const totalDays = Math.max(0, Math.round((yearEnd.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
  const entryCount = Math.max(12, Math.min(54, Math.round(totalDays / 4)));
  const spacing = entryCount > 1 ? totalDays / (entryCount - 1) : 0;

  return Array.from({ length: entryCount }, (_, index) => {
    const plan = YEARLY_WRAPPED_DEMO_PLANS[index % YEARLY_WRAPPED_DEMO_PLANS.length];
    const date = addDays(start, Math.round(index * spacing));
    date.setHours([12, 18, 19, 20][index % 4], [10, 25, 40, 5][index % 4], 0, 0);
    const monthlyLift = date.getMonth() === 11 ? 1.14 : date.getMonth() === 7 ? 1.08 : 1;
    const swing = ((index % 5) - 2) * 120;
    const budget = Math.max(700, Math.round((plan.budget * monthlyLift + swing) / 10) * 10);
    const margin = budget >= 4000 ? 700 : budget >= 2500 ? 450 : budget >= 1500 ? 260 : 160;
    const budgetMin = Math.max(500, Math.round((budget - margin) / 10) * 10);
    const budgetMax = Math.round((budget + margin) / 10) * 10;

    return {
      id: `yearly-demo-${now.getFullYear()}-${index}`,
      provider: 'RANDISH_DEMO',
      providerPlaceId: `yearly-demo-${index}`,
      restaurantId: null,
      restaurant: null,
      area: plan.area,
      genre: plan.genre,
      budgetMin,
      budgetMax,
      rangeMeters: null,
      createdAt: date.toISOString(),
    };
  });
};

const getYearlyAnalytics = (entries: DrawHistoryEntry[], yearDate = new Date()): YearlyAnalytics => {
  const yearStart = getYearStart(yearDate);
  const yearEntries = entries
    .filter((entry) => isSameYear(entry.createdAt, yearStart))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const budgetValues = yearEntries
    .map(getHistoryEstimatedBudget)
    .filter((value): value is number => value != null);
  const monthlyAnalytics = Array.from({ length: 12 }, (_, monthIndex) =>
    getMonthlyAnalytics(yearEntries, new Date(yearStart.getFullYear(), monthIndex, 1)));
  const activeMonths = monthlyAnalytics.filter((item) => item.drawCount > 0);
  const topMonth = activeMonths
    .slice()
    .sort((a, b) => b.drawCount - a.drawCount || b.estimatedSpend - a.estimatedSpend)[0] ?? null;
  const genreAnalytics = getGenreAnalytics(yearEntries);
  const areaAnalytics = getAreaAnalytics(yearEntries);

  return {
    year: yearStart.getFullYear(),
    yearLabel: `${yearStart.getFullYear()}年`,
    entries: yearEntries,
    drawCount: yearEntries.length,
    estimatedSpend: budgetValues.reduce((total, value) => total + value, 0),
    budgetSampleCount: budgetValues.length,
    averageBudget: budgetValues.length ? Math.round(budgetValues.reduce((total, value) => total + value, 0) / budgetValues.length) : 0,
    genreAnalytics,
    areaAnalytics,
    priceRangeAnalytics: getPriceRangeAnalytics(yearEntries),
    monthlyAnalytics,
    topGenre: genreAnalytics[0]?.label ?? 'まだなし',
    topArea: areaAnalytics[0]?.label ?? 'まだなし',
    topMonth,
    activeMonthCount: activeMonths.length,
  };
};

const buildYearlyWrappedReport = (analytics: YearlyAnalytics): YearlyWrappedReport => {
  const topGenreItem = analytics.genreAnalytics[0] ?? null;
  const topAreaItem = analytics.areaAnalytics[0] ?? null;
  const secondGenre = analytics.genreAnalytics[1]?.label ?? null;
  const topGenre = analytics.topGenre === 'まだなし' ? 'これから見つかる食の軸' : analytics.topGenre;
  const totalSpendLabel = analytics.budgetSampleCount ? `約${formatYen(analytics.estimatedSpend)}` : '未計測';
  const averageLabel = analytics.budgetSampleCount ? `約${formatYen(analytics.averageBudget)}` : '未計測';
  const topMonthLabel = analytics.topMonth ? `${analytics.topMonth.monthLabel} / ${analytics.topMonth.drawCount}回` : 'まだなし';
  const topAreaLabel = topAreaItem ? `${topAreaItem.label} ${topAreaItem.count}回` : 'まだなし';
  const genreCount = analytics.genreAnalytics.filter((item) => item.count > 0).length;
  const areaCount = analytics.areaAnalytics.filter((item) => item.count > 0).length;
  const topShare = analytics.drawCount && topGenreItem
    ? Math.round((topGenreItem.count / analytics.drawCount) * 100)
    : 0;
  const explorationLabel = genreCount >= 8
    ? 'かなり冒険した一年'
    : genreCount >= 5
      ? 'ほどよく広げた一年'
      : genreCount >= 2
        ? '安心枠を育てた一年'
        : 'これから記録が育つ一年';

  return {
    title: `${analytics.yearLabel}の食べ歩きまとめ`,
    subtitle: '12月31日に、今年の外食ログを1年分まとめて振り返ります。',
    heroLine: analytics.drawCount
      ? `あなたの今年の主役は「${topGenre}」。${analytics.drawCount}回の外食ログから見えた食のクセです。`
      : '今年の外食ログはまだ少なめです。ルーレットを回すほど、年末のまとめが育ちます。',
    totalMealsLabel: `${analytics.drawCount}回`,
    totalSpendLabel,
    averageBudgetLabel: averageLabel,
    topGenreLabel: topGenreItem ? `${topGenreItem.label} ${topGenreItem.count}回${topShare ? ` / ${topShare}%` : ''}` : 'まだなし',
    topAreaLabel,
    topMonthLabel,
    highlights: [
      analytics.drawCount
        ? `${analytics.yearLabel}は${analytics.drawCount}回の外食ログが残りました。平均単価は${averageLabel}です。`
        : '今年の外食ログが入ると、ここに年間の食傾向が出ます。',
      topGenreItem
        ? `${topGenreItem.label}が${topGenreItem.count}回で年間トップ。${secondGenre ? `${secondGenre}も続いています。` : '迷った日の安心枠になっています。'}`
        : 'トップジャンルはこれから見えてきます。',
      topAreaItem
        ? `範囲は${topAreaItem.label}が中心。全体では${areaCount}県に広がっています。`
        : '県ごとの傾向はこれから見えてきます。',
      `${genreCount}ジャンルに広がり、今年は「${explorationLabel}」でした。`,
      analytics.topMonth
        ? `いちばん外食が多かった月は${analytics.topMonth.monthLabel}。${analytics.topMonth.drawCount}回のログが残っています。`
        : '月ごとの山はまだありません。',
      analytics.budgetSampleCount
        ? `年間推定外食費は${totalSpendLabel}。来年は高単価ジャンルを月1回だけ意識すると整えやすくなります。`
        : '予算が入ると、年間の支出傾向と節約ポイントまで見えるようになります。',
    ],
    nextYearMission: topGenreItem
      ? `来年は「${topGenre}を残しつつ、${secondGenre ?? '未開拓ジャンル'}を月1回混ぜる」をミッションにすると、Wrappedの表情が変わります。`
      : '来年はまず3回ルーレットを回して、あなたの食の軸を育てましょう。',
  };
};

const buildDemoAiReportAnalytics = (
  genrePlans: AiReportGenrePlan[],
  mealCount: number,
  area: string,
  now = new Date(),
): MonthlyAnalytics => {
  const plans = trimAiReportPlansToMealCount(genrePlans, mealCount);
  const monthStart = getMonthStart(now);
  const reportArea = area?.trim() || '現在地周辺';
  const entries: DrawHistoryEntry[] = [];

  plans.forEach((plan) => {
    getAiReportPlanBudgets(plan).forEach((budget, visitIndex) => {
      const normalizedBudget = Math.max(500, Math.round(budget));
      const spread = normalizedBudget >= 2000 ? 400 : 250;
      const budgetMin = Math.max(300, normalizedBudget - spread);
      const budgetMax = normalizedBudget + spread;
      const index = entries.length;
      const createdAt = new Date(monthStart);
      createdAt.setDate(Math.min(28, 2 + index * 5));
      createdAt.setHours(12 + (index % 6), 0, 0, 0);
      entries.push({
        id: `demo-ai-report-${plan.label}-${visitIndex}`,
        provider: 'RANDISH_DEMO',
        providerPlaceId: `demo-ai-report-${plan.label}-${visitIndex}`,
        restaurantId: null,
        restaurant: null,
        area: reportArea,
        genre: plan.label,
        budgetMin,
        budgetMax,
        rangeMeters: 1500,
        createdAt: createdAt.toISOString(),
      });
    });
  });

  return getMonthlyAnalytics(entries, now);
};

const buildAiReportPayload = (
  currentAnalytics: MonthlyAnalytics,
  savedAnalytics: SavedRestaurantAnalytics,
) => ({
  monthLabel: currentAnalytics.monthLabel,
  drawCount: currentAnalytics.drawCount,
  mealDecisionCount: currentAnalytics.drawCount,
  terminology: {
    countLabel: '外食回数',
    preferredActionWords: ['外食', 'お店選び', '抽選'],
    forbiddenWords: ['ドロー'],
  },
  estimatedSpend: currentAnalytics.estimatedSpend,
  averageBudget: currentAnalytics.averageBudget,
  budgetSampleCount: currentAnalytics.budgetSampleCount,
  topGenre: currentAnalytics.topGenre,
  topArea: currentAnalytics.topArea,
  genreAnalytics: currentAnalytics.genreAnalytics.slice(0, 5),
  areaAnalytics: currentAnalytics.areaAnalytics.slice(0, 5),
  priceRangeAnalytics: currentAnalytics.priceRangeAnalytics.slice(0, 4),
  weekSpends: currentAnalytics.weekSpends,
  recentDraws: currentAnalytics.recentDraws.slice(0, 5).map((entry) => ({
    area: entry.area ?? entry.restaurant?.area ?? null,
    genre: entry.genre ?? entry.restaurant?.genre ?? null,
    budgetMin: entry.budgetMin ?? entry.restaurant?.budgetMin ?? null,
    budgetMax: entry.budgetMax ?? entry.restaurant?.budgetMax ?? null,
  })),
  saved: {
    total: savedAnalytics.totalSaved,
    topGenre: savedAnalytics.genreAnalytics[0]?.label ?? 'まだなし',
    topPriceRange: savedAnalytics.priceRangeAnalytics[0]?.label ?? 'まだなし',
  },
});

const buildLocalAiReport = (
  currentAnalytics: MonthlyAnalytics,
  savedAnalytics: SavedRestaurantAnalytics,
): AiMonthlyReport => {
  const topGenreItem = currentAnalytics.genreAnalytics[0] ?? null;
  const topGenre = currentAnalytics.topGenre === 'まだなし' ? '気分まかせ' : currentAnalytics.topGenre;
  const topArea = currentAnalytics.topArea === 'まだなし' ? 'いつものエリア' : currentAnalytics.topArea;
  const topGenreCount = topGenreItem?.count ?? 0;
  const drawCount = currentAnalytics.drawCount;
  const topShare = drawCount && topGenreCount ? Math.round((topGenreCount / drawCount) * 100) : 0;
  const genreCount = currentAnalytics.genreAnalytics.filter((item) => item.count > 0).length;
  const otherGenres = currentAnalytics.genreAnalytics
    .slice(1, 4)
    .map((item) => item.label)
    .filter(Boolean)
    .join('・');
  const explorationLabel = genreCount >= 4
    ? 'かなり広め'
    : genreCount >= 3
      ? 'ほどよく広い'
      : genreCount >= 2
        ? '少し偏りあり'
        : 'かなり集中';
  const spendLabel = currentAnalytics.budgetSampleCount ? `約${formatYen(currentAnalytics.estimatedSpend)}` : 'まだ集計待ち';
  const averageLabel = currentAnalytics.budgetSampleCount ? `約${formatYen(currentAnalytics.averageBudget)}` : 'まだなし';
  const topPrice = currentAnalytics.priceRangeAnalytics[0]?.label ?? 'まだなし';
  const savedTopGenre = savedAnalytics.genreAnalytics[0]?.label ?? 'お気に入り待ち';
  const highSpendGenre = currentAnalytics.genreAnalytics
    .filter((item) => item.estimatedSpend > 0)
    .sort((a, b) => b.estimatedSpend - a.estimatedSpend)[0] ?? topGenreItem;
  const activeWeek = currentAnalytics.weekSpends
    .filter((item) => item.amount > 0)
    .sort((a, b) => b.amount - a.amount)[0] ?? null;

  return {
    title: `${currentAnalytics.monthLabel}の食傾向レポート`,
    summary: currentAnalytics.drawCount
      ? `${currentAnalytics.monthLabel}は${topArea}での抽選が中心で、${topGenre}が食の軸でした。平均単価は${averageLabel}で、ジャンル・予算・場所のクセが見え始めています。`
      : '今月はまだ外食履歴が少なめです。1回使うと、AIがジャンルの偏り・予算・お気に入り傾向を読み始めます。',
    mood: currentAnalytics.drawCount >= 5 ? `${topGenre}軸の探索型` : '傾向育成中',
    highlights: [
      topGenreCount
        ? `${topGenre}が${topGenreCount}/${drawCount}回${topShare ? `（${topShare}%）` : ''}で、今月の軸になっています。`
        : '外食回数がまだ少ないため、食の軸はこれから見えてきます。',
      `${topArea}の履歴が中心です。場所が変わると、同じジャンルでも予算と候補の出方が変わります。`,
      `冒険度は${explorationLabel}。${otherGenres ? `${otherGenres}にも広がりがあります。` : '次は別ジャンルを1つ混ぜると差が出ます。'}`,
      `推定外食費は${spendLabel}、平均単価は${averageLabel}。価格帯は${topPrice}に寄っています。`,
      activeWeek
        ? `${activeWeek.label}に支出が集中。外食タイミングの山が見えています。`
        : '週ごとの偏りはまだ弱く、使うほど外食タイミングが見えてきます。',
      `お気に入り傾向は${savedTopGenre}。保存を増やすほど次月の提案が具体的になります。`,
    ],
    recommendations: [
      `${topGenre}は残しつつ、次の3回のうち1回だけ${otherGenres ? '未開拓ジャンル' : '別ジャンル'}を固定すると、レポートに差が出ます。`,
      `次回は${topPrice}のまま、${topArea}から少しだけ場所をずらすと「価格は同じで発見だけ増える」動きになります。`,
      '行った店は写真かお気に入りを1つ残すと、月末スライドショーと年次レポートの材料になります。',
    ],
    savingsTips: [
      currentAnalytics.budgetSampleCount
        ? `${highSpendGenre?.label ?? topGenre}の日は、同じジャンルで上限を${formatYen(Math.max(700, Math.round((currentAnalytics.averageBudget || 1500) * 0.85)))}前後に置くと、満足感を残したまま支出を抑えやすいです。`
        : 'まずは次の3回だけ価格を残すと、どのジャンルが節約ポイントか見えるようになります。',
      currentAnalytics.budgetSampleCount
        ? `手軽枠の${topGenre}を残しつつ、高単価になりやすい外食を月1回だけランチ帯に寄せると、月合計を整えやすいです。`
        : 'ランチ・夜のどちらで食べたかを残すと、節約できる時間帯が見つけやすくなります。',
      'お気に入りに「安くて満足」な店を1件保存しておくと、迷った日の節約候補として使えます。',
    ],
    nextAction: `次のお店選びは「${topGenre}以外を1回だけ混ぜる」設定で回してみましょう。`,
    closingNotes: [
      `${topGenre}が多い月は、迷った時の安心枠がはっきりしています。`,
      `${drawCount}回だけでも、ジャンル・予算・場所のクセは見え始めています。`,
      `平均単価${averageLabel}は、次の店選びの基準として使いやすいラインです。`,
      otherGenres ? `${otherGenres}を混ぜているので、同じ月の中にも小さな変化があります。` : '次に別ジャンルを1つ足すと、レポートの見え方が一気に変わります。',
      '写真かお気に入りを1つ残すだけで、来月のレポートはもっと自分専用になります。',
    ],
    generatedAt: new Date().toISOString(),
    source: 'demo',
  };
};

const requestAiMonthlyReport = async (
  currentAnalytics: MonthlyAnalytics,
  savedAnalytics: SavedRestaurantAnalytics,
  apiBaseUrlCandidates: readonly string[],
  userId: string,
): Promise<AiMonthlyReport> => {
  const fallback = buildLocalAiReport(currentAnalytics, savedAnalytics);
  if (!apiBaseUrlCandidates.length || userId === APP_USER_ID) {
    return fallback;
  }

  try {
    const data = await randishApi.generateAiReport(
      apiBaseUrlCandidates,
      userId,
      buildAiReportPayload(currentAnalytics, savedAnalytics),
    );
    const normalizeReportList = (value: unknown, fallbackItems: string[], limit: number) => {
      const items = Array.isArray(value)
        ? value.slice(0, limit).map(String).filter((item) => item.trim().length > 0)
        : [];
      return [...items, ...fallbackItems].slice(0, limit);
    };
    return {
      title: typeof data.title === 'string' ? data.title : fallback.title,
      summary: typeof data.summary === 'string' ? data.summary : fallback.summary,
      mood: typeof data.mood === 'string' ? data.mood : fallback.mood,
      highlights: normalizeReportList(data.highlights, fallback.highlights, 5),
      recommendations: normalizeReportList(data.recommendations, fallback.recommendations, 3),
      savingsTips: normalizeReportList(data.savingsTips, fallback.savingsTips, 3),
      nextAction: typeof data.nextAction === 'string' ? data.nextAction : fallback.nextAction,
      closingNotes: normalizeReportList(data.closingNotes, fallback.closingNotes, 5),
      generatedAt: typeof data.generatedAt === 'string' ? data.generatedAt : new Date().toISOString(),
      source: data.source === 'gemini' ? 'gemini' : data.source === 'fallback' ? 'fallback' : 'demo',
    };
  } catch {
    return { ...fallback, source: 'fallback' };
  }
};

const getPreviousMonthComparison = (entries: DrawHistoryEntry[], now = new Date()) => {
  const current = getCurrentMonthAnalytics(entries, now);
  const previous = getMonthlyAnalytics(entries, addMonthsToStart(now, -1));
  const diff = current.estimatedSpend - previous.estimatedSpend;
  const label = diff > 0
    ? `先月より約${formatYen(diff)}増えています`
    : diff < 0
      ? `先月より約${formatYen(Math.abs(diff))}節約`
      : '先月と同じくらい';

  return {
    current,
    previous,
    diff,
    label,
  };
};

const getSavedRestaurantAnalytics = (savedRestaurants: SavedRestaurant[]): SavedRestaurantAnalytics => {
  const entries = savedRestaurants.map((favorite, index) => {
    const savedBudget = favorite.savedBudgetMin != null || favorite.savedBudgetMax != null
      ? Math.round(((favorite.savedBudgetMin ?? favorite.savedBudgetMax ?? 0) + (favorite.savedBudgetMax ?? favorite.savedBudgetMin ?? 0)) / 2)
      : null;
    const snapshot = favorite.snapshot;
    const budgetMin = savedBudget ?? snapshot?.budgetMin ?? 0;
    const budgetMax = savedBudget ?? snapshot?.budgetMax ?? 999999;
    return {
      id: `saved-${favorite.id}-${index}`,
      provider: favorite.provider,
      providerPlaceId: favorite.providerPlaceId,
      restaurantId: favorite.restaurantId,
      restaurant: {
        ...(snapshot ?? {
          id: favorite.id,
          externalProvider: favorite.provider,
          externalId: favorite.providerPlaceId,
          name: 'お気に入りのお店',
          area: favorite.savedArea ?? 'エリアおまかせ',
          genre: favorite.savedGenre ?? 'ジャンルおまかせ',
          rating: 0,
          minutes: 0,
          address: '',
          photoUrl: null,
          note: '',
          budgetMin,
          budgetMax,
        }),
        genre: favorite.savedGenre ?? snapshot?.genre ?? 'ジャンルおまかせ',
        budgetMin,
        budgetMax,
      } as Restaurant,
      area: favorite.savedArea,
      genre: favorite.savedGenre,
      budgetMin: favorite.savedBudgetMin,
      budgetMax: favorite.savedBudgetMax,
      rangeMeters: favorite.savedRangeMeters,
      createdAt: favorite.createdAt,
    };
  });
  return {
    totalSaved: savedRestaurants.length,
    genreAnalytics: getGenreAnalytics(entries),
    priceRangeAnalytics: getPriceRangeAnalytics(entries),
  };
};

const getRatingValue = (restaurant: Restaurant) => {
  const rating = toOptionalNumber(restaurant.googleRating) ?? toOptionalNumber(restaurant.rating);
  return rating != null && rating > 0 ? rating : null;
};

const getRatingLabel = (restaurant: Restaurant) => {
  const rating = getRatingValue(restaurant);
  return rating == null ? '評価取得中' : `★ ${rating.toFixed(1)}`;
};

const getStoredMinutesLabel = (restaurant: Restaurant, uiText = UI_TEXT.ja) =>
  restaurant.minutes && restaurant.minutes > 0 ? `${restaurant.minutes}${uiText.minuteUnit}` : uiText.mapCheck;

const formatBusinessTime = (value?: string | null) => {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const now = new Date();
  const dateKey = new Intl.DateTimeFormat('ja-JP', { dateStyle: 'short', timeZone: 'Asia/Tokyo' }).format(date);
  const todayKey = new Intl.DateTimeFormat('ja-JP', { dateStyle: 'short', timeZone: 'Asia/Tokyo' }).format(now);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowKey = new Intl.DateTimeFormat('ja-JP', { dateStyle: 'short', timeZone: 'Asia/Tokyo' }).format(tomorrow);
  const time = new Intl.DateTimeFormat('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Tokyo',
  }).format(date);

  if (dateKey === todayKey) {
    return `今日 ${time}`;
  }
  if (dateKey === tomorrowKey) {
    return `明日 ${time}`;
  }
  return new Intl.DateTimeFormat('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Tokyo',
  }).format(date);
};

const getOpenStatus = (restaurant: Restaurant) => {
  if (restaurant.openNow === true) {
    const closeTime = formatBusinessTime(restaurant.nextCloseTime);
    return {
      active: true,
      label: '営業中',
      detail: closeTime ? `${closeTime}まで営業` : '現在営業しています',
    };
  }
  if (restaurant.openNow === false) {
    const openTime = formatBusinessTime(restaurant.nextOpenTime);
    return {
      active: false,
      label: '営業時間外',
      detail: openTime ? `次は${openTime}から` : '来店前に営業時間を確認してください',
    };
  }
  return {
    active: null,
    label: '営業時間確認中',
    detail: 'Google Mapで最新の営業時間を確認してください',
  };
};

const getDistanceKm = (from: UserLocation | null, restaurant: Restaurant) => {
  if (!from || restaurant.latitude == null || restaurant.longitude == null) {
    return null;
  }

  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(restaurant.latitude - from.latitude);
  const dLon = toRad(restaurant.longitude - from.longitude);
  const lat1 = toRad(from.latitude);
  const lat2 = toRad(restaurant.latitude);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const getDistanceLabel = (from: UserLocation | null, restaurant: Restaurant, uiText = UI_TEXT.ja) => {
  const km = getDistanceKm(from, restaurant);
  if (km != null) {
    return km < 1
      ? `${uiText.aboutPrefix}${Math.round(km * 1000)}${uiText.meterUnit}`
      : `${uiText.aboutPrefix}${km.toFixed(1)}${uiText.kilometerUnit}`;
  }
  return restaurant.minutes && restaurant.minutes > 0
    ? `${uiText.walkAboutPrefix}${restaurant.minutes}${uiText.minuteUnit}`
    : uiText.mapCheck;
};

const getWalkingMinutesLabel = (from: UserLocation | null, restaurant: Restaurant, uiText = UI_TEXT.ja) => {
  const km = getDistanceKm(from, restaurant);
  if (km != null) {
    return `${Math.max(1, Math.round(km * 12.5))}${uiText.minuteUnit}`;
  }
  return restaurant.minutes && restaurant.minutes > 0 ? `${restaurant.minutes}${uiText.minuteUnit}` : uiText.mapCheck;
};

const getPresetPrefecture = (preset: AreaPreset) => preset.group.split('/')[0].trim();

const getAreaPresetValue = (preset: AreaPreset) => preset.value ?? preset.label;

const getAreaPresetSearchValue = (preset: AreaPreset) =>
  preset.searchValue ?? `${preset.group.replace(/\s*\/\s*/g, ' ')} ${preset.label}`.trim();

const getAreaPresetSearchText = (preset: AreaPreset) =>
  `${preset.group} ${preset.label} ${preset.value ?? ''} ${preset.searchValue ?? ''}`.toLowerCase();

const getAreaPresetKey = (preset: AreaPreset) => `${preset.group}-${getAreaPresetValue(preset)}`;

const formatAreaPresetStatus = (preset: AreaPreset) => {
  const prefecture = getPresetPrefecture(preset);
  const region = getPrefectureRegion(prefecture);
  if (region && prefecture && preset.label !== prefecture) {
    return `${region} / ${prefecture} / ${preset.label} 周辺から探します`;
  }
  return `${preset.group} 周辺から探します`;
};

const NON_STATION_AREA_LABELS = new Set([
  '現在地',
  '歌舞伎町',
  '国分町',
  '片町',
  '下通',
  '国際通り',
  '旧居留地',
  '北野',
  '新世界',
  '堀江',
  'みなとみらい',
]);
const MAX_TRUSTED_STATION_DISTANCE_KM = 3;
const MAX_STATION_ACCESS_ITEMS = 3;
const STATION_LINE_LABELS: Record<string, string> = {
  梅田: '大阪メトロ御堂筋線',
  大阪駅: 'JR大阪環状線',
  北新地: 'JR東西線',
  中崎町: '大阪メトロ谷町線',
  天満: 'JR大阪環状線',
  扇町: '大阪メトロ堺筋線',
  南森町: '大阪メトロ谷町線・堺筋線',
  天神橋筋六丁目: '大阪メトロ谷町線・堺筋線',
  横浜: 'JR・東急・京急・相鉄',
  渋谷: 'JR・東急・東京メトロ',
  新宿: 'JR・小田急・京王',
  花隈: '神戸高速線',
};

const uniqueAreaPresets = (items: AreaPreset[]) => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = getAreaPresetKey(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

const ALL_AREA_PRESETS = uniqueAreaPresets([
  ...AREA_PRESETS,
  ...OSAKA_WARD_CENTER_PRESETS,
  ...JAPAN_MUNICIPALITY_PRESETS,
  ...SUPPLEMENTAL_AREA_PRESETS,
]);

const getPrefectureFromText = (value?: string | null) => {
  if (!value) {
    return undefined;
  }
  const directMatch = PREFECTURE_REGIONS.find((item) => value.includes(item.prefecture))?.prefecture;
  if (directMatch) {
    return directMatch;
  }
  const areaMatch = ALL_AREA_PRESETS.find((preset) => {
    const groupArea = preset.group.split('/')[1]?.trim();
    return preset.label !== '現在地'
      && (
        preset.group.includes(value)
        || (groupArea ? value.includes(groupArea) || groupArea.includes(value) : false)
        || value.includes(preset.label)
      );
  });
  return areaMatch ? getPresetPrefecture(areaMatch) : undefined;
};

const isPrefectureName = (value: string) => PREFECTURE_REGIONS.some((item) => item.prefecture === value);

const TRAVEL_AREA_PRESETS: AreaPreset[] = JAPAN_MUNICIPALITY_PRESETS.filter((preset) => {
  const areaValue = getAreaPresetValue(preset);
  return areaValue !== '現在地' && !isPrefectureName(areaValue) && !isPrefectureName(preset.label);
});

const pickRandomTravelAreaPreset = () =>
  TRAVEL_AREA_PRESETS[Math.floor(Math.random() * TRAVEL_AREA_PRESETS.length)] ?? ALL_AREA_PRESETS[0];

const getPrefectureRegion = (prefecture?: string | null) =>
  PREFECTURE_REGIONS.find((item) => item.prefecture === prefecture)?.region;

const getRegionGroupForPrefecture = (prefecture?: string | null) =>
  AREA_REGION_GROUPS.find((group) => group.prefectures.includes(prefecture ?? ''))?.label;

const formatLocationStatus = (prefecture: string | undefined, areaLabel: string) => {
  const region = getPrefectureRegion(prefecture);
  if (prefecture && region) {
    return `${region} / ${prefecture} / ${areaLabel} 周辺から探します`;
  }
  if (prefecture) {
    return `${prefecture} / ${areaLabel} 周辺から探します`;
  }
  return `${areaLabel} 周辺から探します`;
};

const hasUsablePresetCoordinates = (preset: AreaPreset) =>
  preset.label !== '現在地' && preset.useCoordinates !== false && preset.latitude !== 0 && preset.longitude !== 0;

const getAreaPreset = (area: string) => {
  const cleanArea = area.trim();
  const exactValuePreset = ALL_AREA_PRESETS.find((preset) => getAreaPresetValue(preset) === cleanArea);
  if (exactValuePreset) {
    return exactValuePreset;
  }

  const labelMatches = ALL_AREA_PRESETS.filter((preset) => preset.label === cleanArea);
  if (labelMatches.length <= 1) {
    return labelMatches[0];
  }

  return labelMatches.find(hasUsablePresetCoordinates);
};

const getOsakaWardFromArea = (area: string) => {
  const compactArea = area.replace(/[\s/]+/g, '');
  return OSAKA_CITY_WARDS.find(
    (ward) =>
      area.trim() === ward
      || compactArea === ward
      || compactArea === `大阪市${ward}`
      || compactArea === `大阪府大阪市${ward}`
      || compactArea.includes(`大阪市${ward}`),
  ) ?? null;
};

const getRepresentativeOriginPresetForArea = (area: string) => {
  const ward = getOsakaWardFromArea(area);
  return ward ? OSAKA_WARD_REPRESENTATIVE_ORIGIN_PRESETS[ward] ?? null : null;
};

const isWardLikeAreaLabel = (label: string) => label.trim().endsWith('区');

const isStationLikePreset = (preset: AreaPreset) =>
  hasUsablePresetCoordinates(preset) && !NON_STATION_AREA_LABELS.has(preset.label) && !isWardLikeAreaLabel(preset.label);

const formatStationName = (label: string) => `${label}${label.endsWith('駅') ? '' : '駅'}`;

const formatDistanceOriginName = (label: string) => {
  const cleanLabel = label.trim();
  if (!cleanLabel || cleanLabel === '現在地') {
    return '現在地';
  }
  return /(?:都|道|府|県|市|区|町|村)$/.test(cleanLabel) ? cleanLabel : formatStationName(cleanLabel);
};

const formatDistanceOriginSentence = (originName: string, distance: string) =>
  `距離は${formatDistanceOriginName(originName)}からの距離です（${distance}）`;

const sortAreaPresetsForPicker = (items: AreaPreset[], prefecture: string) => {
  const popularOrder = PREFECTURE_POPULAR_AREA_ORDER[prefecture] ?? [];
  return items
    .map((item, index) => ({
      item,
      index,
      priority: popularOrder.includes(item.label) ? popularOrder.indexOf(item.label) : Number.POSITIVE_INFINITY,
    }))
    .sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      const coordinateScoreA = hasUsablePresetCoordinates(a.item) ? 0 : 1;
      const coordinateScoreB = hasUsablePresetCoordinates(b.item) ? 0 : 1;
      if (coordinateScoreA !== coordinateScoreB) {
        return coordinateScoreA - coordinateScoreB;
      }
      return a.index - b.index;
    })
    .map(({ item }) => item);
};

const getWalkingMinutesFromKm = (km: number) => Math.max(1, Math.round(km * 12.5));

const getStationCandidateItem = (preset: AreaPreset, restaurant: Restaurant) => ({
  preset,
  distance: getDistanceKm(
    { latitude: preset.latitude, longitude: preset.longitude, label: preset.label },
    restaurant,
  ) ?? Number.POSITIVE_INFINITY,
});

const toStationAccessItem = ({ preset, distance }: { preset: AreaPreset; distance: number }): StationAccessItem => {
  const stationName = formatStationName(preset.label);
  return {
    stationName,
    lineLabel: STATION_LINE_LABELS[preset.label],
    walkingMinutes: getWalkingMinutesFromKm(distance),
    distanceKm: distance,
    location: {
      latitude: preset.latitude,
      longitude: preset.longitude,
      label: preset.label,
    },
  };
};

const getPreferredStationAccessItem = (restaurant: Restaurant, preferredArea?: string | null): StationAccessItem | null => {
  if (restaurant.latitude == null || restaurant.longitude == null) {
    return null;
  }

  const prefecture = getPrefectureFromText(`${restaurant.area} ${restaurant.address}`);
  const preferredPreset = preferredArea ? getCoordinatePresetForArea(preferredArea)?.preset : null;
  if (!preferredPreset || !isStationLikePreset(preferredPreset)) {
    return null;
  }
  if (prefecture && getPresetPrefecture(preferredPreset) !== prefecture) {
    return null;
  }

  const item = getStationCandidateItem(preferredPreset, restaurant);
  if (!Number.isFinite(item.distance) || item.distance > MAX_TRUSTED_STATION_DISTANCE_KM) {
    return null;
  }
  return toStationAccessItem(item);
};

const getNearestStationAccessItems = (restaurant: Restaurant): StationAccessItem[] => {
  if (restaurant.latitude == null || restaurant.longitude == null) {
    return [];
  }

  const prefecture = getPrefectureFromText(`${restaurant.area} ${restaurant.address}`);
  const candidates = AREA_PRESETS
    .filter(isStationLikePreset)
    .filter((preset) => !prefecture || getPresetPrefecture(preset) === prefecture);

  return candidates
    .map((preset) => getStationCandidateItem(preset, restaurant))
    .filter((item) => Number.isFinite(item.distance) && item.distance <= MAX_TRUSTED_STATION_DISTANCE_KM)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, MAX_STATION_ACCESS_ITEMS)
    .map(toStationAccessItem);
};

const getCoordinatePresetForArea = (area: string) => {
  const cleanArea = area.trim();
  if (!cleanArea || cleanArea === '現在地') {
    return null;
  }

  if (isPrefectureName(cleanArea)) {
    return null;
  }

  const representativeOriginPreset = getRepresentativeOriginPresetForArea(cleanArea);
  if (representativeOriginPreset) {
    return { preset: representativeOriginPreset, label: representativeOriginPreset.label };
  }

  const exactPreset = ALL_AREA_PRESETS.find(
    (preset) =>
      hasUsablePresetCoordinates(preset)
      && (getAreaPresetValue(preset) === cleanArea || preset.label === cleanArea || preset.searchValue === cleanArea),
  );
  if (exactPreset) {
    return { preset: exactPreset, label: exactPreset.label };
  }

  const selectedPreset = getAreaPreset(cleanArea);
  const prefecture = selectedPreset
    ? getPresetPrefecture(selectedPreset)
    : getPrefectureFromText(cleanArea);

  if (!prefecture) {
    return null;
  }

  const simplifiedArea = cleanArea.replace(/[市区町村]$/, '');
  const sameAreaPreset = ALL_AREA_PRESETS.find(
    (preset) =>
      getPresetPrefecture(preset) === prefecture
      && hasUsablePresetCoordinates(preset)
      && (
        getAreaPresetValue(preset) === cleanArea
        || preset.label === simplifiedArea
        || preset.label === cleanArea
        || preset.group.includes(cleanArea)
        || (preset.searchValue?.includes(cleanArea) ?? false)
    ),
  );
  const preset = sameAreaPreset;
  if (!preset) {
    return null;
  }

  return { preset, label: cleanArea };
};

const getRestaurantAreaLabel = (restaurant: Restaurant) => {
  const source = `${restaurant.area} ${restaurant.address} ${restaurant.name}`;
  const matchedPreset = ALL_AREA_PRESETS.find((preset) => preset.label !== '現在地' && source.includes(preset.label));
  if (matchedPreset) {
    return matchedPreset.label;
  }

  const compactArea = restaurant.area
    .replace(/^日本/, '')
    .replace(/^(大阪府|兵庫県|京都府|奈良県|滋賀県|和歌山県)/, '')
    .replace(/^(大阪市|神戸市|京都市)/, '')
    .replace(/[0-9０-９].*$/, '')
    .replace(/[丁目番地号\-ー−].*$/, '')
    .trim();
  return compactArea ? compactArea.slice(0, 6) : restaurant.area.slice(0, 6);
};

const buildAreaSearchKeyword = (value: string) => {
  const cleanArea = value.trim();
  if (!cleanArea || cleanArea === '現在地') {
    return undefined;
  }

  const preset = getAreaPreset(cleanArea);
  if (!preset) {
    return cleanArea;
  }

  // API検索では都道府県と市区町村も添えて、同名エリアの誤爆を減らす。
  return getAreaPresetSearchValue(preset);
};

const getSearchOriginForArea = (area: string, currentLocation: UserLocation | null): UserLocation | null => {
  const cleanArea = area.trim();
  if (!cleanArea || cleanArea === '現在地') {
    return currentLocation;
  }

  const areaParts = cleanArea.split('/').map((item) => item.trim()).filter(Boolean);
  const areaCandidates = [
    cleanArea,
    areaParts.length ? areaParts[areaParts.length - 1] : cleanArea,
  ];
  const coordinatePreset = areaCandidates
    .map((candidate) => getCoordinatePresetForArea(candidate))
    .find((candidate): candidate is NonNullable<ReturnType<typeof getCoordinatePresetForArea>> => Boolean(candidate));
  if (!coordinatePreset) {
    return null;
  }

  return {
    latitude: coordinatePreset.preset.latitude,
    longitude: coordinatePreset.preset.longitude,
    label: coordinatePreset.preset.label,
  };
};

const toHotPepperRange = (value: string) => {
  const normalized = value.trim();
  if (normalized === '500m') return 2;
  if (normalized === '800m' || normalized === '1km') return 3;
  if (normalized === '1.5km' || normalized === '2km') return 4;
  return 5;
};

const createAreaMockRestaurants = (area: string, genre: string): Restaurant[] => {
  const preset = getAreaPreset(area);
  const areaLabel = preset?.label ?? area;
  const safeArea = areaLabel?.trim() && areaLabel !== '現在地' ? areaLabel.trim() : '現在地周辺';
  const selectedGenre = genre && genre !== 'すべて' ? genre : '和食';
  const latitude = preset && preset.latitude !== 0 ? preset.latitude : 34.7025;
  const longitude = preset && preset.longitude !== 0 ? preset.longitude : 135.4959;
  const addressPrefix = preset?.group ? preset.group.replace(/\s*\/\s*/g, '') : safeArea;

  return [
    {
      id: `mock-${safeArea}-${selectedGenre}-main`,
      externalProvider: 'mock',
      externalId: `mock-${safeArea}-${selectedGenre}-main`,
      name: `${safeArea} ${selectedGenre}食堂`,
      area: safeArea,
      genre: selectedGenre,
      budgetMin: 1200,
      budgetMax: 2800,
      rating: 4.2,
      minutes: 8,
      address: `${addressPrefix} 1-1`,
      photoUrl: null,
      note: `${safeArea}で${selectedGenre}を食べたい日に使える候補です。`,
      priceRange: '1,200円〜2,800円',
      latitude,
      longitude,
    },
    {
      id: `mock-${safeArea}-izakaya`,
      externalProvider: 'mock',
      externalId: `mock-${safeArea}-izakaya`,
      name: `${safeArea} まちの台所`,
      area: safeArea,
      genre: selectedGenre,
      budgetMin: 1800,
      budgetMax: 3800,
      rating: 4.1,
      minutes: 11,
      address: `${addressPrefix} 2-3`,
      photoUrl: null,
      note: 'API接続がない時に表示するエリア確認用の候補です。',
      priceRange: '1,800円〜3,800円',
      latitude: latitude + 0.002,
      longitude: longitude + 0.002,
    },
  ];
};

const getOptionalLocationModule = () => {
  try {
    return require('expo-location') as {
      Accuracy: { Balanced: unknown };
      getForegroundPermissionsAsync?: () => Promise<{ status: string; granted?: boolean }>;
      requestForegroundPermissionsAsync: () => Promise<{ status: string }>;
      getCurrentPositionAsync: (options?: unknown) => Promise<{ coords: { latitude: number; longitude: number } }>;
      reverseGeocodeAsync: (coords: { latitude: number; longitude: number }) => Promise<
        Array<{
          city?: string | null;
          district?: string | null;
          subregion?: string | null;
          region?: string | null;
          name?: string | null;
        }>
      >;
    };
  } catch {
    return null;
  }
};

type OptionalAsyncStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

const getOptionalAsyncStorageModule = (): OptionalAsyncStorage | null => {
  try {
    const module = require('@react-native-async-storage/async-storage') as {
      default?: OptionalAsyncStorage;
      getItem?: (key: string) => Promise<string | null>;
      setItem?: (key: string, value: string) => Promise<void>;
    };
    if (module.default) {
      return module.default;
    }
    return module.getItem && module.setItem
      ? { getItem: module.getItem, setItem: module.setItem }
      : null;
  } catch {
    return null;
  }
};

const getOptionalHapticsModule = () => {
  try {
    return require('expo-haptics') as {
      ImpactFeedbackStyle?: { Light?: unknown; Medium?: unknown };
      NotificationFeedbackType?: { Success?: unknown; Warning?: unknown };
      impactAsync?: (style?: unknown) => Promise<void>;
      notificationAsync?: (type?: unknown) => Promise<void>;
    };
  } catch {
    return null;
  }
};

const readLocalValue = async (key: string) => {
  const storage = getOptionalAsyncStorageModule();
  if (storage) {
    return storage.getItem(key);
  }
  if (Platform.OS === 'web') {
    try {
      const runtimeGlobal = globalThis as typeof globalThis & {
        localStorage?: { getItem: (key: string) => string | null };
      };
      return runtimeGlobal.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }
  return null;
};

const writeLocalValue = async (key: string, value: string) => {
  const storage = getOptionalAsyncStorageModule();
  if (storage) {
    await storage.setItem(key, value);
    return;
  }
  if (Platform.OS === 'web') {
    try {
      const runtimeGlobal = globalThis as typeof globalThis & {
        localStorage?: { setItem: (key: string, value: string) => void };
      };
      runtimeGlobal.localStorage?.setItem(key, value);
    } catch {
      // Local storage can be unavailable in private windows; the app can still continue.
    }
  }
};

const filterMockRestaurants = (genre: string, area: string, budgetMin: string, budgetMax: string) => {
  const min = Number(budgetMin || 0);
  const max = Number(budgetMax || 999999);
  const matchesBudget = (restaurant: Restaurant) => {
    if (min <= 0) {
      return restaurant.budgetMin <= max;
    }
    const averageBudget = (restaurant.budgetMin + restaurant.budgetMax) / 2;
    return averageBudget >= min && averageBudget <= max;
  };
  const filtered = MOCK_RESTAURANTS.filter((restaurant) => {
    const genreMatch = genre === 'すべて' || restaurant.genre === genre;
    const areaMatch = !area.trim() || area === '現在地' || restaurant.area.includes(area.trim());
    return genreMatch && areaMatch && matchesBudget(restaurant);
  });
  if (filtered.length) {
    return filtered;
  }
  return createAreaMockRestaurants(area, genre).filter(matchesBudget);
};

const includesAny = (source: string, keywords: string[]) => keywords.some((keyword) => source.includes(keyword));

const pickRandomRestaurant = (items: Restaurant[]) => items[Math.floor(Math.random() * items.length)];

const pickFreshRestaurant = (items: Restaurant[], recentIds: Set<string>, currentId?: string) => {
  const freshItems = items.filter((item) => !recentIds.has(item.id));
  if (freshItems.length) {
    return pickRandomRestaurant(freshItems);
  }

  const differentItems = currentId ? items.filter((item) => item.id !== currentId) : [];
  return differentItems.length ? pickRandomRestaurant(differentItems) : null;
};

const restaurantMatchesSelectedGenre = (restaurant: Restaurant, selectedGenre: string) => {
  const genre = normalizeGenreLabel(selectedGenre);
  if (!genre || genre === 'すべて') {
    return true;
  }

  const source = `${restaurant.genre ?? ''} ${restaurant.name ?? ''} ${restaurant.note ?? ''}`;
  switch (genre) {
    case '定食':
      return !includesAny(source, ['韓国', '焼肉', 'カラオケ', 'バー'])
        && includesAny(source, ['定食', '食堂', '和食', 'ごはん', '御膳', '膳']);
    case '居酒屋':
      return includesAny(source, ['居酒屋', '酒場', '炉端', 'バル']);
    case '韓国料理':
      return includesAny(source, ['韓国', 'サムギョプサル', 'チーズタッカルビ', '冷麺']);
    case 'ラーメン':
      return includesAny(source, ['ラーメン', 'らーめん', 'つけ麺', '麺']);
    case '焼肉':
      return includesAny(source, ['焼肉', 'ホルモン', 'ジンギスカン']);
    case 'カレー':
      return includesAny(source, ['カレー', 'スパイス']);
    case 'うどん':
      return includesAny(source, ['うどん']);
    case 'そば':
      return includesAny(source, ['そば', '蕎麦']);
    case '粉もの':
      return includesAny(source, ['粉もの', 'たこ焼き', 'お好み焼き', 'もんじゃ']);
    case 'たこ焼き':
      return includesAny(source, ['たこ焼き']);
    case 'お好み焼き':
      return includesAny(source, ['お好み焼き', 'もんじゃ']);
    case '焼き鳥':
      return includesAny(source, ['焼き鳥', '焼鳥']);
    case 'ピザ':
      return includesAny(source, ['ピザ', 'ピッツァ']);
    case 'ハンバーガー':
      return includesAny(source, ['ハンバーガー', 'バーガー']);
    case '串カツ':
      return includesAny(source, ['串カツ', '串かつ']);
    case '餃子':
      return includesAny(source, ['餃子']);
    case '和食':
      return includesAny(source, ['和食', '日本料理', '定食', '食堂', '懐石', '割烹']);
    case '洋食':
      return includesAny(source, ['洋食', 'ステーキ', 'ハンバーグ', 'オムライス']);
    case 'イタリアン':
      return includesAny(source, ['イタリアン', 'パスタ', 'ピザ', 'ピッツァ', 'トラットリア']);
    case '中華':
      return includesAny(source, ['中華', '中国料理', '餃子', '四川']);
    case '寿司':
      return includesAny(source, ['寿司', '鮨', 'すし']);
    case '海鮮':
      return includesAny(source, ['海鮮', '魚', '刺身', '浜焼き']);
    case '郷土料理':
      return includesAny(source, ['郷土料理', '郷土', 'ご当地', '名物', '地元料理', '沖縄料理', '北海道料理']);
    case '肉料理':
      return includesAny(source, ['肉', '焼肉', 'ステーキ', 'ハンバーグ', 'ホルモン']);
    case 'サラダ・野菜':
      return includesAny(source, ['サラダ', '野菜', 'ベジ']);
    case 'スープ':
      return includesAny(source, ['スープ', '汁', '鍋']);
    case 'スイーツ':
      return includesAny(source, ['スイーツ', 'デザート', 'ケーキ', 'パフェ', '甘味']);
    case 'カフェ':
      return includesAny(source, ['カフェ', '喫茶']);
    case 'パン':
      return includesAny(source, ['パン', 'ベーカリー']);
    case 'ファストフード':
      return includesAny(source, [
        'ファストフード',
        'ファーストフード',
        'ハンバーガー',
        'バーガー',
        'サンド',
        'フライド',
        'マクドナルド',
        'マック',
        'モスバーガー',
        'ロッテリア',
        'ケンタッキー',
        'KFC',
        'バーガーキング',
        'フレッシュネス',
        'サブウェイ',
        'ドムドム',
      ]);
    case 'お酒・バー':
      return includesAny(source, ['バー', 'ダイニングバー', '居酒屋', 'ワイン', 'ビール', '酒']);
    case '各国料理':
      return includesAny(source, ['各国料理', '韓国', 'アジア', 'エスニック', 'タイ', 'インド', 'メキシコ', 'スペイン', 'ベトナム']);
    case 'その他':
      return true;
    default:
      return true;
  }
};

const buildGenreSummaryItems = (restaurants: Restaurant[]) => {
  const counts = new Map<string, number>();
  restaurants.forEach((restaurant) => {
    const label = restaurant.genre?.trim() || 'ジャンル未分類';
    counts.set(label, (counts.get(label) ?? 0) + 1);
  });

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([label, count]) => `${label} ${count}件`);
};

const buildGenreDiagnosticMessage = (requestedGenre: string, restaurants: Restaurant[], area: string) => {
  const cleanGenre = requestedGenre.trim();
  if (!cleanGenre || cleanGenre === 'すべて') {
    return null;
  }

  const areaLabel = area.trim() && area !== '現在地' ? area.trim() : 'このエリア';
  if (!restaurants.length) {
    return `${areaLabel}では「${cleanGenre}」候補が見つかりませんでした。ジャンルなしでも候補が少ないエリアです。`;
  }

  const genreSummary = buildGenreSummaryItems(restaurants);
  if (!genreSummary.length) {
    return `${areaLabel}では「${cleanGenre}」候補が見つかりませんでした。APIのジャンル分類も取得できませんでした。`;
  }

  return `${areaLabel}では「${cleanGenre}」候補が見つかりません。API上は主に ${genreSummary.join(' / ')} として返っています。`;
};

export default function App() {
  const [stage, setStage] = useState<AppStage>('splash');
  const [userId, setUserId] = useState(APP_USER_ID);
  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const runtimeApiBaseUrl = useMemo(getRuntimeApiBaseUrl, []);
  const [apiBaseUrl, setApiBaseUrl] = useState(runtimeApiBaseUrl);
  const [area, setArea] = useState('現在地');
  const [genre, setGenre] = useState('ラーメン');
  const [budgetMin, setBudgetMin] = useState('0');
  const [budgetMax, setBudgetMax] = useState('1500');
  const [distance, setDistance] = useState('1.5km');
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);
  const [randomHistory, setRandomHistory] = useState<Restaurant[]>([]);
  const [drawHistories, setDrawHistories] = useState<DrawHistoryEntry[]>([]);
  const [savedRestaurants, setSavedRestaurants] = useState<SavedRestaurant[]>([]);
  const [albumPhotos, setAlbumPhotos] = useState<AlbumPhotoEntry[]>([]);
  const [savedDetail, setSavedDetail] = useState<{ favorite: SavedRestaurant; restaurant: Restaurant } | null>(null);
  const [savedDetailLoadingId, setSavedDetailLoadingId] = useState<string | null>(null);
  const [savedDetailError, setSavedDetailError] = useState<string | null>(null);
  const [historyDetailLoadingId, setHistoryDetailLoadingId] = useState<string | null>(null);
  const [historyDetailError, setHistoryDetailError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [locationIntroState, setLocationIntroState] = useState<LocationIntroState>('loading');
  const [locationIntroWorking, setLocationIntroWorking] = useState(false);
  const [profileName, setProfileName] = useState('RANDISH Guest');
  const [profileImageUri, setProfileImageUri] = useState<string | null>(null);
  const [appLanguage, setAppLanguage] = useState<AppLanguage>('ja');
  const [freshOAuthSessionPreferred, setFreshOAuthSessionPreferred] = useState(false);
  const [locationStatus, setLocationStatus] = useState('現在地を確認できます');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('条件を選んで、今日の一店を決めましょう。');
  const [drawAnimationKey, setDrawAnimationKey] = useState<DrawAnimationKey>('roulette');
  const [drawMode, setDrawMode] = useState<DrawMode>('condition');
  const [mapRouletteStatus, setMapRouletteStatus] = useState<MapRouletteStatus>('idle');
  const [mapCandidates, setMapCandidates] = useState<CandidatePlace[]>([]);
  const [mapRouletteTarget, setMapRouletteTarget] = useState<CandidatePlace | null>(null);
  const [mapRouletteError, setMapRouletteError] = useState<string | null>(null);
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);
  const [travelRevealStep, setTravelRevealStep] = useState<TravelRevealStep>('hidden');
  const [travelDisplayArea, setTravelDisplayArea] = useState<string | null>(null);
  const [conditionRandom, setConditionRandom] = useState<ConditionRandomState>({
    area: false,
    budget: false,
    distance: false,
    genre: false,
  });
  const [now, setNow] = useState(() => new Date());

  const logoScale = useRef(new Animated.Value(0.88)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const spinValue = useRef(new Animated.Value(0)).current;
  const mapPinProgress = useRef(new Animated.Value(0)).current;
  const mapPinBounce = useRef(new Animated.Value(0)).current;
  const resultRevealValue = useRef(new Animated.Value(0)).current;
  const scrollViewRef = useRef<ScrollView | null>(null);
  const randomTabOffsetRef = useRef(0);
  const randomResultOffsetRef = useRef(0);
  const savedDetailCacheRef = useRef(new Map<string, Restaurant>());
  const didAskLocation = useRef(false);
  const candidateCacheRef = useRef<CandidateCacheEntry | null>(null);
  const previewCandidateQueryKeyRef = useRef<string | null>(null);
  const mapSpinRunIdRef = useRef(0);
  const didRestoreAuth = useRef(false);
  const areaRef = useRef(area);
  const userIdRef = useRef(userId);
  const userLocationRef = useRef<UserLocation | null>(userLocation);

  const scrollToContentTop = useCallback((animated = true) => {
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({ y: 0, animated });
    }, 0);
  }, []);

  const scrollToRandomResult = useCallback(() => {
    const targetY = Math.max(randomTabOffsetRef.current + randomResultOffsetRef.current - 18, 0);
    scrollViewRef.current?.scrollTo({ y: targetY, animated: true });
  }, []);

  const enterMain = useCallback((nextUserId = APP_USER_ID, nextProfileName?: string) => {
    setUserId(nextUserId);
    setFreshOAuthSessionPreferred(false);
    if (nextUserId === APP_USER_ID) {
      setProfileName('RANDISH Guest');
      setProfileImageUri(null);
    } else if (nextProfileName?.trim()) {
      setProfileName(nextProfileName.trim());
    }
    setStage('main');
  }, []);

  const enterAuthenticatedSession = useCallback(async (auth: AuthResponse, accessToken: string, refreshToken?: string | null) => {
    const cleanToken = accessToken.trim();
    if (cleanToken) {
      randishApi.setAuthToken(cleanToken);
      await writeStoredAuthSession({
        accessToken: cleanToken,
        refreshToken: refreshToken?.trim() || auth.refreshToken?.trim() || null,
        userId: auth.user.id,
        displayName: auth.user.displayName,
      });
    }
    enterMain(auth.user.id, auth.user.displayName);
  }, [enterMain]);

  const enterGuestSession = useCallback(async () => {
    randishApi.setAuthToken(null);
    await clearStoredAuthSession();
    enterMain();
  }, [enterMain]);

  useEffect(() => {
    areaRef.current = area;
  }, [area]);

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  useEffect(() => {
    userLocationRef.current = userLocation;
  }, [userLocation]);

  useEffect(() => {
    setApiBaseUrl((current) => shouldReplaceWithRuntimeApiBaseUrl(current, runtimeApiBaseUrl) ? runtimeApiBaseUrl : current);
  }, [runtimeApiBaseUrl]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const [introValue, cachedLocationValue] = await Promise.all([
        readLocalValue(LOCATION_INTRO_STORAGE_KEY),
        readLocalValue(LOCATION_CACHE_STORAGE_KEY),
      ]);
      if (!mounted) {
        return;
      }
      setLocationIntroState(introValue === 'completed' ? 'completed' : 'pending');
      if (cachedLocationValue) {
        try {
          const parsed = JSON.parse(cachedLocationValue) as StoredUserLocation;
          if (
            typeof parsed.latitude === 'number'
            && typeof parsed.longitude === 'number'
            && Number.isFinite(parsed.latitude)
            && Number.isFinite(parsed.longitude)
          ) {
            const cachedLocation = {
              latitude: parsed.latitude,
              longitude: parsed.longitude,
              label: parsed.label || '現在地',
            };
            userLocationRef.current = cachedLocation;
            setUserLocation(cachedLocation);
            setLocationStatus(`${cachedLocation.label} 周辺から探します`);
          }
        } catch {
          // Ignore stale location cache.
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) {
          setReduceMotionEnabled(enabled);
        }
      })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReduceMotionEnabled);
    return () => {
      mounted = false;
      subscription?.remove?.();
    };
  }, []);

  const apiBaseUrlCandidates = useMemo(
    () => buildApiBaseUrlCandidates(apiBaseUrl, runtimeApiBaseUrl),
    [apiBaseUrl, runtimeApiBaseUrl],
  );
  const subscription = useSubscription(userId, apiBaseUrlCandidates);
  const mealTicketState = useMemo(
    () => buildMealTicketState(now, drawHistories, subscription.isPro, DEV_DISABLE_MEAL_TICKET_LIMIT),
    [drawHistories, now, subscription.isPro],
  );
  const isRegisteredUser = userId !== APP_USER_ID;

  const syncWorkingApiBaseUrl = useCallback(() => {
    const workingBaseUrl = randishApi.getLastSuccessfulBaseUrl();
    if (workingBaseUrl) {
      setApiBaseUrl((current) => current === workingBaseUrl ? current : workingBaseUrl);
    }
  }, []);

  const loadDrawHistories = useCallback(async () => {
    const requestedUserId = userId;
    try {
      const data = await randishApi.getRandomHistories(apiBaseUrlCandidates, userId);
      if (userIdRef.current !== requestedUserId) {
        return;
      }
      syncWorkingApiBaseUrl();
      const entries = data
        .map(toDrawHistoryEntry)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      const recentRestaurants: Restaurant[] = [];
      const seenRestaurantIds = new Set<string>();
      entries.forEach((entry) => {
        if (!entry.restaurant || seenRestaurantIds.has(entry.restaurant.id)) {
          return;
        }
        seenRestaurantIds.add(entry.restaurant.id);
        recentRestaurants.push(entry.restaurant);
      });
      setDrawHistories(entries);
      setRandomHistory(recentRestaurants.slice(0, 8));
    } catch {
      // Keep the current in-app session history when the API is not reachable yet.
    }
  }, [apiBaseUrlCandidates, syncWorkingApiBaseUrl, userId]);

  const loadSavedRestaurants = useCallback(async () => {
    const requestedUserId = userId;
    try {
      const data = await randishApi.getFavorites(apiBaseUrlCandidates, userId);
      if (userIdRef.current !== requestedUserId) {
        return;
      }
      syncWorkingApiBaseUrl();
      setSavedRestaurants(data.map(toSavedRestaurantFromApi));
    } catch {
      // Keep local saved cards when the API is not reachable.
    }
  }, [apiBaseUrlCandidates, syncWorkingApiBaseUrl, userId]);

  const recordDrawForAnalytics = useCallback((restaurant: Restaurant) => {
    const createdAt = new Date().toISOString();
    setDrawHistories((current) => [
      {
        id: `local-${createdAt}-${restaurant.id}`,
        provider: (restaurant.externalProvider || 'RANDISH_SEED').toUpperCase(),
        providerPlaceId: getProviderPlaceId(restaurant),
        restaurantId: shouldPersistRestaurantId(restaurant) ? restaurant.id : null,
        restaurant,
        area: cleanTextOrNull(area === '現在地' ? '現在地周辺' : area),
        genre: cleanTextOrNull(genre === 'すべて' ? null : genre),
        budgetMin: parseBudgetNumber(budgetMin),
        budgetMax: parseBudgetNumber(budgetMax),
        rangeMeters: parseDistanceMeters(distance),
        createdAt,
      },
      ...current,
    ].slice(0, 100));
  }, [area, budgetMax, budgetMin, distance, genre]);

  useEffect(() => {
    if (didRestoreAuth.current) {
      return;
    }
    didRestoreAuth.current = true;
    let cancelled = false;

    Animated.parallel([
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 420,
        useNativeDriver: true,
      }),
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 6,
        tension: 70,
        useNativeDriver: true,
      }),
    ]).start();

    const restoreAuthSession = async () => {
      await new Promise((resolve) => setTimeout(resolve, 900));
      if (cancelled) {
        return;
      }

      const storedSession = await readStoredAuthSession();
      if (!storedSession?.accessToken) {
        setStage('login');
        return;
      }

      randishApi.setAuthToken(storedSession.accessToken);
      try {
        const auth = await randishApi.getCurrentUser(apiBaseUrlCandidates);
        if (cancelled) {
          return;
        }
        syncWorkingApiBaseUrl();
        await enterAuthenticatedSession(auth, storedSession.accessToken, storedSession.refreshToken);
      } catch (error) {
        if (isAuthTokenExpiredError(error) && storedSession.refreshToken) {
          try {
            const refreshedAuth = await randishApi.refreshOAuthSession(apiBaseUrlCandidates, {
              refreshToken: storedSession.refreshToken,
            });
            const refreshedAccessToken = refreshedAuth.accessToken;
            if (!refreshedAccessToken) {
              throw new Error('Supabase refresh did not return access token.');
            }
            if (cancelled) {
              return;
            }
            syncWorkingApiBaseUrl();
            await enterAuthenticatedSession(refreshedAuth, refreshedAccessToken, refreshedAuth.refreshToken ?? storedSession.refreshToken);
            return;
          } catch {
            // Fall through to clearing the stale session.
          }
        }
        randishApi.setAuthToken(null);
        if (!isApiConnectivityError(error)) {
          await clearStoredAuthSession();
        }
        if (!cancelled) {
          setStage('login');
        }
      }
    };

    restoreAuthSession();
    return () => {
      cancelled = true;
    };
  }, [apiBaseUrlCandidates, enterAuthenticatedSession, logoOpacity, logoScale, syncWorkingApiBaseUrl]);

  const apiParams = useMemo(
    () => {
      const cleanArea = area.trim();
      const areaCoordinatePreset = getCoordinatePresetForArea(area);
      const useAreaCoordinates = areaCoordinatePreset != null && cleanArea !== '現在地';
      const useCurrentLocationCoordinates = !useAreaCoordinates && (!cleanArea || cleanArea === '現在地');
      const coordinateSource =
        useAreaCoordinates
          ? { latitude: areaCoordinatePreset.preset.latitude, longitude: areaCoordinatePreset.preset.longitude }
          : useCurrentLocationCoordinates
            ? userLocation
            : null;

      return {
        area: buildAreaSearchKeyword(area),
        genre: genre === 'すべて' ? undefined : genre,
        budgetMin: Number(budgetMin || 0),
        budgetMax: Number(budgetMax || 999999),
        latitude: coordinateSource?.latitude,
        longitude: coordinateSource?.longitude,
        range: coordinateSource ? toHotPepperRange(distance) : undefined,
        distanceMeters: coordinateSource ? parseDistanceMeters(distance) ?? undefined : undefined,
      };
    },
    [area, budgetMax, budgetMin, distance, genre, userLocation],
  );

  const previewApiParams = useMemo(
    () => ({
      ...apiParams,
      genre: conditionRandom.genre ? undefined : apiParams.genre,
    }),
    [apiParams, conditionRandom.genre],
  );

  const drawApiParams = useMemo(
    () => apiParams,
    [apiParams],
  );

  const hasHiddenPreviewCondition = conditionRandom.area || conditionRandom.budget || conditionRandom.genre;

  const visibleRestaurants = restaurants;

  const loadGenreDiagnosticMessage = useCallback(async () => {
    const cleanGenre = genre.trim();
    if (!cleanGenre || cleanGenre === 'すべて' || conditionRandom.genre) {
      return null;
    }

    try {
      const genrelessParams = { ...previewApiParams, genre: undefined };
      const data = await randishApi.getRestaurants(apiBaseUrlCandidates, genrelessParams);
      syncWorkingApiBaseUrl();
      return buildGenreDiagnosticMessage(cleanGenre, data.map(normalizeRestaurant), area);
    } catch {
      return null;
    }
  }, [apiBaseUrlCandidates, area, conditionRandom.genre, genre, previewApiParams, syncWorkingApiBaseUrl]);

  const loadRestaurants = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await randishApi.getRestaurants(apiBaseUrlCandidates, previewApiParams);
      syncWorkingApiBaseUrl();
      const normalized = data
        .map(normalizeRestaurant)
        .filter((restaurant) => conditionRandom.genre || restaurantMatchesSelectedGenre(restaurant, genre));
      setRestaurants(normalized);
      const genreLabel = genre === 'すべて' ? 'すべてのジャンル' : genre;
      if (hasHiddenPreviewCondition) {
        const areaLabel = conditionRandom.area ? 'ランダムエリア' : area;
        setMessage(`${areaLabel}で${normalized.length}件を下準備中。STARTで伏せた条件を開きます。`);
        return;
      }
      if (normalized.length) {
        const apiGenres = buildGenreSummaryItems(normalized).join(' / ');
        setMessage(`${genreLabel}で${normalized.length}件から候補を整えました。APIジャンル: ${apiGenres}`);
      } else {
        const diagnosticMessage = await loadGenreDiagnosticMessage();
        setMessage(diagnosticMessage ?? `${genreLabel}に合うお店が見つかりませんでした。エリアやジャンルを変えてみてください。`);
      }
    } catch (error) {
      setRestaurants([]);
      logApiUiError('restaurant search failed', error, apiBaseUrlCandidates);
      const diagnosticMessage = isApiConnectivityError(error) ? null : await loadGenreDiagnosticMessage();
      setMessage(diagnosticMessage ?? API_CONNECTION_MESSAGE);
    } finally {
      setIsLoading(false);
    }
  }, [apiBaseUrlCandidates, area, conditionRandom.area, conditionRandom.genre, genre, hasHiddenPreviewCondition, loadGenreDiagnosticMessage, previewApiParams, syncWorkingApiBaseUrl]);

  useEffect(() => {
    loadRestaurants();
  }, [loadRestaurants]);

  const requestCurrentLocation = useCallback(async (mode: LocationRequestMode = 'sync-search') => {
    const Location = getOptionalLocationModule();
    if (!Location) {
      if (mode === 'sync-search' || areaRef.current === '現在地') {
        setLocationStatus('現在地取得には expo-location が必要です');
      }
      return null;
    }

    try {
      if (mode === 'sync-search' || areaRef.current === '現在地') {
        setLocationStatus('現在地を取得中...');
      }
      const permission = mode === 'background' && Location.getForegroundPermissionsAsync
        ? await Location.getForegroundPermissionsAsync()
        : await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        if (mode === 'sync-search' || areaRef.current === '現在地') {
          setLocationStatus('位置情報の許可がオフです');
        }
        return null;
      }

      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const coords = {
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
      };
      let label = areaRef.current;
      let prefecture: string | undefined;

      try {
        const places = await Location.reverseGeocodeAsync(coords);
        const place = places[0];
        label = place?.district || place?.city || place?.subregion || place?.name || area;
        prefecture =
          getPrefectureFromText(place?.region) ||
          getPrefectureFromText(`${place?.city ?? ''} ${place?.district ?? ''} ${place?.subregion ?? ''} ${place?.name ?? ''}`);
      } catch {
        label = areaRef.current;
      }

      const nextLocation = { ...coords, label };
      userLocationRef.current = nextLocation;
      setUserLocation(nextLocation);
      void writeLocalValue(LOCATION_CACHE_STORAGE_KEY, JSON.stringify({ ...nextLocation, updatedAt: Date.now() } satisfies StoredUserLocation));
      if (mode === 'sync-search') {
        setArea('現在地');
        setLocationStatus(formatLocationStatus(prefecture, label));
      } else if (areaRef.current === '現在地') {
        setArea('現在地');
        setLocationStatus(formatLocationStatus(prefecture, label));
      }
      return nextLocation;
    } catch {
      if (mode === 'sync-search' || areaRef.current === '現在地') {
        setLocationStatus('現在地を取得できませんでした');
      }
      return null;
    }
  }, []);

  useEffect(() => {
    if (stage !== 'main' || locationIntroState !== 'completed' || didAskLocation.current) {
      return;
    }
    didAskLocation.current = true;
    requestCurrentLocation('background');
  }, [locationIntroState, requestCurrentLocation, stage]);

  useEffect(() => {
    if (stage !== 'main') {
      return;
    }
    loadDrawHistories();
    loadSavedRestaurants();
  }, [loadDrawHistories, loadSavedRestaurants, stage]);

  useEffect(() => {
    if (activeTab === 'random' || mapRouletteStatus !== 'spinning') {
      return;
    }
    mapSpinRunIdRef.current += 1;
    mapPinProgress.stopAnimation();
    mapPinBounce.stopAnimation();
    setIsLoading(false);
    setMapRouletteStatus(mapCandidates.length ? 'candidatesReady' : 'idle');
  }, [activeTab, mapCandidates.length, mapPinBounce, mapPinProgress, mapRouletteStatus]);

  const runRandomAnimation = useCallback(() => {
    spinValue.setValue(0);
    resultRevealValue.setValue(0);
    Animated.timing(spinValue, {
      toValue: 1,
      duration: 1550,
      easing: Easing.out(Easing.exp),
      useNativeDriver: true,
    }).start();
  }, [resultRevealValue, spinValue]);

  const startDrawAnimation = useCallback((isEverythingRandom = false) => {
    const nextAnimationKey = pickNextDrawAnimation(drawAnimationKey);
    const nextAnimation = DRAW_ANIMATION_PROFILES[nextAnimationKey];
    setDrawAnimationKey(nextAnimationKey);
    setMessage(isEverythingRandom ? `ぜんぶおまかせ。${nextAnimation.loadingMessage}` : nextAnimation.loadingMessage);
    runRandomAnimation();
    return nextAnimation;
  }, [drawAnimationKey, runRandomAnimation]);

  const revealSelectedRestaurant = useCallback(() => {
    resultRevealValue.setValue(0);
    Animated.spring(resultRevealValue, {
      toValue: 1,
      friction: 6,
      tension: 95,
      useNativeDriver: true,
    }).start();
  }, [resultRevealValue]);

  const prepareDrawStage = useCallback((mode: DrawMode) => {
    setDrawMode(mode);
    setTravelRevealStep('hidden');
    setTravelDisplayArea(null);
    setSelectedRestaurant(null);
    setMapRouletteStatus('idle');
    setMapCandidates([]);
    setMapRouletteTarget(null);
    setMapRouletteError(null);
    previewCandidateQueryKeyRef.current = null;
    spinValue.setValue(0);
    resultRevealValue.setValue(0);
    setActiveTab('random');
    setMessage(mode === 'everything'
      ? '完全ランダムをセットしました。大きなカードを押すとスタートします。'
      : '条件抽選をセットしました。大きなカードを押すとスタートします。');
    scrollToContentTop();
  }, [resultRevealValue, scrollToContentTop, spinValue]);

  const prepareConditionDraw = useCallback(() => {
    prepareDrawStage('condition');
  }, [prepareDrawStage]);

  const prepareEverythingDraw = useCallback(() => {
    prepareDrawStage('everything');
  }, [prepareDrawStage]);

  const prepareTravelDraw = useCallback(() => {
    const travelPreset = pickRandomTravelAreaPreset();
    const travelPrefecture = getPresetPrefecture(travelPreset);
    const travelPrefectureLabel = travelPrefecture ?? 'どこかの県';
    const travelArea = travelPreset.label;
    const travelDisplay = `${travelPrefectureLabel} / ${travelArea}`;
    const travelSearchArea = getAreaPresetSearchValue(travelPreset);
    const nextGenre = pickRandomTravelGenre(genre);
    const nextDistance = pickRandomDifferent(DISTANCE_OPTIONS, distance);

    setArea(travelSearchArea);
    setGenre(nextGenre);
    setDistance(nextDistance);
    setBudgetMin('0');
    setBudgetMax('');
    setDrawMode('travel');
    setTravelRevealStep('hidden');
    setTravelDisplayArea(travelDisplay);
    setConditionRandom({ area: false, budget: true, distance: false, genre: false });
    setSelectedRestaurant(null);
    setMapRouletteStatus('idle');
    setMapCandidates([]);
    setMapRouletteTarget(null);
    setMapRouletteError(null);
    previewCandidateQueryKeyRef.current = null;
    spinValue.setValue(0);
    resultRevealValue.setValue(0);
    setLocationStatus(formatLocationStatus(travelPrefecture, travelArea));
    setActiveTab('random');
    setMessage('旅の行き先を伏せました。STARTするとジャンル、エリア、お店の順に開きます。');
    scrollToContentTop();
  }, [distance, genre, resultRevealValue, scrollToContentTop, spinValue]);

  const openAreaRandomConditions = useCallback(() => {
    const randomPreset = pickRandomTravelAreaPreset();
    const randomPrefecture = getPresetPrefecture(randomPreset);
    const randomArea = randomPreset.label;
    setArea(getAreaPresetSearchValue(randomPreset));
    setDrawMode('condition');
    setTravelRevealStep('hidden');
    setTravelDisplayArea(null);
    setConditionRandom((current) => ({ ...current, area: true }));
    setSelectedRestaurant(null);
    setLocationStatus(formatLocationStatus(randomPrefecture, randomArea));
    setActiveTab('search');
    setMessage('エリアをランダムにしました。条件画面では伏せて表示します。');
    scrollToContentTop();
  }, [scrollToContentTop]);

  const chooseRandomRestaurant = useCallback(async () => {
    const isTravelDraw = drawMode === 'travel';
    setActiveTab('random');
    setIsLoading(true);
    const drawAnimation = startDrawAnimation();
    const travelRevealTimers: ReturnType<typeof setTimeout>[] = [];
    const scheduleTravelReveal = (callback: () => void, delay: number) => {
      const timer = setTimeout(callback, delay);
      travelRevealTimers.push(timer);
    };
    if (isTravelDraw) {
      const travelGenreLabel = genre;
      const travelAreaLabel = travelDisplayArea ?? area;
      setTravelRevealStep('hidden');
      scheduleTravelReveal(() => {
        setTravelRevealStep('genre');
        setMessage(`ジャンルを開きました。${travelGenreLabel}`);
      }, 320);
      scheduleTravelReveal(() => {
        setTravelRevealStep('area');
        setMessage(`エリアを開きました。${travelAreaLabel}`);
      }, 920);
    }
    const latestLocation = userLocationRef.current;
    const effectiveDrawApiParams = areaRef.current.trim() === '現在地' && latestLocation
      ? {
        ...drawApiParams,
        area: undefined,
        latitude: latestLocation.latitude,
        longitude: latestLocation.longitude,
        range: toHotPepperRange(distance),
        distanceMeters: parseDistanceMeters(distance) ?? undefined,
      }
      : drawApiParams;
    const recentIds = new Set([selectedRestaurant?.id, ...randomHistory.map((item) => item.id)].filter((id): id is string => Boolean(id)));
    let alternativesCache: Restaurant[] | null = null;
    const fetchCandidatesWithParams = async (params: typeof drawApiParams, allowGenreMismatchForFilter = false) => {
      const data = await randishApi.getRestaurants(apiBaseUrlCandidates, params);
      syncWorkingApiBaseUrl();
      const normalizedCandidates = data.map(normalizeRestaurant);
      return allowGenreMismatchForFilter
        ? normalizedCandidates
        : normalizedCandidates.filter((restaurant) => restaurantMatchesSelectedGenre(restaurant, genre));
    };
    const chooseFromListWithParams = async (params: typeof drawApiParams, allowGenreMismatchForFilter: boolean, currentId?: string) => {
      const candidates = await fetchCandidatesWithParams(params, allowGenreMismatchForFilter);
      if (!candidates.length) {
        return null;
      }
      return pickFreshRestaurant(candidates, recentIds, currentId) ?? pickRandomRestaurant(candidates);
    };
    const loadAlternatives = async () => {
      if (alternativesCache) {
        return alternativesCache;
      }
      alternativesCache = await fetchCandidatesWithParams(effectiveDrawApiParams, false);
      return alternativesCache;
    };

    try {
      const chooseWithParams = async (params: typeof drawApiParams) => {
        const data = await randishApi.chooseRandom(apiBaseUrlCandidates, {
          userId,
          ...params,
        });
        syncWorkingApiBaseUrl();
        return normalizeRestaurant(data);
      };
      let normalized: Restaurant | null = null;
      let relaxedDrawMessage: string | null = null;
      let allowGenreMismatch = false;
      try {
        normalized = await chooseWithParams(effectiveDrawApiParams);
      } catch (error) {
        if (!isNoRestaurantMatchError(error)) {
          throw error;
        }
        normalized = await chooseFromListWithParams(effectiveDrawApiParams, false);
        if (normalized) {
          relaxedDrawMessage = '候補リストから一店を選びました。';
        } else {
          const fallbackAttempts = isTravelDraw
            ? [
              {
                params: { ...effectiveDrawApiParams, genre: undefined },
                message: `${genre}の候補が少ないので、ジャンルを広げました。`,
                allowGenreMismatch: true,
              },
              {
                params: { ...effectiveDrawApiParams, range: undefined },
                message: '近くの候補が少ないので、距離を広げました。',
                allowGenreMismatch: false,
              },
              {
                params: { ...effectiveDrawApiParams, genre: undefined, range: undefined },
                message: '候補が少ないので、ジャンルと距離を広げました。',
                allowGenreMismatch: true,
              },
              {
                params: { ...effectiveDrawApiParams, genre: undefined, latitude: undefined, longitude: undefined, range: undefined },
                message: '旅先エリアで広めに探しました。',
                allowGenreMismatch: true,
              },
            ]
            : [
              {
                params: { ...effectiveDrawApiParams, range: undefined },
                message: '近くの候補が少ないので、同じジャンルで距離を広げました。',
                allowGenreMismatch: false,
              },
            ];
          let lastError: unknown = error;
          for (const attempt of fallbackAttempts) {
            try {
              const candidate = await chooseWithParams(attempt.params);
              if (!attempt.allowGenreMismatch && !restaurantMatchesSelectedGenre(candidate, genre)) {
                const genreMatchedCandidate = await chooseFromListWithParams(attempt.params, false, candidate.id);
                if (!genreMatchedCandidate) {
                  lastError = new Error(`${genre}に合う候補が見つかりませんでした。`);
                  continue;
                }
                normalized = genreMatchedCandidate;
              } else {
                normalized = candidate;
              }
              relaxedDrawMessage = attempt.message;
              allowGenreMismatch = attempt.allowGenreMismatch;
              break;
            } catch (fallbackError) {
              lastError = fallbackError;
              if (!isNoRestaurantMatchError(fallbackError)) {
                throw fallbackError;
              }
              normalized = await chooseFromListWithParams(attempt.params, attempt.allowGenreMismatch);
              if (normalized) {
                relaxedDrawMessage = attempt.message;
                allowGenreMismatch = attempt.allowGenreMismatch;
                break;
              }
            }
          }
          if (!normalized) {
            throw lastError;
          }
        }
      }
      if (!allowGenreMismatch && !restaurantMatchesSelectedGenre(normalized, genre)) {
        let alternatives = await loadAlternatives();
        if (!alternatives.length) {
          alternatives = await fetchCandidatesWithParams({ ...effectiveDrawApiParams, range: undefined }, false);
          if (alternatives.length) {
            relaxedDrawMessage = '近くの候補が少ないので、同じジャンルで距離を広げました。';
          }
        }
        if (!alternatives.length) {
          throw new Error(`${genre}に合う候補が見つかりませんでした。`);
        }
        normalized = pickFreshRestaurant(alternatives, recentIds, normalized.id) ?? pickRandomRestaurant(alternatives);
      } else if (recentIds.has(normalized.id)) {
        const alternatives = await loadAlternatives();
        const freshAlternative = pickFreshRestaurant(alternatives, recentIds, normalized.id);
        if (freshAlternative) {
          normalized = freshAlternative;
        }
      }
      setSelectedRestaurant(normalized);
      setRandomHistory((current) => [normalized, ...current.filter((item) => item.id !== normalized.id)].slice(0, 8));
      recordDrawForAnalytics(normalized);
      const doneMessage = recentIds.has(normalized.id) ? '候補が一巡しています。条件を広げると新しい店が出やすくなります。' : drawAnimation.doneMessage;
      setMessage(isTravelDraw ? relaxedDrawMessage ?? '最後にお店を開きます。' : relaxedDrawMessage ?? doneMessage);
      if (isTravelDraw) {
        scheduleTravelReveal(() => {
          setTravelRevealStep('restaurant');
          setMessage(`旅の一店を開きました。${normalized.name}`);
        }, 1500);
      }
      const resultRevealDelay = isTravelDraw ? 1680 : 980;
      setTimeout(revealSelectedRestaurant, resultRevealDelay);
      setTimeout(scrollToRandomResult, resultRevealDelay + 320);
    } catch (error) {
      travelRevealTimers.forEach(clearTimeout);
      if (isTravelDraw) {
        setTravelRevealStep('hidden');
      }
      setSelectedRestaurant(null);
      logApiUiError('condition draw failed', error, apiBaseUrlCandidates);
      const diagnosticMessage = isApiConnectivityError(error) ? null : await loadGenreDiagnosticMessage();
      const noMatchError = isNoRestaurantMatchError(error) || toDebugErrorMessage(error).includes('候補が見つかりません');
      setMessage(isTravelDraw && noMatchError
        ? 'この旅先は候補が少なすぎました。もう一度押すと別の旅先で探せます。'
        : noMatchError
          ? diagnosticMessage ?? '条件に合う候補が見つかりませんでした。距離・予算・ジャンルを少し広げてください。'
          : diagnosticMessage ?? API_DRAW_MESSAGE);
    } finally {
      setIsLoading(false);
    }
  }, [apiBaseUrlCandidates, area, distance, drawApiParams, drawMode, genre, loadGenreDiagnosticMessage, randomHistory, recordDrawForAnalytics, revealSelectedRestaurant, scrollToRandomResult, selectedRestaurant, startDrawAnimation, syncWorkingApiBaseUrl, travelDisplayArea, userId]);

  const chooseEverythingRandom = useCallback(async () => {
    setActiveTab('random');
    setIsLoading(true);
    const drawAnimation = startDrawAnimation(true);
    const recentIds = new Set([selectedRestaurant?.id, ...randomHistory.map((item) => item.id)].filter((id): id is string => Boolean(id)));

    try {
      const data = await randishApi.chooseRandom(apiBaseUrlCandidates, {
        userId,
      });
      syncWorkingApiBaseUrl();
      let normalized = normalizeRestaurant(data);
      if (recentIds.has(normalized.id)) {
        const alternatives = (await randishApi.getRestaurants(apiBaseUrlCandidates)).map(normalizeRestaurant);
        const freshAlternative = pickFreshRestaurant(alternatives, recentIds, normalized.id);
        if (freshAlternative) {
          normalized = freshAlternative;
        }
      }
      setSelectedRestaurant(normalized);
      setRandomHistory((current) => [normalized, ...current.filter((item) => item.id !== normalized.id)].slice(0, 8));
      recordDrawForAnalytics(normalized);
      setMessage(recentIds.has(normalized.id) ? 'ぜんぶおまかせの候補が一巡しています。条件を少し変えると広がります。' : `ぜんぶおまかせ。${drawAnimation.doneMessage}`);
      setTimeout(revealSelectedRestaurant, 980);
      setTimeout(scrollToRandomResult, 1300);
    } catch (error) {
      setSelectedRestaurant(null);
      logApiUiError('everything draw failed', error, apiBaseUrlCandidates);
      setMessage(API_DRAW_MESSAGE);
    } finally {
      setIsLoading(false);
    }
  }, [apiBaseUrlCandidates, randomHistory, recordDrawForAnalytics, revealSelectedRestaurant, scrollToRandomResult, selectedRestaurant, startDrawAnimation, syncWorkingApiBaseUrl, userId]);

  const triggerRouletteHaptic = useCallback((final = false) => {
    const Haptics = getOptionalHapticsModule();
    if (!Haptics) {
      return;
    }
    if (final && Haptics.notificationAsync && Haptics.NotificationFeedbackType?.Success) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return;
    }
    if (Haptics.impactAsync) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle?.Light);
    }
  }, []);

  const buildCandidateQuery = useCallback(async (): Promise<CandidateQuery | null> => {
    const cleanArea = areaRef.current.trim();
    let center: UserLocation | null = null;
    if (!cleanArea || cleanArea === '現在地') {
      center = userLocationRef.current;
      if (!center) {
        setMapRouletteStatus('locating');
        center = await requestCurrentLocation('sync-search');
      }
    } else {
      center = getSearchOriginForArea(cleanArea, null);
    }

    if (!center) {
      return null;
    }

    const radius = parseDistanceMeters(distance) ?? 1500;
    const category = genre === 'すべて' || conditionRandom.genre ? undefined : genre;
    const priceRange = conditionRandom.budget ? undefined : budgetMax || undefined;
    const centerKey = `${center.label}:${center.latitude.toFixed(5)},${center.longitude.toFixed(5)}`;
    const key = [
      radius,
      category ?? 'all',
      priceRange ?? 'any',
      'open:any',
      centerKey,
      cleanArea || '現在地',
    ].join('|');
    return { key, center, radius, category, priceRange };
  }, [budgetMax, conditionRandom.budget, conditionRandom.genre, distance, genre, requestCurrentLocation]);

  const getUsableCandidateCache = useCallback((query: CandidateQuery) => {
    const cached = candidateCacheRef.current;
    if (!cached) {
      console.info('[RANDISH MAP] 新規店舗検索: 候補キャッシュなし');
      return null;
    }
    if (cached.key !== query.key) {
      console.info('[RANDISH MAP] キャッシュ無効化: 条件変更', { previousKey: cached.key, nextKey: query.key });
      return null;
    }
    const ageMs = Date.now() - cached.fetchedAt;
    if (ageMs > getSafePlacesCacheTtlMs()) {
      console.info('[RANDISH MAP] キャッシュ無効化: TTL超過', { ageMs, ttlMs: getSafePlacesCacheTtlMs() });
      return null;
    }
    const movedMeters = distanceBetweenLocationsMeters(cached.center, query.center);
    if (movedMeters > getSafePlacesCacheDistanceMeters()) {
      console.info('[RANDISH MAP] キャッシュ無効化: 現在地移動', { movedMeters, threshold: getSafePlacesCacheDistanceMeters() });
      return null;
    }
    console.info('[RANDISH MAP] キャッシュヒット', { count: cached.candidates.length, source: cached.source });
    return cached;
  }, []);

  const loadCandidatePool = useCallback(async (query: CandidateQuery) => {
    const cached = getUsableCandidateCache(query);
    if (cached) {
      console.info('[RANDISH MAP] キャッシュからの再抽選');
      setMapCandidates(cached.candidates);
      setMapRouletteStatus(cached.candidates.length ? 'candidatesReady' : 'empty');
      return cached;
    }

    setMapRouletteStatus('searching');
    console.info('[RANDISH MAP] 新規店舗検索', {
      radius: query.radius,
      category: query.category ?? 'all',
      priceRange: query.priceRange ?? 'any',
    });
    const response = await randishApi.getNearbyPlaces(apiBaseUrlCandidates, {
      latitude: query.center.latitude,
      longitude: query.center.longitude,
      radius: query.radius,
      category: query.category,
      priceRange: query.priceRange,
      openNow: query.openNow,
    });
    syncWorkingApiBaseUrl();
    const nextCache: CandidateCacheEntry = {
      key: query.key,
      center: query.center,
      candidates: response.places ?? [],
      fetchedAt: Date.now(),
      usedIds: [],
      lastSelectedId: null,
      source: response.source,
    };
    candidateCacheRef.current = nextCache;
    setMapCandidates(nextCache.candidates);
    setMapRouletteStatus(nextCache.candidates.length ? 'candidatesReady' : 'empty');
    return nextCache;
  }, [apiBaseUrlCandidates, getUsableCandidateCache, syncWorkingApiBaseUrl]);

  const chooseMapRouletteRestaurant = useCallback(async () => {
    if (mapRouletteStatus === 'searching' || mapRouletteStatus === 'spinning') {
      setMessage(mapRouletteStatus === 'searching'
        ? '候補を読み込み中です。ピンが表示されたらSTARTできます。'
        : 'いま候補を選んでいます。');
      return;
    }
    setActiveTab('random');
    setIsLoading(true);
    setMapRouletteError(null);
    setSelectedRestaurant(null);
    resultRevealValue.setValue(0);
    mapPinProgress.stopAnimation();
    mapPinBounce.stopAnimation();
    mapPinProgress.setValue(0);
    mapPinBounce.setValue(0);

    try {
      const query = await buildCandidateQuery();
      if (!query) {
        setMapRouletteStatus('error');
        setMapRouletteError('現在地または座標付きエリアを選んでください。');
        setMessage('検索地点の座標が取れませんでした。駅・市区町村を選び直すか、現在地を取得してください。');
        setIsLoading(false);
        return;
      }

      const cacheEntry = await loadCandidatePool(query);
      if (cacheEntry.candidates.length === 0) {
        setMapRouletteStatus('empty');
        setMapRouletteError('条件に合う店舗が見つかりませんでした。');
        setMessage('条件に合う店舗が見つかりませんでした。距離を広げるか、条件を減らしてください。');
        setIsLoading(false);
        return;
      }

      const { selected, nextUsedIds } = pickCandidateFromPool(
        cacheEntry.candidates,
        cacheEntry.usedIds,
        cacheEntry.lastSelectedId,
      );
      if (!selected) {
        setMapRouletteStatus('empty');
        setMapRouletteError('候補店舗がありません。');
        setIsLoading(false);
        return;
      }

      const runId = mapSpinRunIdRef.current + 1;
      mapSpinRunIdRef.current = runId;
      setMapRouletteTarget(selected);
      setMapRouletteStatus('spinning');
      setMessage(cacheEntry.candidates.length === 1
        ? '候補が1件だけ見つかりました。このお店で止めます。'
        : '候補ピンの中から一店を選んでいます。');
      triggerRouletteHaptic(false);

      const finishSelection = () => {
        if (mapSpinRunIdRef.current !== runId) {
          return;
        }
        const normalized = candidatePlaceToRestaurant(selected, areaRef.current, genre);
        candidateCacheRef.current = {
          ...cacheEntry,
          usedIds: nextUsedIds,
          lastSelectedId: selected.id,
        };
        setSelectedRestaurant(normalized);
        setRandomHistory((current) => [normalized, ...current.filter((item) => item.id !== normalized.id)].slice(0, 8));
        recordDrawForAnalytics(normalized);
        setMapRouletteStatus('result');
        setMessage(cacheEntry.candidates.length === 1
          ? '候補が1件だけだったため、このお店に決まりました。'
          : '今日の一店が決まりました。');
        setIsLoading(false);
        triggerRouletteHaptic(true);
        revealSelectedRestaurant();
        setTimeout(scrollToRandomResult, 220);
      };

      if (reduceMotionEnabled) {
        mapPinProgress.setValue(1);
        setTimeout(finishSelection, 180);
        return;
      }

      Animated.sequence([
        Animated.timing(mapPinProgress, {
          toValue: 1,
          duration: 2800,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(mapPinBounce, {
          toValue: 1,
          friction: 3,
          tension: 130,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) {
          finishSelection();
        }
      });
    } catch (error) {
      setMapRouletteStatus('error');
      setMapCandidates([]);
      setMapRouletteTarget(null);
      logApiUiError('nearby map roulette failed', error, apiBaseUrlCandidates);
      const noKey = error instanceof RandishApiError && error.status === 400;
      const messageText = noKey
        ? '近隣検索の候補を取得できませんでした。Geoapify/Hot Pepperの設定を確認してください。'
        : isApiConnectivityError(error)
          ? '店舗検索APIに接続できませんでした。ネットワークを確認してください。'
          : '店舗検索APIでエラーが発生しました。少し時間をおいて再度お試しください。';
      setMapRouletteError(messageText);
      setMessage(messageText);
      setIsLoading(false);
    }
  }, [
    apiBaseUrlCandidates,
    buildCandidateQuery,
    genre,
    loadCandidatePool,
    mapPinBounce,
    mapPinProgress,
    mapRouletteStatus,
    recordDrawForAnalytics,
    reduceMotionEnabled,
    resultRevealValue,
    revealSelectedRestaurant,
    scrollToRandomResult,
    triggerRouletteHaptic,
  ]);

  useEffect(() => {
    if (activeTab !== 'random' || drawMode === 'everything') {
      return undefined;
    }
    if (mapRouletteStatus === 'searching' || mapRouletteStatus === 'spinning' || mapRouletteStatus === 'result') {
      return undefined;
    }

    let cancelled = false;
    const loadPreviewCandidates = async () => {
      const query = await buildCandidateQuery();
      if (cancelled || !query) {
        return;
      }
      const alreadyLoadedForQuery =
        previewCandidateQueryKeyRef.current === query.key &&
        (mapRouletteStatus === 'candidatesReady' || mapRouletteStatus === 'empty' || mapRouletteStatus === 'error');
      if (alreadyLoadedForQuery) {
        return;
      }

      previewCandidateQueryKeyRef.current = query.key;
      setMapRouletteError(null);
      setMapRouletteTarget(null);
      mapPinProgress.stopAnimation();
      mapPinBounce.stopAnimation();
      mapPinProgress.setValue(0);
      mapPinBounce.setValue(0);

      try {
        const cacheEntry = await loadCandidatePool(query);
        if (cancelled) {
          return;
        }
        if (cacheEntry.candidates.length) {
          setMessage(`${query.center.label} 周辺に${cacheEntry.candidates.length}件の候補を表示しました。STARTで一店を選びます。`);
        } else {
          setMapRouletteError('条件に合う店舗が見つかりませんでした。');
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        setMapRouletteStatus('error');
        setMapCandidates([]);
        setMapRouletteTarget(null);
        logApiUiError('nearby preview failed', error, apiBaseUrlCandidates);
        setMapRouletteError(isApiConnectivityError(error)
          ? '店舗検索APIに接続できませんでした。'
          : '候補の読み込みに失敗しました。');
      }
    };

    void loadPreviewCandidates();

    return () => {
      cancelled = true;
    };
  }, [
    activeTab,
    apiBaseUrlCandidates,
    buildCandidateQuery,
    drawMode,
    loadCandidatePool,
    mapPinBounce,
    mapPinProgress,
  ]);

  const startPreparedDraw = useCallback(async () => {
    if (isLoading) {
      return;
    }
    const currentTicket = mealTicketState.current;
    if (FEATURE_MEAL_TICKETS_ENABLED && !currentTicket.available) {
      if (currentTicket.proOnly && !mealTicketState.isProUser) {
        setMessage(`深夜の抽選はPro限定です。${mealTicketState.nextUnlockLabel}で朝の一回が使えます。`);
      } else if (currentTicket.used) {
        setMessage(`${currentTicket.label}の抽選枠は使用済みです。${mealTicketState.nextUnlockLabel}で次の一回が使えます。`);
      } else {
        setMessage(`${currentTicket.label}の抽選枠は${currentTicket.timeLabel}です。${currentTicket.countdownLabel}で使えます。`);
      }
      scrollToContentTop();
      return;
    }
    if (drawMode === 'everything') {
      chooseEverythingRandom();
      return;
    }
    await chooseMapRouletteRestaurant();
  }, [chooseEverythingRandom, chooseMapRouletteRestaurant, drawMode, isLoading, mealTicketState, scrollToContentTop]);

  const completeLocationIntro = useCallback(async () => {
    setLocationIntroState('completed');
    await writeLocalValue(LOCATION_INTRO_STORAGE_KEY, 'completed');
  }, []);

  const useCurrentLocationFromIntro = useCallback(async () => {
    if (locationIntroWorking) {
      return;
    }
    setLocationIntroWorking(true);
    const nextLocation = await requestCurrentLocation('sync-search');
    setLocationIntroWorking(false);
    if (nextLocation) {
      didAskLocation.current = true;
      await completeLocationIntro();
      setActiveTab('home');
      setMessage('現在地を使えるようになりました。近くのお店から選べます。');
      return;
    }
    setMessage('Randishは現在地からお店を選ぶため、位置情報の許可が必要です。');
  }, [completeLocationIntro, locationIntroWorking, requestCurrentLocation]);

  const saveRestaurantToAlbum = useCallback(async (restaurant: Restaurant) => {
    const localFavorite = toSavedRestaurantFromSelection({
      restaurant,
      userId,
      area,
      genre,
      budgetMin,
      budgetMax,
      distance,
    });

    if (savedRestaurants.some((item) => isSameSavedRestaurant(item, localFavorite))) {
      setMessage('このお店はすでにお気に入りに入っています。');
      return;
    }

    setSavedRestaurants((current) => {
      return [localFavorite, ...current];
    });
    if (shouldPersistRestaurantId(restaurant)) {
      savedDetailCacheRef.current.set(localFavorite.id, restaurant);
    }
    setSavedDetail({ favorite: localFavorite, restaurant });
    setSavedDetailError(null);
    setSavedDetailLoadingId(null);
    setMessage('お気に入りに追加しました。♡が保存済みになりました。');

    try {
      const favorite = await randishApi.addFavorite(apiBaseUrlCandidates, {
        userId,
        restaurantId: localFavorite.restaurantId,
        provider: localFavorite.provider,
        providerPlaceId: localFavorite.providerPlaceId,
        savedArea: localFavorite.savedArea,
        savedGenre: localFavorite.savedGenre,
        savedBudgetMin: localFavorite.savedBudgetMin,
        savedBudgetMax: localFavorite.savedBudgetMax,
        savedRangeMeters: localFavorite.savedRangeMeters,
        userMemo: localFavorite.userMemo,
        userTags: localFavorite.userTags,
      });
      syncWorkingApiBaseUrl();
      const syncedFavorite = {
        ...toSavedRestaurantFromApi(favorite),
        snapshot: localFavorite.snapshot,
      };
      savedDetailCacheRef.current.delete(localFavorite.id);
      if (shouldPersistRestaurantId(restaurant)) {
        savedDetailCacheRef.current.set(syncedFavorite.id, localFavorite.snapshot ?? restaurant);
      }
      setSavedRestaurants((current) => {
        const existing = current.find((item) => isSameSavedRestaurant(item, syncedFavorite));
        const mergedFavorite = {
          ...syncedFavorite,
          photoUri: existing?.photoUri ?? localFavorite.photoUri ?? null,
          photoTakenAt: existing?.photoTakenAt ?? localFavorite.photoTakenAt ?? null,
        };
        return [
          mergedFavorite,
          ...current.filter((item) => !isSameSavedRestaurant(item, mergedFavorite)),
        ];
      });
      setSavedDetail((current) => (
        current?.favorite.id === localFavorite.id
          ? {
            favorite: {
              ...syncedFavorite,
              photoUri: current.favorite.photoUri ?? localFavorite.photoUri ?? null,
              photoTakenAt: current.favorite.photoTakenAt ?? localFavorite.photoTakenAt ?? null,
            },
            restaurant: localFavorite.snapshot ?? restaurant,
          }
          : current
      ));
      setMessage('お気に入りを同期しました。♡は保存済みです。');
    } catch {
      setMessage('端末内のお気に入りに追加しました。API接続後はサーバーにも反映できます。');
    }
  }, [apiBaseUrlCandidates, area, budgetMax, budgetMin, distance, genre, savedRestaurants, syncWorkingApiBaseUrl, userId]);

  const saveSelectedRestaurant = useCallback(async () => {
    if (!selectedRestaurant) {
      setMessage('先に一店を抽選してください。');
      return;
    }

    await saveRestaurantToAlbum(selectedRestaurant);
  }, [saveRestaurantToAlbum, selectedRestaurant]);

  const isRestaurantSaved = useCallback((restaurant: Restaurant) => {
    const provider = (restaurant.externalProvider || 'RANDISH_SEED').toUpperCase();
    const providerPlaceId = getProviderPlaceId(restaurant);
    return savedRestaurants.some((item) => item.provider === provider && item.providerPlaceId === providerPlaceId);
  }, [savedRestaurants]);

  const openMap = useCallback(() => {
    if (!selectedRestaurant) return;
    if (selectedRestaurant.googleMapsUri) {
      Linking.openURL(selectedRestaurant.googleMapsUri);
      return;
    }
    const query = encodeURIComponent(`${selectedRestaurant.name} ${selectedRestaurant.address}`);
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`);
  }, [selectedRestaurant]);

  const openSavedMap = useCallback((restaurant: Restaurant) => {
    if (restaurant.googleMapsUri) {
      Linking.openURL(restaurant.googleMapsUri);
      return;
    }
    const query = encodeURIComponent(`${restaurant.name} ${restaurant.address}`);
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`);
  }, []);

  const updateSavedFoodPhoto = useCallback((favoriteId: string, photoUri: string) => {
    const photoTakenAt = new Date().toISOString();
    setSavedRestaurants((current) => current.map((item) => (
      item.id === favoriteId ? { ...item, photoUri, photoTakenAt } : item
    )));
    setSavedDetail((current) => (
      current?.favorite.id === favoriteId
        ? { ...current, favorite: { ...current.favorite, photoUri, photoTakenAt } }
        : current
    ));
    setMessage('ごはん写真をアルバムに追加しました。');
  }, []);

  const requestFoodPhotoFromLibrary = useCallback(async (): Promise<string | null> => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('写真を選べません', 'アルバムに残すには、写真へのアクセスを許可してください。');
      return null;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.85,
    });

    if (result.canceled || !result.assets?.[0]?.uri) {
      return null;
    }

    return result.assets[0].uri;
  }, []);

  const requestFoodPhotoUri = useCallback(async (): Promise<string | null> => {
    try {
      const currentPermission = await ImagePicker.getCameraPermissionsAsync();
      const permission = currentPermission.granted
        ? currentPermission
        : await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        return await new Promise<string | null>((resolve) => {
          Alert.alert(
            'カメラを使えません',
            'ごはん写真を撮るには、カメラの使用を許可してください。写真から選ぶこともできます。',
            [
              { text: '写真から選ぶ', onPress: () => { void requestFoodPhotoFromLibrary().then(resolve); } },
              { text: '設定を開く', onPress: () => { void Linking.openSettings(); resolve(null); } },
              { text: '閉じる', style: 'cancel', onPress: () => resolve(null) },
            ],
            { onDismiss: () => resolve(null) },
          );
        });
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.85,
      });

      if (result.canceled || !result.assets?.[0]?.uri) {
        return null;
      }

      return result.assets[0].uri;
    } catch {
      return await new Promise<string | null>((resolve) => {
        Alert.alert(
          'カメラを起動できませんでした',
          '開発ビルドの権限が未反映か、端末側でカメラを開けない状態です。写真から選ぶこともできます。',
          [
            { text: '写真から選ぶ', onPress: () => { void requestFoodPhotoFromLibrary().then(resolve); } },
            { text: '閉じる', style: 'cancel', onPress: () => resolve(null) },
          ],
          { onDismiss: () => resolve(null) },
        );
      });
    }
  }, [requestFoodPhotoFromLibrary]);

  const attachSavedFoodPhoto = useCallback(async (favoriteId: string) => {
    const photoUri = await requestFoodPhotoUri();
    if (!photoUri) {
      return;
    }
    updateSavedFoodPhoto(favoriteId, photoUri);
  }, [requestFoodPhotoUri, updateSavedFoodPhoto]);

  const addAlbumPhoto = useCallback((photoUri: string, title: string, subtitle: string) => {
    const createdAt = new Date().toISOString();
    setAlbumPhotos((current) => {
      const next = [
        {
          id: `album-photo-${createdAt}`,
          photoUri,
          createdAt,
          title,
          subtitle,
        },
        ...current,
      ];
      return (subscription.isPro ? next : next.filter((item) => isInFreeAlbumWindow(item.createdAt))).slice(0, subscription.isPro ? 360 : 90);
    });
  }, [subscription.isPro]);

  const captureAlbumPhoto = useCallback(async () => {
    const photoUri = await requestFoodPhotoUri();
    if (!photoUri) {
      return;
    }

    addAlbumPhoto(photoUri, '今日の一枚', 'RANDISHアルバム');
    setMessage('今日の一枚をアルバムに追加しました。');
  }, [addAlbumPhoto, requestFoodPhotoUri]);

  const uploadAlbumPhoto = useCallback(async () => {
    const photoUri = await requestFoodPhotoFromLibrary();
    if (!photoUri) {
      return;
    }

    addAlbumPhoto(photoUri, 'スマホから追加', '写真フォルダからアルバムへ');
    setMessage('スマホの写真をアルバムに追加しました。');
  }, [addAlbumPhoto, requestFoodPhotoFromLibrary]);

  const openSavedRestaurant = useCallback(async (favorite: SavedRestaurant) => {
    setSavedDetailError(null);
    const cached = savedDetailCacheRef.current.get(favorite.id);
    if (cached && favorite.provider === 'RANDISH_SEED') {
      setSavedDetail({ favorite, restaurant: cached });
      return;
    }

    setSavedDetailLoadingId(favorite.id);
    if (favorite.snapshot) {
      setSavedDetail({ favorite, restaurant: favorite.snapshot });
    }
    try {
      const detail = await randishApi.getFavoriteRestaurant(apiBaseUrlCandidates, favorite.id);
      syncWorkingApiBaseUrl();
      const normalized = normalizeRestaurant(detail);
      if (favorite.provider === 'RANDISH_SEED') {
        savedDetailCacheRef.current.set(favorite.id, normalized);
      }
      setSavedDetail({ favorite: { ...favorite, snapshot: normalized }, restaurant: normalized });
      setSavedRestaurants((current) => current.map((item) => item.id === favorite.id ? { ...item, snapshot: normalized } : item));
    } catch {
      if (!favorite.snapshot) {
        setSavedDetail(null);
      }
      setSavedDetailError('最新情報を取得できませんでした。少し時間をおいてもう一度試してください。');
    } finally {
      setSavedDetailLoadingId(null);
    }
  }, [apiBaseUrlCandidates, syncWorkingApiBaseUrl]);

  const openHistoryRestaurant = useCallback(async (entry: DrawHistoryEntry) => {
    if (entry.restaurant) {
      setSelectedRestaurant(entry.restaurant);
      setActiveTab('random');
      setMessage('履歴から店舗情報を表示しました。');
      setTimeout(scrollToRandomResult, 160);
      return;
    }
    if (entry.id.startsWith('local-')) {
      setHistoryDetailError('この履歴は端末内の一時履歴です。アプリを開き直すと最新情報を取得できません。');
      return;
    }

    setHistoryDetailError(null);
    setHistoryDetailLoadingId(entry.id);
    try {
      const detail = await randishApi.getRandomHistoryRestaurant(apiBaseUrlCandidates, entry.id);
      syncWorkingApiBaseUrl();
      const normalized = normalizeRestaurant(detail);
      setDrawHistories((current) => current.map((item) => (
        item.id === entry.id ? { ...item, restaurant: normalized } : item
      )));
      setRandomHistory((current) => [normalized, ...current.filter((item) => item.id !== normalized.id)].slice(0, 8));
      setSelectedRestaurant(normalized);
      setActiveTab('random');
      setMessage('履歴から店舗情報を再取得しました。');
      setTimeout(scrollToRandomResult, 160);
    } catch {
      setHistoryDetailError('店舗情報を取得できませんでした。必要なときだけ再取得する設計なので、少し時間をおいてもう一度押してください。');
    } finally {
      setHistoryDetailLoadingId(null);
    }
  }, [apiBaseUrlCandidates, scrollToRandomResult, syncWorkingApiBaseUrl]);

  const resetMapRouletteView = () => {
    setMapRouletteStatus('idle');
    setMapCandidates([]);
    setMapRouletteTarget(null);
    setMapRouletteError(null);
    previewCandidateQueryKeyRef.current = null;
    mapPinProgress.setValue(0);
    mapPinBounce.setValue(0);
  };

  const prepareCurrentLocationSearch = async () => {
    if (isLoading) {
      return;
    }
    setMessage('現在地を確認しています...');
    const refreshedLocation = await requestCurrentLocation('sync-search');
    const nextLocation = refreshedLocation ?? userLocationRef.current;
    if (!nextLocation) {
      setMessage('現在地を取得できませんでした。位置情報の許可を確認してください。');
      return;
    }

    areaRef.current = '現在地';
    setArea('現在地');
    setLocationStatus(`${nextLocation.label} 周辺から探します`);
    setDrawMode('condition');
    setTravelRevealStep('hidden');
    setTravelDisplayArea(null);
    setConditionRandom((current) => ({ ...current, area: false }));
    setSelectedRestaurant(null);
    resetMapRouletteView();
    setActiveTab('random');
    setMessage('現在地周辺の候補を探せるようにしました。PRESS STARTで一店を決めます。');
    scrollToContentTop();
  };

  const updateGenre = (value: string) => {
    setGenre(value);
    setDrawMode('condition');
    setTravelRevealStep('hidden');
    setTravelDisplayArea(null);
    setConditionRandom((current) => ({ ...current, genre: false }));
    setSelectedRestaurant(null);
    resetMapRouletteView();
  };

  const updateArea = (value: string) => {
    const preset = getAreaPreset(value);
    const inferredPrefecture = getPrefectureFromText(value);
    if (value === '現在地') {
      setLocationStatus(userLocation ? `${userLocation.label} 周辺から探します` : '現在地を確認できます');
    } else if (preset?.useCoordinates === false) {
      setLocationStatus(formatAreaPresetStatus(preset));
    } else if (preset) {
      setLocationStatus(formatAreaPresetStatus(preset));
    } else if (isPrefectureName(value)) {
      setLocationStatus(formatLocationStatus(value, '全域'));
    } else if (inferredPrefecture) {
      setLocationStatus(formatLocationStatus(inferredPrefecture, value));
    } else {
      setLocationStatus(formatLocationStatus(undefined, value));
    }
    setArea(value);
    setDrawMode('condition');
    setTravelRevealStep('hidden');
    setTravelDisplayArea(null);
    setConditionRandom((current) => ({ ...current, area: false }));
    setSelectedRestaurant(null);
    resetMapRouletteView();
  };

  const updateBudgetMin = (value: string) => {
    setBudgetMin(value);
    setDrawMode('condition');
    setTravelRevealStep('hidden');
    setTravelDisplayArea(null);
    setConditionRandom((current) => ({ ...current, budget: false }));
    setSelectedRestaurant(null);
    resetMapRouletteView();
  };

  const updateBudgetMax = (value: string) => {
    setBudgetMin('0');
    setBudgetMax(value);
    setDrawMode('condition');
    setTravelRevealStep('hidden');
    setTravelDisplayArea(null);
    setConditionRandom((current) => ({ ...current, budget: false }));
    setSelectedRestaurant(null);
    resetMapRouletteView();
  };

  const updateDistance = (value: string) => {
    setDistance(value);
    setDrawMode('condition');
    setTravelRevealStep('hidden');
    setTravelDisplayArea(null);
    setConditionRandom((current) => ({ ...current, distance: false }));
    setSelectedRestaurant(null);
    resetMapRouletteView();
  };

  const markConditionRandom = useCallback((field: ConditionRandomField) => {
    setDrawMode('condition');
    setTravelRevealStep('hidden');
    setTravelDisplayArea(null);
    setConditionRandom((current) => ({ ...current, [field]: !current[field] }));
    setSelectedRestaurant(null);
    setMapRouletteStatus('idle');
    setMapCandidates([]);
    setMapRouletteTarget(null);
    setMapRouletteError(null);
    previewCandidateQueryKeyRef.current = null;
    mapPinProgress.setValue(0);
    mapPinBounce.setValue(0);
  }, [mapPinBounce, mapPinProgress]);

  const openRandomTab = useCallback(() => {
    setDrawMode('condition');
    setTravelRevealStep('hidden');
    setTravelDisplayArea(null);
    setActiveTab('random');
    setMessage('抽選カードを押すとスタートします。');
    if (locationIntroState === 'completed' && areaRef.current.trim() === '現在地') {
      void requestCurrentLocation('background');
    }
    scrollToContentTop();
  }, [locationIntroState, requestCurrentLocation, scrollToContentTop]);

  const handleFooterPress = useCallback((tab: TabKey) => {
    if (tab === 'random') {
      openRandomTab();
      return;
    }
    setActiveTab(tab);
    scrollToContentTop(false);
  }, [openRandomTab, scrollToContentTop]);

  const handleLogout = useCallback(() => {
    randishApi.setAuthToken(null);
    setFreshOAuthSessionPreferred(true);
    void Linking.getInitialURL()
      .then((url) => {
        if (url && isOAuthCallbackUrl(url)) {
          consumedOAuthCallbackUrls.add(url);
        }
      })
      .catch(() => undefined);
    userIdRef.current = APP_USER_ID;
    didAskLocation.current = false;
    savedDetailCacheRef.current.clear();
    setUserId(APP_USER_ID);
    setProfileName('RANDISH Guest');
    setProfileImageUri(null);
    setActiveTab('home');
    setRestaurants([]);
    setSelectedRestaurant(null);
    setRandomHistory([]);
    setDrawHistories([]);
    setSavedRestaurants([]);
    setAlbumPhotos([]);
    setSavedDetail(null);
    setSavedDetailLoadingId(null);
    setSavedDetailError(null);
    setHistoryDetailLoadingId(null);
    setHistoryDetailError(null);
    setIsLoading(false);
    setMessage('条件を選んで、今日の一店を決めましょう。');
    setStage('loggedOut');
  }, []);
  if (stage === 'splash') {
    return (
      <SafeAreaView style={styles.splashScreen}>
        <StatusBar barStyle="dark-content" />
        <Animated.Image
          source={RANDISH_LOGO}
          style={[styles.splashLogo, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}
          resizeMode="contain"
        />
        <Text style={styles.splashTitle}>RANDISH</Text>
      </SafeAreaView>
    );
  }

  if (stage === 'login') {
    return (
      <LoginScreen
        apiBaseUrlCandidates={apiBaseUrlCandidates}
        uiText={UI_TEXT[appLanguage]}
        locationStatus={locationStatus}
        freshSessionPreferred={freshOAuthSessionPreferred}
        onApiConnected={syncWorkingApiBaseUrl}
        onAuthenticated={enterAuthenticatedSession}
        onStart={enterGuestSession}
      />
    );
  }

  if (stage === 'loggedOut') {
    return (
      <LoggedOutScreen
        uiText={UI_TEXT[appLanguage]}
        onLogin={() => setStage('login')}
        onGuest={() => enterMain()}
      />
    );
  }

  if (stage === 'main' && locationIntroState !== 'completed') {
    return (
      <LocationIntroScreen
        loading={locationIntroState === 'loading' || locationIntroWorking}
        status={locationStatus}
        onUseCurrentLocation={useCurrentLocationFromIntro}
      />
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="dark-content" />
      {activeTab !== 'home' && activeTab !== 'analytics' && (
        <AppHeader
          area={conditionRandom.area ? '？' : area}
          locationStatus={conditionRandom.area ? '？ 周辺から探します' : locationStatus}
          onLocationPress={requestCurrentLocation}
        />
      )}
      <ScrollView
        ref={scrollViewRef}
        style={styles.content}
        contentContainerStyle={styles.contentInner}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
      >
        {activeTab === 'home' && (
          <HomeTab
            area={area}
            genre={genre}
            budgetMin={budgetMin}
            budgetMax={budgetMax}
            distance={distance}
            genres={GENRES}
            restaurants={visibleRestaurants}
            history={randomHistory}
            message={message}
            locationStatus={locationStatus}
            userLocation={userLocation}
            profileName={profileName}
            profileImageUri={profileImageUri}
            appLanguage={appLanguage}
            isRegisteredUser={isRegisteredUser}
            isLoading={isLoading}
            mealTicketState={mealTicketState}
            onProfileNameChange={setProfileName}
            onProfileImageChange={setProfileImageUri}
            onLanguageChange={setAppLanguage}
            onAreaChange={updateArea}
            onGenreChange={updateGenre}
            onBudgetMinChange={updateBudgetMin}
            onBudgetMaxChange={updateBudgetMax}
            onDistanceChange={updateDistance}
            onLoadRestaurants={loadRestaurants}
            onOpenFilters={() => setActiveTab('search')}
            onOpenRandom={openRandomTab}
            onRandomPress={prepareConditionDraw}
            onAllRandomPress={prepareEverythingDraw}
            onTravelPress={prepareTravelDraw}
            onAreaRandomPress={openAreaRandomConditions}
            onLocationPress={requestCurrentLocation}
            onCurrentLocationSearch={prepareCurrentLocationSearch}
            onRequireRegistration={() => setStage('login')}
            onLogout={handleLogout}
          />
        )}
        {activeTab === 'search' && (
          <SearchTab
            uiText={UI_TEXT[appLanguage]}
            apiBaseUrl={apiBaseUrl}
            area={area}
            genre={genre}
            budgetMin={budgetMin}
            budgetMax={budgetMax}
            distance={distance}
            drawMode={drawMode}
            conditionRandom={conditionRandom}
            restaurants={visibleRestaurants}
            isLoading={isLoading}
            onApiBaseUrlChange={setApiBaseUrl}
            onAreaChange={updateArea}
            onGenreChange={updateGenre}
            onBudgetMinChange={updateBudgetMin}
            onBudgetMaxChange={updateBudgetMax}
            onDistanceChange={updateDistance}
            onConditionRandomize={markConditionRandom}
            onRequestCurrentLocation={requestCurrentLocation}
            onSearch={loadRestaurants}
            onRandomPress={prepareConditionDraw}
            onAllRandomPress={prepareEverythingDraw}
            onRestaurantSave={saveRestaurantToAlbum}
            isRestaurantSaved={isRestaurantSaved}
          />
        )}
        {activeTab === 'random' && (
          <RandomTab
            uiText={UI_TEXT[appLanguage]}
            area={area}
            genre={genre}
            budgetMin={budgetMin}
            budgetMax={budgetMax}
            distance={distance}
            message={message}
            isLoading={isLoading}
            selectedRestaurant={selectedRestaurant}
            userLocation={userLocation}
            mapCandidates={mapCandidates}
            mapRouletteTarget={mapRouletteTarget}
            mapRouletteStatus={mapRouletteStatus}
            mapRouletteError={mapRouletteError}
            history={randomHistory}
            conditionRandom={conditionRandom}
            travelRevealStep={travelRevealStep}
            travelDisplayArea={travelDisplayArea}
            drawAnimationKey={drawAnimationKey}
            drawMode={drawMode}
            mealTicketState={mealTicketState}
            spinValue={spinValue}
            mapPinProgress={mapPinProgress}
            mapPinBounce={mapPinBounce}
            resultRevealValue={resultRevealValue}
            onTabLayout={(offsetY) => {
              randomTabOffsetRef.current = offsetY;
            }}
            onResultLayout={(offsetY) => {
              randomResultOffsetRef.current = offsetY;
            }}
            onRandomPress={startPreparedDraw}
            onSavePress={saveSelectedRestaurant}
            onGoPress={openMap}
            onChangeConditions={() => setActiveTab('search')}
            onExpandDistance={() => {
              const currentIndex = DISTANCE_OPTIONS.indexOf(distance);
              updateDistance(DISTANCE_OPTIONS[Math.min(currentIndex + 1, DISTANCE_OPTIONS.length - 1)] ?? '3km');
              setActiveTab('search');
            }}
            onRelaxConditions={() => {
              updateGenre('すべて');
              updateBudgetMax('');
              setConditionRandom((current) => ({ ...current, budget: false, genre: false }));
              setActiveTab('search');
            }}
            isSelectedRestaurantSaved={selectedRestaurant ? isRestaurantSaved(selectedRestaurant) : false}
          />
        )}
        {activeTab === 'save' && (
          <SaveTab
            savedRestaurants={savedRestaurants}
            albumPhotos={albumPhotos}
            history={randomHistory}
            drawHistories={drawHistories}
            uiText={UI_TEXT[appLanguage]}
            savedDetail={savedDetail}
            savedDetailLoadingId={savedDetailLoadingId}
            savedDetailError={savedDetailError}
            historyDetailLoadingId={historyDetailLoadingId}
            historyDetailError={historyDetailError}
            userLocation={userLocation}
            isRegisteredUser={isRegisteredUser}
            isPro={subscription.isPro}
            onSavedPress={openSavedRestaurant}
            onHistoryPress={openHistoryRestaurant}
            onSavedMapPress={openSavedMap}
            onAttachPhoto={attachSavedFoodPhoto}
            onUploadAlbumPhoto={uploadAlbumPhoto}
            onCaptureAlbumPhoto={captureAlbumPhoto}
            onRequireRegistration={() => setStage('login')}
          />
        )}
        {activeTab === 'analytics' && (
          <AnalyticsTab
            uiText={UI_TEXT[appLanguage]}
            userId={userId}
            apiBaseUrlCandidates={apiBaseUrlCandidates}
            area={area}
            locationStatus={locationStatus}
            restaurants={visibleRestaurants}
            history={randomHistory}
            drawHistories={drawHistories}
            savedRestaurants={savedRestaurants}
            isPro={subscription.isPro}
            onStartPro={subscription.startProPurchase}
            onRestorePro={subscription.restoreProPurchase}
            onAreaPress={() => setActiveTab('home')}
          />
        )}
      </ScrollView>
      <AppFooter activeTab={activeTab} onPress={handleFooterPress} uiText={UI_TEXT[appLanguage]} />
    </SafeAreaView>
  );
}

function AppHeader({
  area,
  locationStatus,
  onLocationPress,
}: {
  area: string;
  locationStatus: string;
  onLocationPress: () => void;
}) {
  return (
    <View style={styles.header}>
      <Image source={RANDISH_LOGO} style={styles.headerLogo} resizeMode="contain" />
      <View style={styles.headerText}>
        <Text style={styles.headerName}>RANDISH</Text>
        <Text style={styles.headerCopy}>{locationStatus}</Text>
      </View>
      <Pressable style={styles.locationPill} onPress={onLocationPress}>
        <Text style={styles.locationIcon}>⌖</Text>
        <Text style={styles.locationText} numberOfLines={1}>{area}</Text>
      </Pressable>
    </View>
  );
}

function LocationIntroScreen({
  loading,
  status,
  onUseCurrentLocation,
}: {
  loading: boolean;
  status: string;
  onUseCurrentLocation: () => void;
}) {
  return (
    <SafeAreaView style={styles.locationIntroScreen}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.locationIntroContainer}>
        <Image source={RANDISH_LOGO} style={styles.locationIntroLogo} resizeMode="contain" />
        <Text style={styles.locationIntroKicker}>LOCATION ACCESS</Text>
        <Text style={styles.locationIntroTitle}>現在地から、今日の一店を選びます</Text>
        <Text style={styles.locationIntroLead}>Randishは今いる場所の近くにある飲食店を集めて、ルーレットで一店に決めるアプリです。</Text>
        <View style={styles.locationIntroNotice}>
          <Ionicons name="shield-checkmark-outline" size={20} color={ORANGE} />
          <Text style={styles.locationIntroNoticeText}>
            次に表示される端末の確認で、位置情報へのアクセスを許可してください。正確な現在地はサーバーへ保存せず、この端末内の短期キャッシュと検索条件にだけ使います。
          </Text>
        </View>
        <Pressable
          style={[styles.locationIntroPrimaryButton, loading && styles.locationIntroButtonDisabled]}
          onPress={onUseCurrentLocation}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#ffffff" /> : <Ionicons name="navigate" size={20} color="#ffffff" />}
          <Text style={styles.locationIntroPrimaryText}>位置情報を許可して始める</Text>
        </Pressable>
        <Text style={styles.locationIntroStatus}>{status}</Text>
      </View>
    </SafeAreaView>
  );
}

function LoggedOutScreen({
  uiText,
  onLogin,
  onGuest,
}: {
  uiText: Record<string, string>;
  onLogin: () => void;
  onGuest: () => void;
}) {
  return (
    <SafeAreaView style={styles.loggedOutScreen}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.loggedOutContainer}>
        <Image source={RANDISH_LOGO} style={styles.loggedOutLogo} resizeMode="contain" />
        <Text style={styles.loggedOutTitle}>ログアウトしました</Text>
        <Text style={styles.loggedOutLead}>
          この端末に残っていたログイン情報を消しました。別のGoogle / Appleアカウントで登録できます。
        </Text>
        <View style={styles.loggedOutNotice}>
          <Ionicons name="shield-checkmark-outline" size={18} color={ORANGE} />
          <Text style={styles.loggedOutNoticeText}>
            この画面では古い認証URLを処理しません。次に選んだ方法だけでログインします。
          </Text>
        </View>
        <Pressable style={styles.loggedOutPrimaryButton} onPress={onLogin}>
          <Ionicons name="person-add-outline" size={18} color="#ffffff" />
          <Text style={styles.loggedOutPrimaryText}>別のアカウントでログイン・登録</Text>
        </Pressable>
        <Pressable style={styles.loggedOutSecondaryButton} onPress={onGuest}>
          <Ionicons name="restaurant-outline" size={18} color={ORANGE} />
          <Text style={styles.loggedOutSecondaryText}>{uiText.guestStart}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function LoginScreen({
  apiBaseUrlCandidates,
  uiText,
  locationStatus,
  freshSessionPreferred,
  onApiConnected,
  onAuthenticated,
  onStart,
}: {
  apiBaseUrlCandidates: string[];
  uiText: Record<string, string>;
  locationStatus: string;
  freshSessionPreferred: boolean;
  onApiConnected: () => void;
  onAuthenticated: (auth: AuthResponse, accessToken: string, refreshToken?: string | null) => Promise<void>;
  onStart: (userId?: string, displayName?: string) => void;
}) {
  const [authNotice, setAuthNotice] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const handledOAuthUrlRef = useRef<string | null>(null);

  const completeOAuthSession = useCallback(async (url: string | null) => {
    if (!url || !isOAuthCallbackUrl(url) || handledOAuthUrlRef.current === url || consumedOAuthCallbackUrls.has(url)) {
      return;
    }
    handledOAuthUrlRef.current = url;
    consumedOAuthCallbackUrls.add(url);
    const params = parseOAuthCallbackParams(url);
    if (params.error || params.error_description) {
      setAuthNotice(`外部ログインを完了できませんでした。${params.error_description || params.error}`);
      return;
    }
    const accessToken = params.access_token || params.accessToken;
    if (!accessToken) {
      setAuthNotice('外部ログインから認証トークンを受け取れませんでした。SupabaseのRedirect URL設定を確認してください。');
      return;
    }
    const refreshToken = params.refresh_token || params.refreshToken || null;

    setIsSubmitting(true);
    setAuthNotice('');
    try {
      if (params.provider === 'local') {
        randishApi.setAuthToken(accessToken);
        const auth = await randishApi.getCurrentUser(apiBaseUrlCandidates);
        onApiConnected();
        await onAuthenticated(auth, accessToken, refreshToken);
        return;
      }

      const auth = await randishApi.loginWithOAuthSession(apiBaseUrlCandidates, { accessToken });
      const sessionToken = auth.accessToken ?? accessToken;
      randishApi.setAuthToken(sessionToken);
      onApiConnected();
      await onAuthenticated(auth, sessionToken, auth.refreshToken ?? refreshToken);
    } catch (error) {
      const reason = toAuthErrorMessage(error, '外部ログインに失敗しました。');
      setAuthNotice(`外部ログインを完了できませんでした。${reason}`);
    } finally {
      setIsSubmitting(false);
    }
  }, [apiBaseUrlCandidates, onApiConnected, onAuthenticated]);

  useEffect(() => {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      completeOAuthSession(url);
    });
    Linking.getInitialURL()
      .then(completeOAuthSession)
      .catch(() => {});
    return () => subscription.remove();
  }, [completeOAuthSession]);

  const handleSocialPress = async (provider: OAuthProvider) => {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setAuthNotice('');
    try {
      const oauthRedirectUri = getOAuthRedirectUri();
      const authUrl = await randishApi.getOAuthAuthorizeUrl(apiBaseUrlCandidates, provider, oauthRedirectUri);
      onApiConnected();
      const result = await WebBrowser.openAuthSessionAsync(authUrl.authorizationUrl, oauthRedirectUri, {
        dismissButtonStyle: 'cancel',
        preferEphemeralSession: freshSessionPreferred,
      });

      if (result.type === 'success') {
        await completeOAuthSession(result.url);
        return;
      }

      if (result.type === 'cancel' || result.type === 'dismiss') {
        setAuthNotice(`${OAUTH_PROVIDER_NAMES[provider]}ログインをキャンセルしました。`);
        return;
      }

      setAuthNotice(`${OAUTH_PROVIDER_NAMES[provider]}の認証画面を開きました。完了後にRANDISHへ戻ります。`);
    } catch (error) {
      const reason = toAuthErrorMessage(error, '外部ログインを開始できませんでした。');
      setAuthNotice(`${OAUTH_PROVIDER_NAMES[provider]}ログインを開始できませんでした。${reason}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.registerSafe}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        contentContainerStyle={styles.registerContainer}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.registerHeader}>
          <View style={styles.registerHeaderText}>
            <Text style={styles.registerLogo}>RANDISH</Text>
            <Text style={styles.registerSub}>{locationStatus}</Text>
          </View>
          <Image source={RANDISH_LOGO} style={styles.registerHeaderLogo} resizeMode="contain" />
        </View>

        <Text style={styles.registerTitle}>{uiText.registerTitle}</Text>
        <Text style={styles.registerDesc}>{uiText.registerDesc}</Text>

        {!!authNotice && <Text style={styles.registerNotice}>{authNotice}</Text>}

        <View style={styles.registerSocialPanel}>
          <Text style={styles.registerSocialLead}>{uiText.authSocialLead}</Text>
          <RegisterSocialButton
            text={uiText.googleRegister}
            icon="google"
            accent="#1f1f1f"
            onPress={() => handleSocialPress('google')}
            disabled={isSubmitting}
          />
          <RegisterAppleButton
            text={uiText.appleRegister}
            onPress={() => handleSocialPress('apple')}
            disabled={isSubmitting}
          />
        </View>

        <Pressable style={styles.registerGuestButton} onPress={() => onStart()}>
          <Ionicons name="person-outline" size={18} color="#ef552e" />
          <Text style={styles.registerGuestButtonText}>{uiText.guestStart}</Text>
        </Pressable>
        <Text style={styles.registerGuestNote}>{uiText.guestNote}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function RegisterAppleButton({
  text,
  onPress,
  disabled = false,
}: {
  text: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const [canUseNativeButton, setCanUseNativeButton] = useState(Platform.OS === 'ios');

  useEffect(() => {
    let mounted = true;

    if (Platform.OS !== 'ios') {
      setCanUseNativeButton(false);
      return () => {
        mounted = false;
      };
    }

    AppleAuthentication.isAvailableAsync()
      .then((available) => {
        if (mounted) {
          setCanUseNativeButton(available);
        }
      })
      .catch(() => {
        if (mounted) {
          setCanUseNativeButton(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  if (canUseNativeButton) {
    return (
      <View pointerEvents={disabled ? 'none' : 'auto'} style={[styles.registerAppleButtonShell, disabled && styles.registerSocialButtonDisabled]}>
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE_OUTLINE}
          cornerRadius={22}
          style={styles.registerAppleButtonNative}
          onPress={onPress}
        />
      </View>
    );
  }

  return <RegisterSocialButton text={text} icon="apple" accent="#15120f" onPress={onPress} disabled={disabled} />;
}

function RegisterSocialButton({
  text,
  icon,
  accent,
  onPress,
  disabled = false,
  badgeText,
}: {
  text: string;
  icon: keyof typeof FontAwesome.glyphMap;
  accent: string;
  onPress: () => void;
  disabled?: boolean;
  badgeText?: string;
}) {
  const isGoogle = icon === 'google';
  if (isGoogle) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={text}
        style={[styles.registerGoogleImageButton, disabled && styles.registerSocialButtonDisabled]}
        onPress={onPress}
        disabled={disabled}
      >
        <Image source={GOOGLE_CONTINUE_BUTTON} style={styles.registerGoogleButtonImage} resizeMode="contain" />
      </Pressable>
    );
  }

  return (
    <Pressable
      style={[styles.registerSocialButton, disabled && styles.registerSocialButtonDisabled]}
      onPress={onPress}
      disabled={disabled}
    >
      <View style={[styles.registerSocialIcon, { borderColor: accent }]}>
        <FontAwesome name={icon} size={18} color={accent} />
      </View>
      <Text style={styles.registerSocialText}>{text}</Text>
      {!!badgeText && <Text style={styles.registerSocialBadge}>{badgeText}</Text>}
    </Pressable>
  );
}

function MealTicketPanel({ state, compact = false, uiText = UI_TEXT.ja }: { state: MealTicketState; compact?: boolean; uiText?: Record<string, string> }) {
  const midnightTicket = state.tickets.find((ticket) => ticket.key === 'midnight');
  const current = state.current;
  const currentDisplay = getMealTicketDisplay(current, state, uiText);
  const ticketMeta = current.available
    ? `${currentDisplay.label}${uiText.ticketCurrentReadySuffix}`
    : current.used
      ? currentDisplay.countdownLabel
      : currentDisplay.statusLabel;

  return (
    <View style={[styles.mealTicketPanel, compact && styles.mealTicketPanelCompact]}>
      <View style={styles.mealTicketHeader}>
        <View>
          <Text style={styles.mealTicketKicker}>DAILY ACCESS</Text>
          <Text style={styles.mealTicketTitle}>{uiText.todayAccessTitle}</Text>
        </View>
        <View style={[styles.mealTicketCountBadge, current.available && styles.mealTicketCountBadgeActive]}>
          <Text style={[styles.mealTicketCountText, current.available && styles.mealTicketCountTextActive]}>
            {state.usedFreeCount}/{state.totalFreeCount}
          </Text>
          <Text style={[styles.mealTicketCountSub, current.available && styles.mealTicketCountSubActive]}>FREE</Text>
        </View>
      </View>
      <Text style={styles.mealTicketLead}>{ticketMeta}</Text>
      <View style={styles.mealTicketGrid}>
        {state.tickets.map((ticket) => {
          const iconColor = ticket.available ? '#ffffff' : ticket.accent;
          const ticketDisplay = getMealTicketDisplay(ticket, state, uiText);
          return (
            <View
              key={ticket.key}
              style={[
                styles.mealTicketCard,
                ticket.available && styles.mealTicketCardActive,
                ticket.used && styles.mealTicketCardUsed,
                ticket.proOnly && styles.mealTicketCardPro,
                ticket.key === 'midnight' && styles.mealTicketCardMidnight,
              ]}
            >
              <View style={styles.mealTicketCardTop}>
                <View
                  style={[
                    styles.mealTicketIcon,
                    { borderColor: hexToRgba(ticket.accent, 0.2), backgroundColor: hexToRgba(ticket.accent, 0.07) },
                    ticket.available && { backgroundColor: ticket.accent, borderColor: ticket.accent },
                  ]}
                >
                  <Ionicons name={ticket.icon} size={compact ? 15 : 18} color={iconColor} />
                </View>
                <View style={styles.mealTicketTextBlock}>
                  <Text style={[styles.mealTicketName, ticket.available && styles.mealTicketNameActive]}>{ticketDisplay.label}</Text>
                  <Text style={styles.mealTicketTime}>{ticket.timeLabel}</Text>
                </View>
              </View>
              <View style={styles.mealTicketStatusRow}>
                {(ticket.used || (ticket.proOnly && !state.isProUser)) && (
                  <Ionicons name={ticket.used ? 'checkmark-circle' : 'lock-closed'} size={13} color={ticket.used ? '#8c8379' : ticket.accent} />
                )}
                <Text
                  style={[
                    styles.mealTicketStatus,
                    ticket.available && styles.mealTicketStatusActive,
                    ticket.proOnly && !state.isProUser && styles.mealTicketStatusPro,
                  ]}
                  numberOfLines={1}
                >
                  {ticketDisplay.statusLabel}
                </Text>
              </View>
              {!compact && <Text style={styles.mealTicketCountdown} numberOfLines={1}>{ticketDisplay.countdownLabel}</Text>}
            </View>
          );
        })}
      </View>
      {!compact && midnightTicket && (
        <View style={styles.mealTicketNightRail}>
          <View style={styles.mealTicketNightTitleRow}>
            <Ionicons name="sparkles-outline" size={16} color={midnightTicket.accent} />
            <Text style={styles.mealTicketNightTitle}>{uiText.proLateNightGenres}</Text>
          </View>
          <View style={styles.mealTicketNightChips}>
            {midnightTicket.genreHints.map((hint, index) => (
              <View key={`${hint}-${index}`} style={styles.mealTicketNightChip}>
                <Text style={styles.mealTicketNightChipText}>{hint}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

function HomeTab({
  area,
  genre,
  budgetMin,
  budgetMax,
  distance,
  genres,
  restaurants,
  history,
  message,
  locationStatus,
  userLocation,
  profileName,
  profileImageUri,
  appLanguage,
  isRegisteredUser,
  isLoading,
  mealTicketState,
  onProfileNameChange,
  onProfileImageChange,
  onLanguageChange,
  onAreaChange,
  onGenreChange,
  onBudgetMinChange,
  onBudgetMaxChange,
  onDistanceChange,
  onLoadRestaurants,
  onOpenFilters,
  onOpenRandom,
  onRandomPress,
  onAllRandomPress,
  onTravelPress,
  onAreaRandomPress,
  onLocationPress,
  onCurrentLocationSearch,
  onRequireRegistration,
  onLogout,
}: {
  area: string;
  genre: string;
  budgetMin: string;
  budgetMax: string;
  distance: string;
  genres: GenreItem[];
  restaurants: Restaurant[];
  history: Restaurant[];
  message: string;
  locationStatus: string;
  userLocation: UserLocation | null;
  profileName: string;
  profileImageUri: string | null;
  appLanguage: AppLanguage;
  isRegisteredUser: boolean;
  isLoading: boolean;
  mealTicketState: MealTicketState;
  onProfileNameChange: (value: string) => void;
  onProfileImageChange: (value: string | null) => void;
  onLanguageChange: (value: AppLanguage) => void;
  onAreaChange: (value: string) => void;
  onGenreChange: (value: string) => void;
  onBudgetMinChange: (value: string) => void;
  onBudgetMaxChange: (value: string) => void;
  onDistanceChange: (value: string) => void;
  onLoadRestaurants: () => void;
  onOpenFilters: () => void;
  onOpenRandom: () => void;
  onRandomPress: () => void;
  onAllRandomPress: () => void;
  onTravelPress: () => void;
  onAreaRandomPress: () => void;
  onLocationPress: () => void;
  onCurrentLocationSearch: () => void;
  onRequireRegistration: () => void;
  onLogout: () => void;
}) {
  return (
    <View>
      <HomeLocationPanel
            area={area}
            genre={genre}
            budgetMin={budgetMin}
            distance={distance}
            presets={ALL_AREA_PRESETS}
            history={history}
            locationStatus={locationStatus}
            userLocation={userLocation}
            profileName={profileName}
            profileImageUri={profileImageUri}
            appLanguage={appLanguage}
            isRegisteredUser={isRegisteredUser}
            mealTicketState={mealTicketState}
            onProfileNameChange={onProfileNameChange}
            onProfileImageChange={onProfileImageChange}
            onLanguageChange={onLanguageChange}
            onAreaChange={onAreaChange}
            onOpenFilters={onOpenFilters}
            onLocationPress={onLocationPress}
            onAllRandomPress={onAllRandomPress}
            onTravelPress={onTravelPress}
            onAreaRandomPress={onAreaRandomPress}
            onCurrentLocationSearch={onCurrentLocationSearch}
            onConditionRandomPress={onRandomPress}
            onSubmit={onLoadRestaurants}
            onRequireRegistration={onRequireRegistration}
            onLogout={onLogout}
          />
    </View>
  );
}

function HomeMapIllustration() {
  return (
    <View pointerEvents="none" style={styles.homeHeroMapIllustration}>
      <Image source={HOME_HEADER_MAP} style={styles.homeHeroMapImage} resizeMode="cover" />
    </View>
  );
}

function HomeLocationFallbackDot() {
  return (
    <View style={styles.homeLocationFallbackDot}>
      <View style={styles.homeLocationFallbackDotCore} />
    </View>
  );
}

function HomeCurrentMapBackground({ userLocation }: { userLocation: UserLocation | null }) {
  const MapModule = useMemo(getNativeMapModule, []);
  const MapView = MapModule?.default;
  const canRenderNativeMap = Boolean(MapModule && MapView && Platform.OS !== 'web' && userLocation);
  const region = userLocation
    ? {
      latitude: userLocation.latitude,
      longitude: userLocation.longitude,
      latitudeDelta: 0.0046,
      longitudeDelta: 0.0046,
    }
    : null;

  return (
    <View style={styles.homeCurrentMapLayer}>
      {canRenderNativeMap && region ? (
        <>
          <MapView
            provider={MapModule?.PROVIDER_GOOGLE}
            style={styles.homeCurrentNativeMap}
            initialRegion={region}
            scrollEnabled
            zoomEnabled
            pitchEnabled={false}
            rotateEnabled
            toolbarEnabled={false}
            showsCompass={false}
            showsMyLocationButton={false}
            showsUserLocation
            followsUserLocation
            userLocationPriority="high"
            userLocationUpdateInterval={1000}
            loadingEnabled
          />
          <View pointerEvents="none" style={styles.homeCurrentMapTint} />
        </>
      ) : (
        <>
          <View style={[styles.homeCurrentMapBlock, styles.homeCurrentMapBlockOne]} />
          <View style={[styles.homeCurrentMapBlock, styles.homeCurrentMapBlockTwo]} />
          <View style={[styles.homeCurrentMapBlock, styles.homeCurrentMapBlockThree]} />
          <View style={[styles.homeCurrentMapRoad, styles.homeCurrentMapRoadWide]} />
          <View style={[styles.homeCurrentMapRoad, styles.homeCurrentMapRoadNarrow]} />
          <View style={[styles.homeCurrentMapWater, styles.homeCurrentMapWaterOne]} />
          <View pointerEvents="none" style={styles.homeLocationFallbackDotWrap}>
            <HomeLocationFallbackDot />
          </View>
        </>
      )}
    </View>
  );
}

function HeroCard({ restaurantCount, isLoading, onRandomPress }: { restaurantCount: number; isLoading: boolean; onRandomPress: () => void }) {
  return (
    <View style={styles.hero}>
      <View style={styles.heroTop}>
        <View style={styles.heroBadge}>
          <Text style={styles.heroBadgeText}>ONE TAP PICK</Text>
        </View>
        <Text style={styles.heroCount}>{restaurantCount} spots</Text>
      </View>
      <Text style={styles.heroTitle}>迷ったら、{'\n'}RANDISHに任せる。</Text>
      <Text style={styles.heroLead}>ジャンルと気分だけ決めたら、あとは一店に絞るだけ。探すより、決めるためのアプリです。</Text>
      <Pressable style={styles.heroButton} onPress={onRandomPress}>
        {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.heroButtonText}>今日の一店を決める</Text>}
      </Pressable>
    </View>
  );
}

function HomeLocationPanel({
  area,
  genre,
  budgetMin,
  distance,
  presets,
  history,
  locationStatus,
  userLocation,
  profileName,
  profileImageUri,
  appLanguage,
  isRegisteredUser,
  mealTicketState,
  onProfileNameChange,
  onProfileImageChange,
  onLanguageChange,
  onAreaChange,
  onOpenFilters,
  onLocationPress,
  onAllRandomPress,
  onTravelPress,
  onAreaRandomPress,
  onCurrentLocationSearch,
  onConditionRandomPress,
  onSubmit,
  onRequireRegistration,
  onLogout,
}: {
  area: string;
  genre: string;
  budgetMin: string;
  distance: string;
  presets: AreaPreset[];
  history: Restaurant[];
  locationStatus: string;
  userLocation: UserLocation | null;
  profileName: string;
  profileImageUri: string | null;
  appLanguage: AppLanguage;
  isRegisteredUser: boolean;
  mealTicketState: MealTicketState;
  onProfileNameChange: (value: string) => void;
  onProfileImageChange: (value: string | null) => void;
  onLanguageChange: (value: AppLanguage) => void;
  onAreaChange: (value: string) => void;
  onOpenFilters: () => void;
  onLocationPress: () => void;
  onAllRandomPress: () => void;
  onTravelPress: () => void;
  onAreaRandomPress: () => void;
  onCurrentLocationSearch: () => void;
  onConditionRandomPress: () => void;
  onSubmit: () => void;
  onRequireRegistration: () => void;
  onLogout: () => void;
}) {
  const [query, setQuery] = useState('');
  const [showAllFavorites, setShowAllFavorites] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [logoutSheetOpen, setLogoutSheetOpen] = useState(false);
  const [profileNameDraft, setProfileNameDraft] = useState(profileName);
  const t = UI_TEXT[appLanguage];
  const currentLanguage = LANGUAGE_OPTIONS.find((item) => item.key === appLanguage) ?? LANGUAGE_OPTIONS[0];
  const selectedPreset = getAreaPreset(area);
  const areaPrefecture = getPrefectureFromText(area) ?? (selectedPreset ? getPresetPrefecture(selectedPreset) : undefined);
  const [selectedHomePrefecture, setSelectedHomePrefecture] = useState<string | null>(
    areaPrefecture && area !== '現在地' ? areaPrefecture : null,
  );
  const selectedPrefecture = selectedHomePrefecture;
  const selectedRegion = selectedPrefecture ? (getRegionGroupForPrefecture(selectedPrefecture) ?? null) : null;
  const [expandedRegion, setExpandedRegion] = useState<string | null>(selectedRegion);
  const prefecturePresets = selectedPrefecture
    ? uniqueAreaPresets(presets.filter((preset) => getPresetPrefecture(preset) === selectedPrefecture && preset.label !== '現在地' && preset.label !== selectedPrefecture))
    : [];
  const historyAreaPresets = history
    .map(getRestaurantAreaLabel)
    .filter((label): label is string => Boolean(label))
    .map((label) => presets.find((item) => item.label === label || getAreaPresetValue(item) === label))
    .filter((preset): preset is AreaPreset => Boolean(preset))
    .filter((label) => {
      return getPresetPrefecture(label) === selectedPrefecture;
    });
  const currentAreaPreset = selectedPreset && selectedPrefecture && getPresetPrefecture(selectedPreset) === selectedPrefecture ? selectedPreset : undefined;
  const allFavoriteAreas = sortAreaPresetsForPicker(
    uniqueAreaPresets([...(currentAreaPreset ? [currentAreaPreset] : []), ...historyAreaPresets, ...prefecturePresets])
      .filter((preset) => preset.label !== '現在地'),
    selectedPrefecture ?? '',
  );
  const isOsakaPrefecture = selectedPrefecture === '大阪府';
  const isOsakaWardPreset = (preset: AreaPreset) => isOsakaPrefecture && OSAKA_CITY_WARD_SET.has(preset.label);
  const osakaPrimaryAreas = isOsakaPrefecture
    ? allFavoriteAreas.filter((preset) => preset.useCoordinates !== false && !isOsakaWardPreset(preset))
    : [];
  const osakaMunicipalityAreas = isOsakaPrefecture
    ? allFavoriteAreas.filter((preset) => preset.useCoordinates === false && !isOsakaWardPreset(preset))
    : [];
  const favoriteSourceAreas = isOsakaPrefecture ? osakaPrimaryAreas : allFavoriteAreas;
  const favoriteAreas = showAllFavorites ? favoriteSourceAreas : favoriteSourceAreas.slice(0, isOsakaPrefecture ? 12 : 8);
  const osakaMunicipalities = showAllFavorites ? osakaMunicipalityAreas : osakaMunicipalityAreas.slice(0, 12);
  const favoriteToggleCount = isOsakaPrefecture ? osakaPrimaryAreas.length + osakaMunicipalityAreas.length : allFavoriteAreas.length;
  const favoriteAreaTitle = selectedPrefecture ? `${selectedPrefecture}${t.cityAreaSuffix}` : t.cityAreaDefault;
  const regionRows = AREA_REGION_GROUPS.map((group) => ({
    ...group,
    prefectures: group.prefectures
      .map((prefecture) => {
        const prefectureInfo = PREFECTURE_REGIONS.find((item) => item.prefecture === prefecture);
        if (!prefectureInfo) {
          return null;
        }
        return {
          ...prefectureInfo,
          image: PREFECTURE_IMAGES[prefectureInfo.prefecture],
          firstArea: presets.find((preset) => getPresetPrefecture(preset) === prefectureInfo.prefecture && preset.label !== '現在地'),
        };
      })
      .filter(
        (item): item is PrefectureRegion & { image: ImageSourcePropType; firstArea: AreaPreset | undefined } => item != null,
      ),
  }));
  const accountMenuItems: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }[] = [
    { icon: 'notifications-outline', label: t.notifications, value: t.notificationsValue },
    ...(FEATURE_MEAL_TICKETS_ENABLED
      ? [{ icon: 'ticket-outline' as keyof typeof Ionicons.glyphMap, label: t.dailyAccess, value: `${mealTicketState.usedFreeCount}/${mealTicketState.totalFreeCount} FREE` }]
      : []),
    { icon: 'shield-checkmark-outline', label: t.creditTerms, value: t.creditTermsValue },
  ];
  useEffect(() => {
    if (selectedRegion) {
      setExpandedRegion(selectedRegion);
    }
  }, [selectedRegion]);

  useEffect(() => {
    if (areaPrefecture && area !== '現在地') {
      setSelectedHomePrefecture(areaPrefecture);
    }
  }, [area, areaPrefecture]);

  useEffect(() => {
    setProfileNameDraft(profileName);
  }, [profileName]);

  const searchResults = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return [];
    }
    return uniqueAreaPresets(presets.filter((preset) => getAreaPresetSearchText(preset).includes(normalized))).slice(0, 6);
  }, [presets, query]);

  const pickArea = (value: string) => {
    onAreaChange(value);
    setQuery('');
  };

  const openConditionsForArea = (value: string) => {
    pickArea(value);
    onOpenFilters();
  };

  const pickPrefecture = (value: string) => {
    setSelectedHomePrefecture(value);
    setExpandedRegion(getRegionGroupForPrefecture(value) ?? expandedRegion);
    setShowAllFavorites(false);
    setQuery('');
  };

  const exploreSelectedPrefecture = () => {
    if (!selectedPrefecture) {
      return;
    }
    openConditionsForArea(selectedPrefecture);
  };

  const saveProfileName = () => {
    if (!isRegisteredUser) {
      promptRegistration();
      return;
    }
    Keyboard.dismiss();
    const nextName = profileNameDraft.trim();
    onProfileNameChange(nextName || 'RANDISH Guest');
  };

  const promptRegistration = () => {
    Keyboard.dismiss();
    Alert.alert(t.registrationPromptTitle, t.registrationPromptMessage, [
      { text: t.registrationPromptCancel, style: 'cancel' },
      {
        text: t.registrationPromptAction,
        onPress: () => {
          setProfileEditorOpen(false);
          setLanguageMenuOpen(false);
          setAccountMenuOpen(false);
          onRequireRegistration();
        },
      },
    ]);
  };

  const confirmLogout = () => {
    if (!isRegisteredUser) {
      promptRegistration();
      return;
    }
    Keyboard.dismiss();
    setProfileEditorOpen(false);
    setLanguageMenuOpen(false);
    setAccountMenuOpen(false);
    setLogoutSheetOpen(true);
  };

  const runLogout = () => {
    Keyboard.dismiss();
    setLogoutSheetOpen(false);
    onLogout();
  };

  const pickProfileImage = async () => {
    if (!isRegisteredUser) {
      promptRegistration();
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t.photoPermissionTitle, t.photoPermissionMessage);
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      shape: 'oval',
      quality: 0.85,
    });

    if (!result.canceled && result.assets[0]?.uri) {
      onProfileImageChange(result.assets[0].uri);
    }
  };

  return (
    <View style={styles.homeLocationPanel}>
      <Modal
        visible={logoutSheetOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setLogoutSheetOpen(false)}
      >
        <View style={styles.logoutModalOverlay}>
          <View style={styles.logoutSheet}>
            <View style={styles.logoutSheetIcon}>
              <Ionicons name="log-out-outline" size={28} color="#d7472f" />
            </View>
            <Text style={styles.logoutSheetTitle}>{t.logoutConfirmTitle}</Text>
            <Text style={styles.logoutSheetLead}>
              この端末に残っているログイン情報だけを消します。サーバーのトークン確認は使わず、別のアカウントで登録・ログインできます。
            </Text>
            <View style={styles.logoutSheetNotice}>
              <Ionicons name="phone-portrait-outline" size={17} color={ORANGE} />
              <Text style={styles.logoutSheetNoticeText}>保存済みの外部店舗情報は再ログイン後に必要な時だけ取得します。</Text>
            </View>
            <View style={styles.logoutSheetActions}>
              <Pressable style={styles.logoutSheetCancelButton} onPress={() => setLogoutSheetOpen(false)}>
                <Text style={styles.logoutSheetCancelText}>{t.logoutConfirmCancel}</Text>
              </Pressable>
              <Pressable style={styles.logoutSheetActionButton} onPress={runLogout}>
                <Text style={styles.logoutSheetActionText}>{t.logoutConfirmAction}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <View style={styles.homeTopBar}>
        <View style={styles.homeLogoButton}>
          <Image source={RANDISH_LOGO} style={styles.homeLogoImage} resizeMode="contain" />
        </View>
        <View style={styles.homeAccountWrap}>
          <Pressable style={[styles.homeAccountButton, accountMenuOpen && styles.homeAccountButtonActive]} onPress={() => setAccountMenuOpen((current) => !current)}>
            {isRegisteredUser && profileImageUri ? (
              <Image source={{ uri: profileImageUri }} style={styles.homeAccountButtonImage} resizeMode="cover" />
            ) : (
              <Ionicons name="person-circle-outline" size={28} color={accountMenuOpen ? '#ffffff' : INK} />
            )}
          </Pressable>
          {accountMenuOpen && (
            <View style={styles.homeAccountMenu}>
              <View style={styles.homeAccountMenuHeader}>
                <Pressable style={[styles.homeAccountAvatar, !isRegisteredUser && styles.homeAccountAvatarLocked]} onPress={pickProfileImage}>
                  {isRegisteredUser && profileImageUri ? (
                    <Image source={{ uri: profileImageUri }} style={styles.homeAccountAvatarImage} resizeMode="cover" />
                  ) : (
                    <Ionicons name="person-outline" size={23} color={ORANGE} />
                  )}
                  {isRegisteredUser && (
                    <View style={styles.homeAccountAvatarBadge}>
                    <Ionicons name="camera" size={12} color="#ffffff" />
                    </View>
                  )}
                </Pressable>
                <View style={styles.homeAccountHeaderText}>
                  <Text style={styles.homeAccountName}>{isRegisteredUser ? profileName : 'Guest'}</Text>
                  <Text style={styles.homeAccountSub}>{t.accountSettings}</Text>
                </View>
              </View>
              <Pressable
                style={[styles.homeAccountMenuItem, !isRegisteredUser && styles.homeAccountMenuItemLocked]}
                onPress={() => {
                  if (!isRegisteredUser) {
                    promptRegistration();
                    return;
                  }
                  setProfileEditorOpen((current) => !current);
                }}
              >
                <View style={styles.homeAccountMenuIcon}>
                  <Ionicons name="person-circle-outline" size={18} color={isRegisteredUser ? ORANGE : '#9c948b'} />
                </View>
                <View style={styles.homeAccountMenuText}>
                  <Text style={styles.homeAccountMenuLabel}>{t.profile}</Text>
                  <Text style={styles.homeAccountMenuValue}>{isRegisteredUser ? t.profileValue : t.profileRegisterCta}</Text>
                </View>
                <Ionicons name={isRegisteredUser && profileEditorOpen ? 'chevron-up' : 'lock-closed-outline'} size={16} color="#afa69b" />
              </Pressable>
              {isRegisteredUser && profileEditorOpen && (
                <View style={styles.homeProfileEditor}>
                  <Text style={styles.homeProfileEditorLabel}>{t.displayName}</Text>
                  <TextInput
                    value={profileNameDraft}
                    onChangeText={setProfileNameDraft}
                    style={styles.homeProfileNameInput}
                    placeholder={t.profilePlaceholder}
                    placeholderTextColor="#a49a90"
                    maxLength={24}
                    returnKeyType="done"
                    blurOnSubmit
                    onSubmitEditing={saveProfileName}
                  />
                  <View style={styles.homeProfileActionRow}>
                    <Pressable style={styles.homeProfileImageButton} onPress={pickProfileImage}>
                      <Ionicons name="image-outline" size={16} color={INK} />
                      <Text style={styles.homeProfileImageButtonText}>{t.changeImage}</Text>
                    </Pressable>
                    <Pressable style={styles.homeProfileSaveButton} onPress={saveProfileName}>
                      <Text style={styles.homeProfileSaveText}>{t.save}</Text>
                    </Pressable>
                  </View>
                </View>
              )}
              <Pressable style={styles.homeAccountMenuItem} onPress={() => setLanguageMenuOpen((current) => !current)}>
                <View style={styles.homeAccountMenuIcon}>
                  <Ionicons name="language-outline" size={18} color={ORANGE} />
                </View>
                <View style={styles.homeAccountMenuText}>
                  <Text style={styles.homeAccountMenuLabel}>{t.language}</Text>
                  <Text style={styles.homeAccountMenuValue}>{currentLanguage.nativeLabel}</Text>
                </View>
                <Ionicons name={languageMenuOpen ? 'chevron-up' : 'chevron-forward'} size={16} color="#afa69b" />
              </Pressable>
              {languageMenuOpen && (
                <View style={styles.homeLanguagePicker}>
                  {LANGUAGE_OPTIONS.map((item) => {
                    const selected = item.key === appLanguage;
                    return (
                      <Pressable
                        key={item.key}
                        style={[styles.homeLanguageOption, selected && styles.homeLanguageOptionActive]}
                        onPress={() => onLanguageChange(item.key)}
                      >
                        <Text style={[styles.homeLanguageOptionText, selected && styles.homeLanguageOptionTextActive]}>{item.nativeLabel}</Text>
                        <Text style={[styles.homeLanguageOptionSub, selected && styles.homeLanguageOptionSubActive]}>{item.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
              {accountMenuItems.map((item, index) => (
                <Pressable key={`${item.label}-${index}`} style={styles.homeAccountMenuItem}>
                  <View style={styles.homeAccountMenuIcon}>
                    <Ionicons name={item.icon} size={18} color={ORANGE} />
                  </View>
                  <View style={styles.homeAccountMenuText}>
                    <Text style={styles.homeAccountMenuLabel}>{item.label}</Text>
                    <Text style={styles.homeAccountMenuValue}>{item.value}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#afa69b" />
                </Pressable>
              ))}
              {isRegisteredUser && (
                <Pressable style={[styles.homeAccountMenuItem, styles.homeAccountLogoutItem]} onPress={confirmLogout}>
                  <View style={[styles.homeAccountMenuIcon, styles.homeAccountLogoutIcon]}>
                    <Ionicons name="log-out-outline" size={18} color="#d7472f" />
                  </View>
                  <View style={styles.homeAccountMenuText}>
                    <Text style={[styles.homeAccountMenuLabel, styles.homeAccountLogoutLabel]}>{t.logout}</Text>
                    <Text style={[styles.homeAccountMenuValue, styles.homeAccountLogoutValue]}>{t.logoutValue}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#d9a195" />
                </Pressable>
              )}
              <View style={styles.homeAccountMenuFooter}>
                <Pressable
                  style={styles.homeAccountCloseButton}
                  onPress={() => {
                    Keyboard.dismiss();
                    setProfileEditorOpen(false);
                    setLanguageMenuOpen(false);
                    setAccountMenuOpen(false);
                  }}
                >
                  <Text style={styles.homeAccountCloseText}>{t.close}</Text>
                  <Ionicons name="close" size={15} color="#ffffff" />
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </View>
      <View style={styles.homeLocationHero}>
        <View style={styles.homeLocationCopy}>
          <Text style={styles.homeLocationEyebrow}>{t.areaSetup}</Text>
          <Text style={styles.homeLocationTitle}>{t.homeTitle}</Text>
          <Text style={styles.homeLocationLead}>{t.homeLead}</Text>
        </View>
        <HomeMapIllustration />
      </View>
      {FEATURE_MEAL_TICKETS_ENABLED && <MealTicketPanel state={mealTicketState} uiText={t} />}

      <View style={styles.homeSearchBox}>
        <Ionicons name="search" size={28} color={INK} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          style={styles.homeSearchInput}
          placeholder={t.searchPlaceholder}
          placeholderTextColor="#a29b94"
          returnKeyType="search"
          blurOnSubmit
          onSubmitEditing={Keyboard.dismiss}
        />
        <Pressable style={[styles.homeSearchFilterButton, !selectedPrefecture && styles.homeSearchFilterButtonMuted]} onPress={selectedPrefecture ? exploreSelectedPrefecture : undefined}>
          <Ionicons name="options-outline" size={26} color={INK} />
        </Pressable>
      </View>

      {query.trim() ? (
        <View style={styles.homeSearchResults}>
          {searchResults.map((item, index) => (
            <Pressable
              key={`${getAreaPresetKey(item)}-${index}`}
              style={styles.homeAreaRow}
              onPress={() => isPrefectureName(item.label) ? pickPrefecture(item.label) : openConditionsForArea(getAreaPresetValue(item))}
            >
              <View style={styles.homeAreaRowDot} />
              <View style={styles.homeAreaRowBody}>
                <Text style={styles.homeAreaRowName}>{item.label}</Text>
                <Text style={styles.homeAreaRowMeta}>{item.group}</Text>
              </View>
              <Text style={styles.homeAreaChevron}>›</Text>
            </Pressable>
          ))}
          {searchResults.length === 0 && <Text style={styles.areaNoResult}>{t.hiddenTown}</Text>}
        </View>
      ) : (
        <>
          <View style={styles.homeLocationCards}>
            <View style={styles.homeCurrentCard}>
              <HomeCurrentMapBackground userLocation={userLocation} />
              <View style={styles.homeCurrentChipRow}>
                <Pressable style={styles.homeCurrentBadge} onPress={onLocationPress}>
                  <Ionicons name={userLocation ? 'locate' : 'navigate'} size={10} color={ORANGE} />
                  <Text style={[styles.homeCurrentBadgeText, userLocation && styles.homeCurrentBadgeTextActive]} numberOfLines={1}>
                    {userLocation ? t.currentLocationActive : t.currentLocationTap}
                  </Text>
                </Pressable>
                <View style={styles.homeCurrentMapPill}>
                  <Ionicons name="map-outline" size={10} color={INK} />
                  <Text style={styles.homeCurrentMapPillText} numberOfLines={1}>{t.currentLocationMap}</Text>
                </View>
              </View>
              <Pressable style={styles.homeCurrentSearchButton} onPress={onCurrentLocationSearch}>
                <Ionicons name="navigate-circle-outline" size={16} color="#ffffff" />
                <Text style={styles.homeCurrentSearchText} numberOfLines={1}>{t.currentLocationSearch}</Text>
              </Pressable>
            </View>
            <Pressable style={styles.homeMapPreview} onPress={onTravelPress}>
              <View style={styles.homeTravelGlow} />
              <View style={styles.homeTravelTransportRail}>
                {(['train-outline', 'boat-outline', 'bus-outline', 'airplane-outline', 'car-outline'] as const).map((icon) => (
                  <View key={icon} style={styles.homeTravelTransportIcon}>
                    <Ionicons name={icon} size={10} color={INK} />
                  </View>
                ))}
              </View>
              <View style={styles.homeMapBottom}>
                <Text style={styles.homeTravelKicker}>{t.travelKicker}</Text>
                <Text style={styles.homeMapTitle}>{t.travel}</Text>
                <Text style={styles.homeMapLead} numberOfLines={2}>{t.travelSub}</Text>
              </View>
              <View style={styles.homeTravelPrimaryCta}>
                <Text style={styles.homeTravelPrimaryCtaText}>{t.travelCta}</Text>
                <Ionicons name="arrow-forward" size={13} color="#ffffff" />
              </View>
            </Pressable>
          </View>

          <View style={styles.homeSubsection}>
            <View style={styles.homeSubsectionHeader}>
              <Pressable style={styles.homeRegionRandomButton} onPress={onAreaRandomPress}>
                <Ionicons name="shuffle-outline" size={14} color={ORANGE} />
                <Text style={styles.homeRegionRandomText}>{t.random}</Text>
              </Pressable>
              <Ionicons name="map-outline" size={28} color={INK} />
              <Text style={styles.homeSubsectionTitle}>{t.chooseFromRegion}</Text>
            </View>
            <View style={styles.homeRegionList}>
              {regionRows.map((group, groupIndex) => {
                const isExpanded = expandedRegion === group.label;
                const isRegionSelected = group.prefectures.some((item) => item.prefecture === selectedPrefecture);
                return (
                  <View
                    key={group.label}
                    style={[
                      styles.homeRegionBlock,
                      groupIndex === 0 && styles.homeRegionBlockFirst,
                      groupIndex === regionRows.length - 1 && styles.homeRegionBlockLast,
                    ]}
                  >
                    <Pressable
                      style={[styles.homeRegionRow, isRegionSelected && styles.homeRegionRowActive]}
                      onPress={() => setExpandedRegion((current) => (current === group.label ? null : group.label))}
                    >
                      <View style={[styles.homeRegionIconFrame, isRegionSelected && styles.homeRegionIconFrameActive]}>
                        <MaterialCommunityIcons name={group.icon} size={21} color={isRegionSelected ? ORANGE : INK} />
                      </View>
                      <View style={styles.homeAreaRowBody}>
                        <Text style={[styles.homeRegionName, isRegionSelected && styles.homeRegionNameActive]}>{group.label}</Text>
                        <Text style={styles.homeRegionMeta}>{group.prefectures.length}{t.prefectureCount}</Text>
                      </View>
                      <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={isRegionSelected ? ORANGE : INK} />
                    </Pressable>
                    {isExpanded && (
                      <View style={styles.homePrefectureGrid}>
                        {group.prefectures.map((item) => {
                          const isSelected = selectedPrefecture === item.prefecture;
                          return (
                            <Pressable
                              key={`${group.label}-${item.prefecture}`}
                              style={[styles.homePrefecturePill, isSelected && styles.homePrefecturePillActive]}
                              onPress={() => pickPrefecture(item.prefecture)}
                            >
                              <View style={[styles.homePrefectureIconFrame, isSelected && styles.homePrefectureIconFrameActive]}>
                                {item.image ? (
                                  <Image source={item.image} style={styles.homePrefectureAssetIcon} resizeMode="contain" />
                                ) : (
                                  <MaterialCommunityIcons
                                    name={item.icon}
                                    size={18}
                                    color={isSelected ? ORANGE : INK}
                                    style={styles.homePrefectureIcon}
                                  />
                                )}
                              </View>
                              <Text style={[styles.homePrefectureName, isSelected && styles.homePrefectureNameActive]}>{item.prefecture}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </View>

          <View style={styles.homeSubsection}>
            <View style={styles.homeSubsectionHeader}>
              <Ionicons name="trail-sign-outline" size={28} color={INK} />
              <Text style={styles.homeSubsectionTitle}>{favoriteAreaTitle}</Text>
              {!!selectedPrefecture && favoriteToggleCount > (isOsakaPrefecture ? 24 : 8) && (
                <Pressable onPress={() => setShowAllFavorites((current) => !current)}>
                  <Text style={styles.homeSectionSeeAll}>{showAllFavorites ? t.hideCities : t.seeMoreCities}</Text>
                </Pressable>
              )}
            </View>
            {selectedPrefecture ? (
              <>
                <Pressable style={styles.homeExplorePrefectureButton} onPress={exploreSelectedPrefecture}>
                  <View style={styles.homeExploreIcon}>
                    <Ionicons name="compass-outline" size={21} color="#ffffff" />
                  </View>
                  <View style={styles.homeExploreBody}>
                    <Text style={styles.homeExploreTitle}>{selectedPrefecture}{t.exploreAll}</Text>
                    <Text style={styles.homeExploreText}>{t.exploreAllLead}</Text>
                  </View>
                  <Ionicons name="arrow-forward" size={20} color="#ffffff" />
                </Pressable>
                {isOsakaPrefecture && (
                  <View style={styles.homeAreaGroupCard}>
                    <View style={styles.homeAreaGroupHeader}>
                      <View style={styles.homeAreaGroupIcon}>
                        <Ionicons name="business-outline" size={18} color={ORANGE} />
                      </View>
                      <View style={styles.homeAreaGroupText}>
                        <Text style={styles.homeAreaGroupTitle}>{t.osakaWardsTitle}</Text>
                        <Text style={styles.homeAreaGroupLead}>{t.osakaWardsLead}</Text>
                      </View>
                    </View>
                    <View style={styles.homeWardGrid}>
                      {OSAKA_CITY_WARDS.map((ward) => {
                        const itemValue = `大阪市${ward}`;
                        const selected = area === itemValue || area === ward;
                        return (
                          <Pressable
                            key={ward}
                            style={[styles.homeWardChip, selected && styles.homeWardChipActive]}
                            onPress={() => openConditionsForArea(itemValue)}
                          >
                            <Text style={[styles.homeWardText, selected && styles.homeWardTextActive]}>{ward}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                )}
                {isOsakaPrefecture && favoriteAreas.length > 0 && (
                  <View style={styles.homeAreaInlineHeader}>
                    <Ionicons name="train-outline" size={15} color={ORANGE} />
                    <Text style={styles.homeAreaInlineTitle}>{t.majorAreasTitle}</Text>
                  </View>
                )}
                <View style={styles.homeFavoriteWrap}>
                  {favoriteAreas.map((item, index) => {
                    const itemValue = getAreaPresetValue(item);
                    const selected = area === itemValue || area === item.label;
                    return (
                      <Pressable key={`${getAreaPresetKey(item)}-${index}`} style={[styles.homeFavoriteChip, selected && styles.homeFavoriteChipActive]} onPress={() => openConditionsForArea(itemValue)}>
                        <Ionicons name={selected ? 'checkmark-circle' : 'sparkles-outline'} size={18} color={selected ? ORANGE : '#9b9184'} />
                        <Text style={[styles.homeFavoriteText, selected && styles.homeFavoriteTextActive]}>{item.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                {isOsakaPrefecture && osakaMunicipalities.length > 0 && (
                  <>
                    <View style={styles.homeAreaInlineHeader}>
                      <Ionicons name="map-outline" size={15} color={ORANGE} />
                      <Text style={styles.homeAreaInlineTitle}>{t.municipalitiesTitle}</Text>
                    </View>
                    <View style={styles.homeFavoriteWrap}>
                      {osakaMunicipalities.map((item, index) => {
                        const itemValue = getAreaPresetValue(item);
                        const selected = area === itemValue || area === item.label;
                        return (
                          <Pressable key={`${getAreaPresetKey(item)}-municipality-${index}`} style={[styles.homeFavoriteChip, selected && styles.homeFavoriteChipActive]} onPress={() => openConditionsForArea(itemValue)}>
                            <Ionicons name={selected ? 'checkmark-circle' : 'location-outline'} size={18} color={selected ? ORANGE : '#9b9184'} />
                            <Text style={[styles.homeFavoriteText, selected && styles.homeFavoriteTextActive]}>{item.label}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </>
                )}
              </>
            ) : (
              <View style={styles.homePrefecturePrompt}>
                <Ionicons name="map-outline" size={22} color={ORANGE} />
                <Text style={styles.homePrefecturePromptText}>{t.prefecturePrompt}</Text>
              </View>
            )}
          </View>
        </>
      )}
    </View>
  );
}

function FilterPanel({
  area,
  genre,
  budgetMin,
  budgetMax,
  distance,
  genres,
  areaPresets,
  conditionRandom,
  uiText = UI_TEXT.ja,
  compact = false,
  showAreaPicker = true,
  onAreaChange,
  onGenreChange,
  onBudgetMinChange,
  onBudgetMaxChange,
  onDistanceChange,
  onRandomized,
  onUseCurrentLocation,
  onSubmit,
}: {
  area: string;
  genre: string;
  budgetMin: string;
  budgetMax: string;
  distance: string;
  genres: GenreItem[];
  areaPresets: AreaPreset[];
  conditionRandom?: ConditionRandomState;
  uiText?: Record<string, string>;
  compact?: boolean;
  showAreaPicker?: boolean;
  onAreaChange: (value: string) => void;
  onGenreChange: (value: string) => void;
  onBudgetMinChange: (value: string) => void;
  onBudgetMaxChange: (value: string) => void;
  onDistanceChange: (value: string) => void;
  onRandomized?: (field: ConditionRandomField) => void;
  onUseCurrentLocation?: () => void | Promise<unknown>;
  onSubmit: () => void;
}) {
  const [showAllGenres, setShowAllGenres] = useState(false);
  const randomState = conditionRandom ?? { area: false, budget: false, distance: false, genre: false };
  const selectableGenres = compact ? genres.slice(1) : genres;
  const collapsedGenreCount = compact ? 9 : 12;
  const mainGenres = selectableGenres.slice(0, collapsedGenreCount);
  const selectedHiddenGenre = selectableGenres.find((item) => item.label === genre && !mainGenres.some((mainGenre) => mainGenre.label === item.label));
  const sortGenresForDisplay = useCallback((items: GenreItem[]) => {
    return [...items].sort((a, b) => {
      const aWide = isWideGenreLabel(a.label);
      const bWide = isWideGenreLabel(b.label);
      if (aWide !== bWide) {
        return aWide ? 1 : -1;
      }
      return 0;
    });
  }, []);
  const visibleGenres = sortGenresForDisplay(showAllGenres ? selectableGenres : selectedHiddenGenre ? [...mainGenres, selectedHiddenGenre] : mainGenres);
  const selectArea = useCallback((value: string) => {
    if (randomState.area) {
      onRandomized?.('area');
    }
    onAreaChange(value);
  }, [onAreaChange, onRandomized, randomState.area]);
  const randomizeArea = useCallback(() => {
    if (!randomState.area) {
      const randomPreset = pickRandomTravelAreaPreset();
      onAreaChange(getAreaPresetSearchValue(randomPreset));
    }
    onRandomized?.('area');
  }, [onAreaChange, onRandomized, randomState.area]);
  const randomizeBudget = useCallback(() => {
    if (!randomState.budget) {
      onBudgetMinChange('0');
      onBudgetMaxChange(pickRandomBudgetValue(budgetMax));
    }
    onRandomized?.('budget');
  }, [budgetMax, onBudgetMaxChange, onBudgetMinChange, onRandomized, randomState.budget]);
  const randomizeDistance = useCallback(() => {
    if (!randomState.distance) {
      onDistanceChange(pickRandomDifferent(DISTANCE_OPTIONS, distance));
    }
    onRandomized?.('distance');
  }, [distance, onDistanceChange, onRandomized, randomState.distance]);
  const randomizeGenre = useCallback(() => {
    if (randomState.genre) {
      onRandomized?.('genre');
      return;
    }
    const genreCandidates = selectableGenres.filter((item) => item.label !== 'すべて');
    const nextGenre = pickRandomDifferent(genreCandidates.length ? genreCandidates : selectableGenres, selectableGenres.find((item) => item.label === genre) ?? selectableGenres[0]);
    if (nextGenre) {
      onGenreChange(nextGenre.label);
      onRandomized?.('genre');
    }
  }, [genre, onGenreChange, onRandomized, randomState.genre, selectableGenres]);
  const distanceOriginHelp = useMemo(() => {
    const cleanArea = area.trim();
    if (randomState.area) {
      return formatDistanceOriginSentence('ランダムの街', distance);
    }
    if (!cleanArea || cleanArea === '現在地') {
      return formatDistanceOriginSentence('現在地', distance);
    }
    if (isPrefectureName(cleanArea)) {
      return uiText.distanceOriginWideArea;
    }

    const searchOrigin = getSearchOriginForArea(cleanArea, null);
    if (searchOrigin) {
      return formatDistanceOriginSentence(searchOrigin.label, distance);
    }

    return uiText.distanceOriginKeywordArea;
  }, [area, distance, randomState.area, uiText]);

  return (
    <View style={styles.filterPanel}>
      <View style={styles.filterHeader}>
        <Text style={styles.panelTitle}>{uiText.todayConditions}</Text>
        <Pressable style={styles.refreshButton} onPress={onSubmit}>
          <Text style={styles.refreshButtonText}>{uiText.refreshCandidates}</Text>
        </Pressable>
      </View>
      {showAreaPicker && (
        <>
          <View style={styles.locationField}>
            <Text style={styles.fieldIcon}>⌖</Text>
            <TextInput
              value={randomState.area ? '？' : area}
              onChangeText={selectArea}
              editable={!randomState.area}
              style={[styles.locationInput, randomState.area && styles.locationInputRandom]}
              placeholder={uiText.areaInputPlaceholder}
              placeholderTextColor="#9b9184"
            />
            <Pressable style={[styles.locationRandomButton, randomState.area && styles.locationRandomButtonActive]} onPress={randomizeArea}>
              <Ionicons name="shuffle-outline" size={14} color={randomState.area ? '#ffffff' : ORANGE} />
              <Text style={[styles.locationRandomButtonText, randomState.area && styles.locationRandomButtonTextActive]}>{uiText.random}</Text>
            </Pressable>
          </View>
          {randomState.area ? (
            <View style={styles.areaRandomHiddenCard}>
              <Text style={styles.areaRandomHiddenTitle}>{uiText.areaHiddenTitle}</Text>
              <Text style={styles.areaRandomHiddenLead}>{uiText.areaHiddenLead}</Text>
            </View>
          ) : (
            <AreaPresetPicker selectedArea={area} distance={distance} presets={areaPresets} onSelect={selectArea} onUseCurrentLocation={onUseCurrentLocation} uiText={uiText} />
          )}
        </>
      )}
      <View style={styles.filterGrid}>
        <SmallField label={uiText.budget} value={budgetMax} suffix={uiText.budgetWithin} onChangeText={onBudgetMaxChange} onRandom={randomizeBudget} randomActive={randomState.budget} randomLabel={uiText.random} />
        <SegmentedValue label={uiText.distanceLabel} value={distance} values={DISTANCE_OPTIONS} onChange={onDistanceChange} onRandom={randomizeDistance} randomActive={randomState.distance} randomLabel={uiText.random} helperText={distanceOriginHelp} />
      </View>
      <View style={styles.genreSectionHeader}>
        <Text style={styles.genreSectionTitle}>{uiText.genreLabel}</Text>
        <Pressable style={[styles.randomMiniButton, randomState.genre && styles.randomMiniButtonActive]} onPress={randomizeGenre}>
          <Ionicons name="shuffle-outline" size={14} color={randomState.genre ? '#ffffff' : ORANGE} />
          <Text style={[styles.randomMiniButtonText, randomState.genre && styles.randomMiniButtonTextActive]}>{uiText.random}</Text>
        </Pressable>
      </View>
      <View style={styles.genreGridTwo}>
        {visibleGenres.map((item, index) => {
          const selected = !randomState.genre && genre === item.label;
          const wideGenre = isWideGenreLabel(item.label);
          return (
            <Pressable
              key={`${item.label}-${index}`}
              style={[styles.genreChip, wideGenre && styles.genreChipWide, selected && { borderColor: item.color, backgroundColor: '#fff7ed' }]}
              onPress={() => onGenreChange(item.label)}
            >
              <View
                style={[
                  styles.genreIconChip,
                  wideGenre && styles.genreIconChipCompact,
                  { backgroundColor: hexToRgba(item.color, 0.07), borderColor: hexToRgba(item.color, 0.18) },
                  selected && { backgroundColor: '#ffffff', borderColor: item.color },
                ]}
              >
                <Image source={item.image} style={[styles.genreChipImage, wideGenre && styles.genreChipImageCompact, selected && styles.genreChipImageActive]} resizeMode="contain" />
              </View>
              <Text
                style={[styles.genreChipText, wideGenre && styles.genreChipTextWide, selected && { color: item.color }]}
                numberOfLines={1}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {selectableGenres.length > collapsedGenreCount && (
        <Pressable style={styles.showAllGenresButton} onPress={() => setShowAllGenres((current) => !current)}>
          <Text style={styles.showAllGenresText}>{showAllGenres ? uiText.showLessGenres : `${uiText.showAll}（${selectableGenres.length}件）`}</Text>
        </Pressable>
      )}
    </View>
  );
}

type AreaPickerMode = 'popular' | 'station' | 'area';

function AreaPresetPicker({
  selectedArea,
  distance,
  presets,
  onSelect,
  onUseCurrentLocation,
  uiText = UI_TEXT.ja,
}: {
  selectedArea: string;
  distance: string;
  presets: AreaPreset[];
  onSelect: (value: string) => void;
  onUseCurrentLocation?: () => void | Promise<unknown>;
  uiText?: Record<string, string>;
}) {
  const prefectures = useMemo(() => Array.from(new Set(presets.map(getPresetPrefecture).filter(isPrefectureName))), [presets]);
  const selectedPreset = getAreaPreset(selectedArea);
  const selectedAreaPrefecture = selectedPreset
    ? getPresetPrefecture(selectedPreset)
    : isPrefectureName(selectedArea)
      ? selectedArea
      : getPrefectureFromText(selectedArea);
  const fallbackPrefecture = selectedAreaPrefecture && prefectures.includes(selectedAreaPrefecture)
    ? selectedAreaPrefecture
    : prefectures[0] ?? '大阪府';
  const [areaQuery, setAreaQuery] = useState('');
  const [selectedPrefecture, setSelectedPrefecture] = useState(fallbackPrefecture);
  const [areaMode, setAreaMode] = useState<AreaPickerMode>('popular');
  const [showAllPopularAreas, setShowAllPopularAreas] = useState(false);
  const [showAllOtherAreas, setShowAllOtherAreas] = useState(false);
  const selectedPrefectureAreas = useMemo(
    () => sortAreaPresetsForPicker(
      uniqueAreaPresets(
        presets.filter((preset) =>
          getPresetPrefecture(preset) === selectedPrefecture
          && preset.label !== '現在地'
          && preset.label !== selectedPrefecture,
        ),
      ),
      selectedPrefecture,
    ),
    [presets, selectedPrefecture],
  );
  const filteredPrefectureAreas = useMemo(() => {
    if (areaMode === 'station') {
      return selectedPrefectureAreas.filter(isStationLikePreset);
    }
    if (areaMode === 'area') {
      return selectedPrefectureAreas.filter((preset) => !isStationLikePreset(preset));
    }
    return selectedPrefectureAreas;
  }, [areaMode, selectedPrefectureAreas]);
  const popularAreaPresets = filteredPrefectureAreas.filter(hasUsablePresetCoordinates);
  const otherAreaPresets = filteredPrefectureAreas.filter((preset) => !hasUsablePresetCoordinates(preset));
  const visiblePopularAreas = showAllPopularAreas ? popularAreaPresets : popularAreaPresets.slice(0, 12);
  const visibleOtherAreas = showAllOtherAreas ? otherAreaPresets : otherAreaPresets.slice(0, 12);
  const searchResults = useMemo(() => {
    const query = areaQuery.trim().toLowerCase();
    if (!query) {
      return [];
    }
    return uniqueAreaPresets(presets.filter((preset) => getAreaPresetSearchText(preset).includes(query))).slice(0, 24);
  }, [areaQuery, presets]);
  const hasQuery = areaQuery.trim().length > 0;
  const tabs: { key: AreaPickerMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: 'popular', label: uiText.areaTabPopular, icon: 'flame-outline' },
    { key: 'station', label: uiText.areaTabStation, icon: 'train-outline' },
    { key: 'area', label: uiText.areaTabArea, icon: 'location-outline' },
  ];
  const currentLocationSelected = selectedArea.trim() === '現在地';
  const currentLocationHelp = formatDistanceOriginSentence('現在地', distance);
  const selectedSettingText = currentLocationSelected
      ? `${uiText.currentLocation} / ${distance}`
    : selectedPreset
      ? `${selectedPreset.group} / ${selectedPreset.label}周辺`
    : selectedArea
      ? `${selectedArea}周辺`
      : `${selectedPrefecture} / 全域`;

  useEffect(() => {
    setSelectedPrefecture(fallbackPrefecture);
  }, [fallbackPrefecture]);

  useEffect(() => {
    setShowAllPopularAreas(false);
    setShowAllOtherAreas(false);
  }, [areaMode, selectedPrefecture]);

  const selectPreset = (item: AreaPreset) => {
    onSelect(getAreaPresetValue(item));
    setSelectedPrefecture(getPresetPrefecture(item));
  };

  const selectCurrentLocation = async () => {
    onSelect('現在地');
    setAreaQuery('');
    await onUseCurrentLocation?.();
  };

  const renderAreaChoice = (item: AreaPreset, index: number) => {
    const itemValue = getAreaPresetValue(item);
    const selected = selectedArea === itemValue || selectedArea === item.label || selectedArea === getAreaPresetSearchValue(item);
    return (
      <Pressable
        key={`${getAreaPresetKey(item)}-${index}`}
        style={[styles.areaChoiceChip, selected && styles.areaChoiceChipActive]}
        onPress={() => selectPreset(item)}
      >
        <Text style={[styles.areaChoiceText, selected && styles.areaChoiceTextActive]} numberOfLines={2}>{item.label}</Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.areaPicker}>
      <View style={styles.areaPickerHeader}>
        <Text style={styles.areaPickerTitle}>{uiText.areaSearchTitle}</Text>
        <Text style={styles.areaPickerMeta}>{prefectures.length}{uiText.prefectureCount} / {presets.length}エリア</Text>
      </View>
      <View style={styles.areaSearchBox}>
        <Text style={styles.areaSearchIcon}>⌕</Text>
        <TextInput
          value={areaQuery}
          onChangeText={setAreaQuery}
          style={styles.areaSearchInput}
          placeholder={uiText.areaSearchPlaceholder}
          placeholderTextColor="#9b9184"
        />
        {!!areaQuery && (
          <Pressable style={styles.areaSearchClear} onPress={() => setAreaQuery('')}>
            <Text style={styles.areaSearchClearText}>×</Text>
          </Pressable>
        )}
      </View>
      <View style={styles.areaPickerCard}>
        <Pressable
          style={[styles.areaCurrentLocationSelect, currentLocationSelected && styles.areaCurrentLocationSelectActive]}
          onPress={selectCurrentLocation}
        >
          <View style={[styles.areaCurrentLocationIcon, currentLocationSelected && styles.areaCurrentLocationIconActive]}>
            <Ionicons name="navigate" size={19} color={currentLocationSelected ? '#ffffff' : ORANGE} />
          </View>
          <View style={styles.areaCurrentLocationBody}>
            <Text style={[styles.areaCurrentLocationTitle, currentLocationSelected && styles.areaCurrentLocationTitleActive]}>{uiText.currentLocation}</Text>
            <Text style={[styles.areaCurrentLocationLead, currentLocationSelected && styles.areaCurrentLocationLeadActive]}>{currentLocationHelp}</Text>
          </View>
          <Ionicons name={currentLocationSelected ? 'checkmark-circle' : 'chevron-forward'} size={20} color={currentLocationSelected ? ORANGE : '#8a8178'} />
        </Pressable>
        {hasQuery ? (
        <View style={styles.areaGroupNoFrame}>
          <Text style={styles.areaGroupTitle}>{uiText.searchResults}</Text>
          <View style={styles.areaChoiceGrid}>
            {searchResults.map((item, index) => {
              const itemValue = getAreaPresetValue(item);
              const selected = selectedArea === itemValue || selectedArea === item.label || selectedArea === getAreaPresetSearchValue(item);
              return (
                <Pressable
                  key={`${getAreaPresetKey(item)}-${index}`}
                  style={[styles.areaResultCard, selected && styles.areaChipActive]}
                  onPress={() => {
                    onSelect(itemValue);
                    setSelectedPrefecture(getPresetPrefecture(item));
                  }}
                >
                  <Text style={[styles.areaResultName, selected && styles.areaChipTextActive]}>{item.label}</Text>
                  <Text style={[styles.areaResultGroup, selected && styles.areaChipTextActive]}>{item.group}</Text>
                </Pressable>
              );
            })}
            {searchResults.length === 0 && <Text style={styles.areaNoResult}>{uiText.noAreaResult}</Text>}
          </View>
        </View>
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.prefectureStrip}>
            {prefectures.map((prefecture) => {
              const selected = selectedPrefecture === prefecture;
              return (
                <Pressable key={prefecture} style={[styles.prefectureChip, selected && styles.prefectureChipActive]} onPress={() => setSelectedPrefecture(prefecture)}>
                  <Text style={[styles.prefectureChipText, selected && styles.prefectureChipTextActive]}>{prefecture}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <View style={styles.areaModeTabs}>
            {tabs.map((tab) => {
              const selected = areaMode === tab.key;
              return (
                <Pressable key={tab.key} style={[styles.areaModeTab, selected && styles.areaModeTabActive]} onPress={() => setAreaMode(tab.key)}>
                  <Ionicons name={tab.icon} size={18} color={selected ? ORANGE : '#8a8178'} />
                  <Text style={[styles.areaModeTabText, selected && styles.areaModeTabTextActive]}>{tab.label}</Text>
                </Pressable>
              );
            })}
          </View>
          {popularAreaPresets.length > 0 && (
            <View style={styles.areaSection}>
              <View style={styles.areaSectionHeader}>
                <View style={styles.areaSectionTitleRow}>
                  <Ionicons name="star" size={20} color={ORANGE} />
                  <Text style={styles.areaSectionTitle}>{uiText.popularAreasTitle}</Text>
                </View>
                {popularAreaPresets.length > 12 && (
                  <Pressable style={styles.areaSeeAllButton} onPress={() => setShowAllPopularAreas((current) => !current)}>
                    <Text style={styles.areaSeeAllText}>{showAllPopularAreas ? uiText.hideCities : uiText.showAll}</Text>
                    <Ionicons name={showAllPopularAreas ? 'chevron-up' : 'chevron-forward'} size={14} color={ORANGE} />
                  </Pressable>
                )}
              </View>
              <View style={styles.areaChoiceGrid}>
                {visiblePopularAreas.map(renderAreaChoice)}
              </View>
            </View>
          )}
          {otherAreaPresets.length > 0 && (
            <View style={styles.areaSection}>
              <View style={styles.areaSectionDivider} />
              <View style={styles.areaSectionHeader}>
                <View style={styles.areaSectionTitleRow}>
                  <Ionicons name="grid" size={19} color="#77716b" />
                  <Text style={styles.areaSectionTitle}>{uiText.otherAreasTitle}</Text>
                </View>
                {otherAreaPresets.length > 12 && (
                  <Pressable style={styles.areaSeeAllButton} onPress={() => setShowAllOtherAreas((current) => !current)}>
                    <Text style={styles.areaSeeAllText}>{showAllOtherAreas ? uiText.hideCities : uiText.showAll}</Text>
                    <Ionicons name={showAllOtherAreas ? 'chevron-up' : 'chevron-forward'} size={14} color={ORANGE} />
                  </Pressable>
                )}
              </View>
              <View style={styles.areaChoiceGrid}>
                {visibleOtherAreas.map(renderAreaChoice)}
              </View>
            </View>
          )}
        </>
      )}
      </View>
      <View style={styles.areaCurrentSettingCard}>
        <View style={styles.areaCurrentIcon}>
          <Ionicons name="location" size={18} color={ORANGE} />
        </View>
        <View style={styles.areaCurrentBody}>
          <Text style={styles.areaCurrentLabel}>{uiText.currentSetting}</Text>
          <Text style={styles.areaCurrentText} numberOfLines={2}>{selectedSettingText}</Text>
        </View>
        <Pressable style={styles.areaCurrentButton} onPress={() => setAreaQuery('')}>
          <Text style={styles.areaCurrentButtonText}>{uiText.changeSetting}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function RandomFieldHeader({ label, onRandom, randomActive = false, randomLabel = 'ランダム' }: { label: string; onRandom?: () => void; randomActive?: boolean; randomLabel?: string }) {
  return (
    <View style={styles.fieldHeaderRow}>
      <Text style={styles.smallFieldLabel}>{label}</Text>
      {!!onRandom && (
        <Pressable style={[styles.randomMiniButton, randomActive && styles.randomMiniButtonActive]} onPress={onRandom}>
          <Ionicons name="shuffle-outline" size={14} color={randomActive ? '#ffffff' : ORANGE} />
          <Text style={[styles.randomMiniButtonText, randomActive && styles.randomMiniButtonTextActive]}>{randomLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

function SmallField({
  label,
  value,
  suffix,
  onChangeText,
  onRandom,
  randomActive = false,
  randomLabel = 'ランダム',
}: {
  label: string;
  value: string;
  suffix: string;
  onChangeText: (value: string) => void;
  onRandom?: () => void;
  randomActive?: boolean;
  randomLabel?: string;
}) {
  return (
    <View style={styles.smallField}>
      <RandomFieldHeader label={label} onRandom={onRandom} randomActive={randomActive} randomLabel={randomLabel} />
      <View style={styles.smallFieldRow}>
        {randomActive ? (
          <Pressable style={styles.randomHiddenInput} onPress={() => onChangeText(value)}>
            <Text style={styles.randomHiddenInputText}>？</Text>
          </Pressable>
        ) : (
          <>
            <TextInput value={value} onChangeText={onChangeText} style={styles.smallInput} keyboardType="number-pad" />
            <Text style={styles.smallSuffix}>{suffix}</Text>
          </>
        )}
      </View>
    </View>
  );
}

function SegmentedValue({
  label,
  value,
  values,
  onChange,
  onRandom,
  randomActive = false,
  randomLabel = 'ランダム',
  helperText,
}: {
  label: string;
  value: string;
  values: string[];
  onChange: (value: string) => void;
  onRandom?: () => void;
  randomActive?: boolean;
  randomLabel?: string;
  helperText?: string;
}) {
  return (
    <View style={styles.segmentWrap}>
      <RandomFieldHeader label={label} onRandom={onRandom} randomActive={randomActive} randomLabel={randomLabel} />
      {helperText ? <Text style={styles.segmentHelperText}>{helperText}</Text> : null}
      <View style={styles.segmentGroup}>
        {values.map((item) => {
          const selected = !randomActive && value === item;
          return (
          <Pressable key={item} style={[styles.segment, selected && styles.segmentActive]} onPress={() => onChange(item)}>
            <Text style={[styles.segmentText, selected && styles.segmentTextActive]}>{item}</Text>
          </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function SearchTab({
  uiText,
  apiBaseUrl,
  area,
  genre,
  budgetMin,
  budgetMax,
  distance,
  drawMode,
  conditionRandom,
  restaurants,
  isLoading,
  onApiBaseUrlChange,
  onAreaChange,
  onGenreChange,
  onBudgetMinChange,
  onBudgetMaxChange,
  onDistanceChange,
  onConditionRandomize,
  onRequestCurrentLocation,
  onSearch,
  onRandomPress,
  onAllRandomPress,
  onRestaurantSave,
  isRestaurantSaved,
}: {
  uiText: Record<string, string>;
  apiBaseUrl: string;
  area: string;
  genre: string;
  budgetMin: string;
  budgetMax: string;
  distance: string;
  drawMode: DrawMode;
  conditionRandom: ConditionRandomState;
  restaurants: Restaurant[];
  isLoading: boolean;
  onApiBaseUrlChange: (value: string) => void;
  onAreaChange: (value: string) => void;
  onGenreChange: (value: string) => void;
  onBudgetMinChange: (value: string) => void;
  onBudgetMaxChange: (value: string) => void;
  onDistanceChange: (value: string) => void;
  onConditionRandomize: (field: ConditionRandomField) => void;
  onRequestCurrentLocation: () => void | Promise<unknown>;
  onSearch: () => void;
  onRandomPress: () => void;
  onAllRandomPress: () => void;
  onRestaurantSave: (restaurant: Restaurant) => void;
  isRestaurantSaved: (restaurant: Restaurant) => boolean;
}) {
  const isEverythingRandom = drawMode === 'everything';
  const summaryBudget = isEverythingRandom || conditionRandom.budget ? '？' : formatBudgetLimit(budgetMax, uiText);
  const summaryDistance = isEverythingRandom || conditionRandom.distance ? '？' : distance;
  const summaryGenre = isEverythingRandom || conditionRandom.genre ? '？' : genre;

  return (
    <View>
      <PageIntro title={uiText.pageConditionsTitle} lead={uiText.pageConditionsLead} />
      <View style={styles.apiCard}>
        <Text style={styles.apiLabel}>{uiText.apiUrl}</Text>
        <TextInput value={apiBaseUrl} onChangeText={onApiBaseUrlChange} style={styles.apiInput} autoCapitalize="none" />
      </View>
      <FilterPanel
        area={area}
        genre={genre}
        budgetMin={budgetMin}
        budgetMax={budgetMax}
        distance={distance}
        genres={GENRES}
        areaPresets={ALL_AREA_PRESETS}
        conditionRandom={conditionRandom}
        uiText={uiText}
        onUseCurrentLocation={onRequestCurrentLocation}
        onAreaChange={onAreaChange}
        onGenreChange={onGenreChange}
        onBudgetMinChange={onBudgetMinChange}
        onBudgetMaxChange={onBudgetMaxChange}
        onDistanceChange={onDistanceChange}
        onRandomized={onConditionRandomize}
        onSubmit={onSearch}
      />
      <View style={styles.decisionSummary}>
        <View style={styles.decisionSummaryChip}>
          <Text style={styles.decisionSummaryLabel}>{uiText.budget}</Text>
          <Text style={styles.decisionSummaryValue}>{summaryBudget}</Text>
        </View>
        <View style={styles.decisionSummaryChip}>
          <Text style={styles.decisionSummaryLabel}>{uiText.distanceLabel}</Text>
          <Text style={styles.decisionSummaryValue}>{summaryDistance}</Text>
        </View>
        <View style={styles.decisionSummaryChip}>
          <Text style={styles.decisionSummaryLabel}>{uiText.genreLabel}</Text>
          <Text style={styles.decisionSummaryValue} numberOfLines={1}>{summaryGenre}</Text>
        </View>
      </View>
      <View style={styles.decisionActionRow}>
        <Pressable style={[styles.bigDecisionButton, styles.bigDecisionButtonPrimary]} onPress={onRandomPress}>
          <Text style={styles.bigDecisionSmall}>{isLoading ? uiText.checkingCandidates : `${restaurants.length}${uiText.candidateDrawSuffix}`}</Text>
          <Text style={styles.bigDecisionText}>{uiText.decisionButton}</Text>
        </Pressable>
        <Pressable style={[styles.bigDecisionButton, styles.bigDecisionButtonRandom]} onPress={onAllRandomPress}>
          <Ionicons name="shuffle-outline" size={21} color="#ffffff" />
          <Text style={styles.allRandomDecisionText}>{uiText.allRandom}</Text>
        </Pressable>
      </View>
      <SectionHeader title={uiText.candidateList} action={`${restaurants.length}件`} />
      {restaurants.map((restaurant) => (
        <RestaurantCard
          key={restaurant.id}
          restaurant={restaurant}
          uiText={uiText}
          isSaved={isRestaurantSaved(restaurant)}
          onSavePress={() => onRestaurantSave(restaurant)}
        />
      ))}
    </View>
  );
}

function RandomTab({
  uiText,
  area,
  genre,
  budgetMin,
  budgetMax,
  distance,
  message,
  isLoading,
  selectedRestaurant,
  userLocation,
  mapCandidates,
  mapRouletteTarget,
  mapRouletteStatus,
  mapRouletteError,
  history,
  conditionRandom,
  travelRevealStep,
  travelDisplayArea,
  drawAnimationKey,
  drawMode,
  mealTicketState,
  spinValue,
  mapPinProgress,
  mapPinBounce,
  resultRevealValue,
  onTabLayout,
  onResultLayout,
  onRandomPress,
  onSavePress,
  onGoPress,
  onChangeConditions,
  onExpandDistance,
  onRelaxConditions,
  isSelectedRestaurantSaved,
}: {
  uiText: Record<string, string>;
  area: string;
  genre: string;
  budgetMin: string;
  budgetMax: string;
  distance: string;
  message: string;
  isLoading: boolean;
  selectedRestaurant: Restaurant | null;
  userLocation: UserLocation | null;
  mapCandidates: CandidatePlace[];
  mapRouletteTarget: CandidatePlace | null;
  mapRouletteStatus: MapRouletteStatus;
  mapRouletteError: string | null;
  history: Restaurant[];
  conditionRandom: ConditionRandomState;
  travelRevealStep: TravelRevealStep;
  travelDisplayArea: string | null;
  drawAnimationKey: DrawAnimationKey;
  drawMode: DrawMode;
  mealTicketState: MealTicketState;
  spinValue: Animated.Value;
  mapPinProgress: Animated.Value;
  mapPinBounce: Animated.Value;
  resultRevealValue: Animated.Value;
  onTabLayout: (offsetY: number) => void;
  onResultLayout: (offsetY: number) => void;
  onRandomPress: () => void;
  onSavePress: () => void;
  onGoPress: () => void;
  onChangeConditions: () => void;
  onExpandDistance: () => void;
  onRelaxConditions: () => void;
  isSelectedRestaurantSaved: boolean;
}) {
  const isEverythingRandom = drawMode === 'everything';
  const isTravelDraw = drawMode === 'travel';
  const drawAnimation = DRAW_ANIMATION_PROFILES[drawAnimationKey];
  const canShowTravelGenre = !isTravelDraw || travelRevealStep === 'genre' || travelRevealStep === 'area' || travelRevealStep === 'restaurant';
  const canShowTravelArea = !isTravelDraw || travelRevealStep === 'area' || travelRevealStep === 'restaurant';
  const displayAreaBase = isTravelDraw && travelDisplayArea ? travelDisplayArea : area;
  const displayArea = isEverythingRandom || conditionRandom.area || (isTravelDraw && !canShowTravelArea) ? '？' : displayAreaBase;
  const displayGenre = isEverythingRandom || conditionRandom.genre || (isTravelDraw && !canShowTravelGenre) ? '？' : genre;
  const displayBudget = isEverythingRandom || conditionRandom.budget ? '？' : formatBudgetLimit(budgetMax, uiText);
  const displayDistance = isEverythingRandom || conditionRandom.distance || (isTravelDraw && !canShowTravelArea) ? '？' : distance;
  const currentTicket = mealTicketState.current;
  const ticketAvailable = !FEATURE_MEAL_TICKETS_ENABLED || currentTicket.available;
  const statusText = FEATURE_MEAL_TICKETS_ENABLED && !ticketAvailable
    ? 'NEXT DRAW LOCKED'
    : isLoading
    ? drawAnimation.activeStatus
    : isEverythingRandom
      ? 'ALL RANDOM READY'
      : isTravelDraw
        ? 'TRAVEL READY'
      : 'READY TO DRAW';
  const startText = FEATURE_MEAL_TICKETS_ENABLED && !ticketAvailable
    ? currentTicket.proOnly && !mealTicketState.isProUser
      ? '深夜はPro限定'
      : '次の抽選を待つ'
    : isEverythingRandom
      ? '完全ランダム START'
      : isTravelDraw
        ? '旅ルーレット START'
      : 'PRESS START';
  const ticketOpacity = spinValue.interpolate({ inputRange: [0, 0.08, 0.9, 1], outputRange: [0, 1, 1, 0.96] });
  const ticketLift = spinValue.interpolate({ inputRange: [0, 0.28, 0.68, 1], outputRange: [46, 22, -10, 0] });
  const ticketRotate = spinValue.interpolate({ inputRange: [0, 0.52, 1], outputRange: ['-8deg', '7deg', '0deg'] });
  const shuffleOneX = spinValue.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [-34, 30, -18, 16, -24] });
  const shuffleTwoX = spinValue.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, -28, 26, -12, 0] });
  const shuffleThreeX = spinValue.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [34, -18, 32, -26, 24] });
  const shuffleCardY = spinValue.interpolate({ inputRange: [0, 0.35, 0.72, 1], outputRange: [0, -12, 10, 0] });
  const shuffleCardScale = spinValue.interpolate({ inputRange: [0, 0.45, 1], outputRange: [1, 1.08, 1] });
  const radarRotate = spinValue.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '720deg'] });
  const radarPulseScale = spinValue.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.82, 1.2, 1.04] });
  const radarPulseOpacity = spinValue.interpolate({ inputRange: [0, 0.42, 1], outputRange: [0.14, 0.58, 0.18] });
  const resultScale = resultRevealValue.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.92, 1.03, 1] });
  const resultTranslateY = resultRevealValue.interpolate({ inputRange: [0, 1], outputRange: [28, 0] });
  const visibleSelectedRestaurant = isTravelDraw && travelRevealStep !== 'restaurant' ? null : selectedRestaurant;
  const actualTravelGenre = isTravelDraw && selectedRestaurant && !restaurantMatchesSelectedGenre(selectedRestaurant, genre)
    ? selectedRestaurant.genre
    : genre;
  const hasHiddenDrawCondition = isEverythingRandom || isTravelDraw
    || conditionRandom.area
    || conditionRandom.budget
    || conditionRandom.distance
    || conditionRandom.genre;
  const shouldShowDrawReveal = hasHiddenDrawCondition && (isLoading || selectedRestaurant != null || (isTravelDraw && travelRevealStep !== 'hidden'));
  const revealedArea = isEverythingRandom ? uiText.allRandom : isTravelDraw && !canShowTravelArea ? '？' : displayAreaBase;
  const revealedGenre = isEverythingRandom ? uiText.allRandom : isTravelDraw && !canShowTravelGenre ? '？' : actualTravelGenre;
  const revealedBudget = isEverythingRandom ? 'おまかせ' : formatBudgetLimit(budgetMax, uiText);
  const revealedDistance = isEverythingRandom ? 'おまかせ' : isTravelDraw && !canShowTravelArea ? '？' : distance;
  const revealItems = [
    { label: uiText.genreLabel, value: revealedGenre, active: isEverythingRandom || conditionRandom.genre || isTravelDraw },
    { label: 'エリア', value: revealedArea, active: isEverythingRandom || conditionRandom.area || isTravelDraw },
    { label: uiText.budget, value: revealedBudget, active: isEverythingRandom || conditionRandom.budget },
    { label: uiText.distanceLabel, value: revealedDistance, active: isEverythingRandom || conditionRandom.distance || isTravelDraw },
  ];
  const language = getUiLanguage(uiText);
  const areaLabel = language === 'en' ? 'Area' : language === 'zh' ? '地区' : language === 'ko' ? '지역' : 'エリア';
  const formatHiddenCondition = (label: string, value: string) => value === '？' ? `${label}？` : value;
  const conditionGenreLabel = formatHiddenCondition(uiText.genreLabel, displayGenre);
  const conditionAreaLabel = formatHiddenCondition(areaLabel, displayArea);
  const conditionBudgetLabel = formatHiddenCondition(uiText.budget, displayBudget);
  const conditionDistanceLabel = formatHiddenCondition(uiText.distanceLabel, displayDistance);
  const selectedSearchOrigin = useMemo(
    () => {
      if (isEverythingRandom || conditionRandom.area || (isTravelDraw && !canShowTravelArea)) {
        return userLocation;
      }
      return getSearchOriginForArea(displayAreaBase, userLocation) ?? getSearchOriginForArea(area, userLocation) ?? userLocation;
    },
    [area, canShowTravelArea, conditionRandom.area, displayAreaBase, isEverythingRandom, isTravelDraw, userLocation],
  );
  const rouletteConditionItems = [
    { label: uiText.genreLabel, value: displayGenre, icon: 'restaurant-outline', active: true },
    { label: areaLabel, value: displayArea, icon: 'location-outline', active: false },
    { label: uiText.budget, value: displayBudget, icon: 'wallet-outline', active: false },
    { label: uiText.distanceLabel, value: displayDistance, icon: 'navigate-outline', active: false },
  ] as const;
  const rouletteMapBubbles = [
    { label: displayGenre === '？' ? 'ジャンル？' : displayGenre, icon: 'restaurant-outline', color: '#5aa86f', style: styles.rouletteMapBubbleTop },
    { label: displayArea === '？' ? 'エリア？' : displayArea, icon: 'location-outline', color: '#e9a420', style: styles.rouletteMapBubbleRight },
    { label: displayDistance === '？' ? '近場？' : displayDistance, icon: 'navigate-outline', color: '#ef6a35', style: styles.rouletteMapBubbleLeft },
    { label: '居酒屋', icon: 'wine-outline', color: '#8c63d8', style: styles.rouletteMapBubbleUpperLeft },
    { label: '和食', icon: 'restaurant-outline', color: '#d94b42', style: styles.rouletteMapBubbleLowerRight },
    { label: 'カフェ', icon: 'cafe-outline', color: '#55a8d6', style: styles.rouletteMapBubbleBottom },
  ] as const;
  const mapUsesNativeUserLocation = Boolean(
    selectedSearchOrigin &&
    userLocation &&
    Math.abs(selectedSearchOrigin.latitude - userLocation.latitude) < 0.000001 &&
    Math.abs(selectedSearchOrigin.longitude - userLocation.longitude) < 0.000001,
  );
  const hasFocusedGenrePins = displayGenre !== '？' && displayGenre !== uiText.allRandom && displayGenre !== 'すべて';
  const openDrawMapInGoogleMaps = useCallback(() => {
    const destination = mapRouletteTarget ?? mapCandidates[0] ?? selectedSearchOrigin;
    if (!destination) {
      return;
    }
    if ('googleMapsUri' in destination && destination.googleMapsUri) {
      Linking.openURL(destination.googleMapsUri);
      return;
    }
    const queryValue = encodeURIComponent(`${destination.latitude},${destination.longitude}`);
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${queryValue}`);
  }, [mapCandidates, mapRouletteTarget, selectedSearchOrigin]);
  const distanceOriginText = useMemo(() => {
    const originName = selectedSearchOrigin?.label ?? (displayArea !== '？' ? displayArea : '選択地点');
    return displayDistance === '？'
      ? `距離は${formatDistanceOriginName(originName)}からの距離です`
      : formatDistanceOriginSentence(originName, displayDistance);
  }, [displayArea, displayDistance, selectedSearchOrigin]);

  return (
    <View onLayout={(event) => onTabLayout(event.nativeEvent.layout.y)}>
      <View style={styles.drawConditionRow}>
        <ConditionPill label={conditionGenreLabel} active />
        <ConditionPill label={conditionAreaLabel} />
        <ConditionPill label={conditionBudgetLabel} />
        <ConditionPill label={conditionDistanceLabel} />
        <Pressable style={styles.drawConditionMapButton} onPress={openDrawMapInGoogleMaps}>
          <Ionicons name="open-outline" size={13} color={INK} />
          <Text style={styles.drawConditionMapButtonText}>Google Mapへ</Text>
        </Pressable>
      </View>
      <Text style={styles.drawDistanceOriginText}>{distanceOriginText}</Text>
      <View style={[styles.drawStage, isLoading && styles.drawStageLoading]}>
        <View style={styles.rouletteButton}>
          <View style={styles.rouletteMapHeader}>
            <View style={styles.rouletteMapHeaderCopy}>
              <Text style={styles.rouletteMapKicker}>RANDISH MAP DRAW</Text>
              <Text style={styles.rouletteMapTitle}>{isLoading ? '地図の上から候補を探しています' : '地図の上から一店を選びます'}</Text>
              <Text style={styles.rouletteMapSub}>{isLoading ? drawAnimation.loadingMessage : 'STARTで候補ピンから一店を選びます'}</Text>
            </View>
            <View style={styles.rouletteStatusPill}>
              <Text style={styles.rouletteStatusText}>{statusText}</Text>
            </View>
          </View>
          <RouletteMapView
            center={selectedSearchOrigin}
            candidates={mapCandidates}
            target={mapRouletteTarget}
            status={mapRouletteStatus}
            progress={mapPinProgress}
            bounce={mapPinBounce}
            loading={isLoading}
            fallbackLabel={selectedSearchOrigin?.label ?? displayArea}
            useNativeUserLocationMarker={mapUsesNativeUserLocation}
            genreFocused={hasFocusedGenrePins}
            genreLabel={displayGenre}
          />
          <View style={styles.rouletteHintRow}>
            <Text style={styles.rouletteHintText}>{drawAnimation.hint}</Text>
            <Text style={styles.rouletteHintAccent}>{drawAnimation.accent}</Text>
          </View>
          <View style={styles.rouletteConditionPanel}>
            <View style={styles.rouletteConditionHeader}>
              <View>
                <Text style={styles.rouletteConditionKicker}>DRAW CONDITIONS</Text>
                <Text style={styles.rouletteConditionTitle}>この条件で抽選</Text>
              </View>
              <View style={styles.rouletteConditionLock}>
                <Ionicons name="lock-closed" size={13} color={ORANGE} />
                <Text style={styles.rouletteConditionLockText}>固定</Text>
              </View>
            </View>
            <View style={styles.rouletteConditionGrid}>
              {rouletteConditionItems.map((item, index) => (
                <View key={`${item.label}-${index}`} style={[styles.rouletteConditionItem, item.active && styles.rouletteConditionItemActive]}>
                  <View style={[styles.rouletteConditionIcon, item.active && styles.rouletteConditionIconActive]}>
                    <Ionicons name={item.icon} size={15} color={item.active ? '#ffffff' : '#8f8277'} />
                  </View>
                  <View style={styles.rouletteConditionTextBlock}>
                    <Text style={styles.rouletteConditionLabel}>{item.label}</Text>
                    <Text style={[styles.rouletteConditionValue, item.active && styles.rouletteConditionValueActive]} numberOfLines={1}>{item.value}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
          <Pressable style={[styles.rouletteCta, !ticketAvailable && styles.rouletteCtaLocked]} onPress={onRandomPress} disabled={isLoading || !ticketAvailable}>
            {isLoading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <>
                <Ionicons name={drawAnimation.icon} size={25} color="#ffffff" />
                <Text style={styles.rouletteCtaText}>{startText}</Text>
              </>
            )}
          </Pressable>
          <Text style={styles.rouletteMessage} numberOfLines={3} ellipsizeMode="tail">{message}</Text>
        </View>
      </View>
      {shouldShowDrawReveal && (
        <View style={styles.drawRevealPanel}>
          <View style={styles.drawRevealHeader}>
            <View>
              <Text style={styles.drawRevealKicker}>OPEN RESULT</Text>
              <Text style={styles.drawRevealTitle}>{isLoading ? '条件をひらいています' : '今回の抽選条件'}</Text>
            </View>
            <View style={styles.drawRevealBadge}>
              <Ionicons name={isLoading ? 'sync-outline' : 'checkmark'} size={16} color="#ffffff" />
            </View>
          </View>
          <View style={styles.drawRevealGrid}>
            {revealItems.map((item, index) => (
              <View key={`${item.label}-${index}`} style={[styles.drawRevealItem, item.active && styles.drawRevealItemActive]}>
                <Text style={styles.drawRevealLabel}>{item.label}</Text>
                <Text style={styles.drawRevealValue} numberOfLines={1}>{item.value}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
      {visibleSelectedRestaurant ? (
        <Animated.View
          style={[styles.resultWrap, { opacity: resultRevealValue, transform: [{ translateY: resultTranslateY }, { scale: resultScale }] }]}
          onLayout={(event) => onResultLayout(event.nativeEvent.layout.y)}
        >
          <Text style={styles.resultKicker}>{uiText.resultKicker}</Text>
          <ResultCard
            restaurant={visibleSelectedRestaurant}
            userLocation={userLocation}
            preferredArea={displayAreaBase}
            uiText={uiText}
            onMapPress={onGoPress}
            onFavoritePress={onSavePress}
            isFavorite={isSelectedRestaurantSaved}
            allowExternalPhoto
          />
          <View style={styles.resultActions}>
            <Pressable style={styles.secondaryAction} onPress={onRandomPress}>
              <Text style={styles.secondaryActionText}>{uiText.drawAgain}</Text>
            </Pressable>
            <Pressable style={[styles.secondaryAction, isSelectedRestaurantSaved && styles.secondaryActionDisabled]} onPress={onSavePress} disabled={isSelectedRestaurantSaved}>
              <Text style={styles.secondaryActionText}>{isSelectedRestaurantSaved ? '保存済み' : '保存'}</Text>
            </Pressable>
            <Pressable style={styles.secondaryAction} onPress={onChangeConditions}>
              <Text style={styles.secondaryActionText}>条件を変える</Text>
            </Pressable>
            <Pressable style={styles.primaryAction} onPress={onGoPress}>
              <Text style={styles.primaryActionText}>{uiText.goThisShop}</Text>
            </Pressable>
          </View>
        </Animated.View>
      ) : (
        <View style={styles.emptyPanel}>
          <Text style={styles.emptyTitle}>{mapRouletteStatus === 'empty' ? '近くの候補が見つかりません' : uiText.emptyResultTitle}</Text>
          <Text style={styles.emptyText}>{mapRouletteError ?? uiText.emptyResultText}</Text>
          {(mapRouletteStatus === 'empty' || mapRouletteStatus === 'error') && (
            <View style={styles.emptyActionRow}>
              <Pressable style={styles.emptyActionButton} onPress={onExpandDistance}>
                <Text style={styles.emptyActionText}>検索距離を広げる</Text>
              </Pressable>
              <Pressable style={styles.emptyActionButton} onPress={onRelaxConditions}>
                <Text style={styles.emptyActionText}>条件を減らす</Text>
              </Pressable>
              <Pressable style={styles.emptyActionButton} onPress={onChangeConditions}>
                <Text style={styles.emptyActionText}>エリアを変更する</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}
      <HistorySection history={history} uiText={uiText} />
    </View>
  );
}

function RouletteMapView({
  center,
  candidates,
  target,
  status,
  progress,
  bounce,
  loading,
  fallbackLabel,
  useNativeUserLocationMarker,
  genreFocused,
  genreLabel,
}: {
  center: UserLocation | null;
  candidates: CandidatePlace[];
  target: CandidatePlace | null;
  status: MapRouletteStatus;
  progress: Animated.Value;
  bounce: Animated.Value;
  loading: boolean;
  fallbackLabel: string;
  useNativeUserLocationMarker: boolean;
  genreFocused: boolean;
  genreLabel: string;
}) {
  const [canvasSize, setCanvasSize] = useState({ width: 320, height: 318 });
  const [mapHeading, setMapHeading] = useState(0);
  const [activeCandidateIndex, setActiveCandidateIndex] = useState(0);
  const rouletteMapRef = useRef<any>(null);
  const genrePulse = useRef(new Animated.Value(0)).current;
  const MapModule = useMemo(getNativeMapModule, []);
  const mapCenter = useMemo(() => {
    if (center) {
      return center;
    }
    const reference = target ?? candidates[0];
    if (reference) {
      return { latitude: reference.latitude, longitude: reference.longitude, label: fallbackLabel || '現在地周辺' };
    }
    return { latitude: 35.681236, longitude: 139.767125, label: fallbackLabel || '現在地周辺' };
  }, [candidates, center, fallbackLabel, target]);

  const region = useMemo(() => {
    const latitudes = [mapCenter.latitude, ...candidates.map((candidate) => candidate.latitude)];
    const longitudes = [mapCenter.longitude, ...candidates.map((candidate) => candidate.longitude)];
    const latitudeDelta = Math.max(0.008, (Math.max(...latitudes) - Math.min(...latitudes)) * 1.7 || 0.008);
    const longitudeDelta = Math.max(0.008, (Math.max(...longitudes) - Math.min(...longitudes)) * 1.7 || 0.008);
    return {
      latitude: mapCenter.latitude,
      longitude: mapCenter.longitude,
      latitudeDelta,
      longitudeDelta,
    };
  }, [candidates, mapCenter.latitude, mapCenter.longitude]);
  const [visibleRegion, setVisibleRegion] = useState(region);
  const displayCandidates = useMemo(() => candidates.slice(0, 18), [candidates]);
  const showGenreEffect = genreFocused && (candidates.length > 0 || loading || status === 'searching' || status === 'spinning');
  const activeCandidateId = useMemo(() => {
    if (status === 'result') {
      return target?.id ?? null;
    }
    if (status !== 'spinning' || displayCandidates.length === 0) {
      return null;
    }
    return displayCandidates[activeCandidateIndex % displayCandidates.length]?.id ?? null;
  }, [activeCandidateIndex, displayCandidates, status, target?.id]);

  useEffect(() => {
    setVisibleRegion(region);
    setMapHeading(0);
  }, [region.latitude, region.latitudeDelta, region.longitude, region.longitudeDelta]);

  useEffect(() => {
    if (!showGenreEffect) {
      genrePulse.stopAnimation();
      genrePulse.setValue(0);
      return undefined;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(genrePulse, {
          toValue: 1,
          duration: 920,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(genrePulse, {
          toValue: 0,
          duration: 520,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [genrePulse, showGenreEffect]);

  useEffect(() => {
    if (status !== 'spinning' || !genreFocused || displayCandidates.length <= 1) {
      if (status !== 'result') {
        setActiveCandidateIndex(0);
      }
      return undefined;
    }

    setActiveCandidateIndex(0);
    const intervalId = setInterval(() => {
      setActiveCandidateIndex((current) => {
        const jump = 1 + Math.floor(Math.random() * Math.max(displayCandidates.length - 1, 1));
        return (current + jump) % displayCandidates.length;
      });
    }, 140);

    return () => {
      clearInterval(intervalId);
    };
  }, [displayCandidates.length, genreFocused, status]);

  const handleMapRegionChangeComplete = useCallback((nextRegion: typeof region) => {
    setVisibleRegion(nextRegion);
    const mapRef = rouletteMapRef.current;
    if (!mapRef?.getCamera) {
      return;
    }
    void mapRef.getCamera()
      .then((camera: { heading?: number }) => {
        if (typeof camera.heading === 'number' && Number.isFinite(camera.heading)) {
          setMapHeading(camera.heading);
        }
      })
      .catch(() => undefined);
  }, []);

  const toPoint = useCallback((latitude: number, longitude: number) => {
    const width = Math.max(canvasSize.width, 1);
    const height = Math.max(canvasSize.height, 1);
    const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
    const centerX = width / 2;
    const centerY = height / 2;
    const metersPerDegreeLatitude = 111_320;
    const metersPerDegreeLongitude = Math.max(
      1,
      Math.cos((visibleRegion.latitude * Math.PI) / 180) * metersPerDegreeLatitude,
    );
    const halfWidthMeters = Math.max((visibleRegion.longitudeDelta * metersPerDegreeLongitude) / 2, 1);
    const halfHeightMeters = Math.max((visibleRegion.latitudeDelta * metersPerDegreeLatitude) / 2, 1);
    const scale = Math.min((width * 0.84) / (halfWidthMeters * 2), (height * 0.74) / (halfHeightMeters * 2));
    const rawX = centerX + ((longitude - visibleRegion.longitude) * metersPerDegreeLongitude * scale);
    const rawY = centerY - ((latitude - visibleRegion.latitude) * metersPerDegreeLatitude * scale);
    const headingRadians = -(mapHeading * Math.PI) / 180;
    const dx = rawX - centerX;
    const dy = rawY - centerY;
    const rotatedX = centerX + dx * Math.cos(headingRadians) - dy * Math.sin(headingRadians);
    const rotatedY = centerY + dx * Math.sin(headingRadians) + dy * Math.cos(headingRadians);
    return {
      x: clamp(rotatedX, width * 0.08, width * 0.92),
      y: clamp(rotatedY, height * 0.12, height * 0.86),
    };
  }, [
    canvasSize.height,
    canvasSize.width,
    mapHeading,
    visibleRegion.latitude,
    visibleRegion.latitudeDelta,
    visibleRegion.longitude,
    visibleRegion.longitudeDelta,
  ]);

  const routeCandidates = useMemo(() => {
    if (target) {
      const beforeTarget = candidates.filter((candidate) => candidate.id !== target.id).slice(0, 5);
      return beforeTarget.length ? [...beforeTarget, target] : [target, target];
    }
    return candidates.slice(0, 6);
  }, [candidates, target]);
  const routePoints = (routeCandidates.length ? routeCandidates : [{ latitude: mapCenter.latitude, longitude: mapCenter.longitude }]).map((candidate) =>
    toPoint(candidate.latitude, candidate.longitude));
  const safeRoutePoints = routePoints.length > 1 ? routePoints : [routePoints[0], routePoints[0]];
  const inputRange = safeRoutePoints.map((_, index) => index / (safeRoutePoints.length - 1));
  const pinX = progress.interpolate({
    inputRange,
    outputRange: safeRoutePoints.map((point) => point.x - 21),
  });
  const pinY = progress.interpolate({
    inputRange,
    outputRange: safeRoutePoints.map((point) => point.y - 21),
  });
  const bounceY = bounce.interpolate({ inputRange: [0, 0.45, 1], outputRange: [0, -18, 0] });
  const activePinScale = genrePulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.42] });
  const activePinOpacity = genrePulse.interpolate({ inputRange: [0, 0.65, 1], outputRange: [0.34, 0.2, 0.02] });
  const genrePulseScale = genrePulse.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1.28] });
  const genrePulseOpacity = genrePulse.interpolate({ inputRange: [0, 0.55, 1], outputRange: [0.18, 0.38, 0] });
  const genreBadgeLift = genrePulse.interpolate({ inputRange: [0, 1], outputRange: [0, -5] });
  const statusLabel = status === 'searching'
    ? '候補を取得中'
    : status === 'spinning'
      ? '候補を巡回中'
      : status === 'result'
        ? '一店決定'
        : candidates.length
          ? `${candidates.length}件の候補`
          : '候補待ち';
  const canRenderNativeMap = MapModule && Platform.OS !== 'web';
  const MapView = MapModule?.default;
  const Marker = MapModule?.Marker;
  const rendersNativeMap = Boolean(canRenderNativeMap && MapView && Marker);

  return (
    <View
      style={styles.rouletteMapCanvas}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        if (width > 0 && height > 0) {
          setCanvasSize({ width, height });
        }
      }}
    >
      {rendersNativeMap && MapView && Marker ? (
        <MapView
          ref={rouletteMapRef}
          provider={MapModule?.PROVIDER_GOOGLE}
          style={styles.mapRouletteNativeMap}
          region={visibleRegion}
          onRegionChangeComplete={handleMapRegionChangeComplete}
          scrollEnabled
          zoomEnabled
          pitchEnabled={false}
          rotateEnabled
          toolbarEnabled={false}
          showsCompass
          showsMyLocationButton={false}
          showsUserLocation={useNativeUserLocationMarker}
          userLocationPriority="high"
          userLocationUpdateInterval={1000}
          loadingEnabled
        >
          {!useNativeUserLocationMarker && (
            <Marker coordinate={{ latitude: mapCenter.latitude, longitude: mapCenter.longitude }} anchor={{ x: 0.5, y: 1 }}>
              <View style={styles.mapRouletteOriginMarker}>
                <Ionicons name="location" size={36} color="#e3322b" />
                <View style={styles.mapRouletteOriginMarkerDot} />
              </View>
            </Marker>
          )}
          {displayCandidates.map((candidate) => {
            const isActiveCandidate = activeCandidateId === candidate.id;
            const isSelectedCandidate = status === 'result' && target?.id === candidate.id;
            return (
              <Marker key={candidate.id} coordinate={{ latitude: candidate.latitude, longitude: candidate.longitude }} anchor={genreFocused ? { x: 0.5, y: 1 } : { x: 0.5, y: 0.5 }}>
                {genreFocused ? (
                  <View
                    style={[
                      styles.mapRouletteCandidatePinMarker,
                      isActiveCandidate && styles.mapRouletteCandidatePinMarkerActive,
                      isSelectedCandidate && styles.mapRouletteCandidatePinMarkerSelected,
                    ]}
                  >
                    {isActiveCandidate && (
                      <Animated.View
                        style={[
                          styles.mapRouletteCandidatePinHalo,
                          {
                            opacity: activePinOpacity,
                            transform: [{ scale: activePinScale }],
                          },
                        ]}
                      />
                    )}
                    <Ionicons
                      name="location-sharp"
                      size={isSelectedCandidate ? 34 : isActiveCandidate ? 32 : 28}
                      color={isSelectedCandidate ? '#11100e' : '#e3322b'}
                    />
                    <View style={[styles.mapRouletteCandidatePinCore, isSelectedCandidate && styles.mapRouletteCandidatePinCoreSelected]} />
                  </View>
                ) : (
                  <View
                    style={[
                      styles.mapRouletteCandidateMarker,
                      isSelectedCandidate && styles.mapRouletteCandidateMarkerSelected,
                    ]}
                  />
                )}
              </Marker>
            );
          })}
        </MapView>
      ) : (
        <View style={styles.mapRouletteFallback}>
          <View style={[styles.rouletteMapCanvasPark, styles.rouletteMapCanvasParkOne]} />
          <View style={[styles.rouletteMapCanvasPark, styles.rouletteMapCanvasParkTwo]} />
          <Text style={[styles.mapRouletteCompassLabel, styles.mapRouletteCompassNorth]}>N</Text>
          <Text style={[styles.mapRouletteCompassLabel, styles.mapRouletteCompassEast]}>E</Text>
          <Text style={[styles.mapRouletteCompassLabel, styles.mapRouletteCompassSouth]}>S</Text>
          <Text style={[styles.mapRouletteCompassLabel, styles.mapRouletteCompassWest]}>W</Text>
          <View style={[styles.rouletteMapCanvasRoad, styles.rouletteMapCanvasRoadOne]} />
          <View style={[styles.rouletteMapCanvasRoad, styles.rouletteMapCanvasRoadTwo]} />
          <View style={[styles.rouletteMapCanvasRoad, styles.rouletteMapCanvasRoadThree]} />
          <Text style={styles.mapRouletteFallbackLabel} numberOfLines={1}>{fallbackLabel}</Text>
        </View>
      )}
      <View pointerEvents="none" style={styles.mapRouletteOverlay}>
        {showGenreEffect && (
          <>
            <Animated.View
              style={[
                styles.mapRouletteGenrePulse,
                {
                  opacity: genrePulseOpacity,
                  transform: [{ scale: genrePulseScale }],
                },
              ]}
            />
            <Animated.View
              style={[
                styles.mapRouletteGenreBadge,
                { transform: [{ translateY: genreBadgeLift }] },
              ]}
            >
              <Ionicons name="radio-outline" size={14} color="#ffffff" />
              <Text style={styles.mapRouletteGenreBadgeText} numberOfLines={1}>
                {genreLabel} SCAN
              </Text>
            </Animated.View>
          </>
        )}
        {!rendersNativeMap && (
          <View style={[styles.mapRouletteOriginDot, { left: toPoint(mapCenter.latitude, mapCenter.longitude).x - 12, top: toPoint(mapCenter.latitude, mapCenter.longitude).y - 30 }]}>
            <Ionicons name="location" size={30} color="#e3322b" />
          </View>
        )}
        {!rendersNativeMap && displayCandidates.map((candidate, index) => {
          const point = toPoint(candidate.latitude, candidate.longitude);
          const isActiveCandidate = activeCandidateId === candidate.id;
          const isSelectedCandidate = status === 'result' && target?.id === candidate.id;
          return (
            <View
              key={`${candidate.id}-overlay`}
              style={[
                genreFocused ? styles.mapRouletteCandidatePinDot : styles.mapRouletteCandidateDot,
                { left: point.x - (genreFocused ? 10 : 6), top: point.y - (genreFocused ? 23 : 6) },
                isActiveCandidate && styles.mapRouletteCandidatePinDotActive,
                isSelectedCandidate && styles.mapRouletteCandidatePinDotSelected,
              ]}
            >
              {genreFocused ? (
                <>
                  {isActiveCandidate && (
                    <Animated.View
                      style={[
                        styles.mapRouletteCandidatePinDotHalo,
                        {
                          opacity: activePinOpacity,
                          transform: [{ scale: activePinScale }],
                        },
                      ]}
                    />
                  )}
                  <Ionicons name="location-sharp" size={isSelectedCandidate ? 30 : isActiveCandidate ? 28 : 26} color={isSelectedCandidate ? '#11100e' : '#e3322b'} />
                  <Text style={styles.mapRouletteCandidatePinText}>{index + 1}</Text>
                </>
              ) : (
                index < 9 && <Text style={styles.mapRouletteCandidateDotText}>{index + 1}</Text>
              )}
            </View>
          );
        })}
        {!rendersNativeMap && (status === 'spinning' || status === 'result') && (
          <Animated.View
            style={[
              styles.mapRouletteSelectionMarker,
              {
                transform: [
                  { translateX: pinX },
                  { translateY: pinY },
                  { translateY: bounceY },
                ],
              },
            ]}
          >
            <View style={styles.mapRouletteSelectionPulse} />
            <View style={styles.mapRouletteSelectionCore}>
              <Ionicons name="restaurant" size={16} color="#ffffff" />
            </View>
          </Animated.View>
        )}
      </View>
      <View style={styles.rouletteMapLoadingPill}>
        {loading ? <ActivityIndicator size="small" color={ORANGE} /> : <Ionicons name="map-outline" size={18} color={ORANGE} />}
        <Text style={styles.rouletteMapLoadingText}>{statusLabel}</Text>
      </View>
    </View>
  );
}

function SaveTab({
  savedRestaurants,
  albumPhotos,
  history,
  drawHistories,
  uiText,
  savedDetail,
  savedDetailLoadingId,
  savedDetailError,
  historyDetailLoadingId,
  historyDetailError,
  userLocation,
  isRegisteredUser,
  isPro,
  onSavedPress,
  onHistoryPress,
  onSavedMapPress,
  onAttachPhoto,
  onUploadAlbumPhoto,
  onCaptureAlbumPhoto,
  onRequireRegistration,
}: {
  savedRestaurants: SavedRestaurant[];
  albumPhotos: AlbumPhotoEntry[];
  history: Restaurant[];
  drawHistories: DrawHistoryEntry[];
  uiText: Record<string, string>;
  savedDetail: { favorite: SavedRestaurant; restaurant: Restaurant } | null;
  savedDetailLoadingId: string | null;
  savedDetailError: string | null;
  historyDetailLoadingId: string | null;
  historyDetailError: string | null;
  userLocation: UserLocation | null;
  isRegisteredUser: boolean;
  isPro: boolean;
  onSavedPress: (favorite: SavedRestaurant) => void;
  onHistoryPress: (entry: DrawHistoryEntry) => void;
  onSavedMapPress: (restaurant: Restaurant) => void;
  onAttachPhoto: (favoriteId: string) => void;
  onUploadAlbumPhoto: () => void;
  onCaptureAlbumPhoto: () => void;
  onRequireRegistration: () => void;
}) {
  const [previewPhoto, setPreviewPhoto] = useState<AlbumPhotoPreview | null>(null);
  const [selectedAlbumMonth, setSelectedAlbumMonth] = useState('all');
  const [activeAlbumView, setActiveAlbumView] = useState<AlbumViewKey>('photos');
  const [slideshowIndex, setSlideshowIndex] = useState(0);
  const [slideshowPlaying, setSlideshowPlaying] = useState(false);
  const albumHistory = useMemo(
    () => {
      const hydratedHistory = drawHistories
        .map((entry) => entry.restaurant)
        .filter((restaurant): restaurant is Restaurant => Boolean(restaurant));
      return hydratedHistory.length ? hydratedHistory : history;
    },
    [drawHistories, history],
  );
  const showHotPepperCredit =
    albumHistory.some((restaurant) => restaurant.externalProvider === 'HOTPEPPER') ||
    savedRestaurants.some((favorite) => favorite.provider === 'HOTPEPPER' || favorite.snapshot?.externalProvider === 'HOTPEPPER');
  const savedPhotoEntries = useMemo(
    () => savedRestaurants.filter((favorite) => Boolean(favorite.photoUri)),
    [savedRestaurants],
  );
  const rawDiaryItems = useMemo<AlbumDiaryItem[]>(() => {
    const capturedPhotos: AlbumDiaryItem[] = albumPhotos.map((photo) => ({
      id: photo.id,
      photoUri: photo.photoUri,
      createdAt: photo.createdAt,
      title: photo.title,
      subtitle: photo.subtitle,
      source: 'album',
    }));
    const savedPhotos: AlbumDiaryItem[] = savedPhotoEntries.map((favorite) => {
      const snapshot = favorite.snapshot ?? null;
      return {
        id: `saved-photo-${favorite.id}`,
        photoUri: favorite.photoUri ?? '',
        createdAt: favorite.photoTakenAt ?? favorite.createdAt,
        title: snapshot?.name ?? 'お気に入りのお店',
        subtitle: favorite.savedGenre ?? snapshot?.genre ?? 'ジャンルおまかせ',
        source: 'saved',
        onRetake: () => onAttachPhoto(favorite.id),
        onOpenSaved: () => onSavedPress(favorite),
      };
    });
    return [...capturedPhotos, ...savedPhotos].sort((a, b) => {
      const aTime = new Date(a.createdAt).getTime();
      const bTime = new Date(b.createdAt).getTime();
      return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
    });
  }, [albumPhotos, onAttachPhoto, onSavedPress, savedPhotoEntries]);
  const diaryItems = useMemo(
    () => rawDiaryItems.filter((item) => isPro || isInFreeAlbumWindow(item.createdAt)),
    [isPro, rawDiaryItems],
  );
  const hiddenByPlanCount = rawDiaryItems.length - diaryItems.length;
  const monthKeys = useMemo(
    () => Array.from(new Set(diaryItems.map((item) => getAlbumMonthKey(item.createdAt)))).filter((key) => key !== 'unknown'),
    [diaryItems],
  );
  const visibleMonthKeys = selectedAlbumMonth === 'all'
    ? monthKeys
    : monthKeys.filter((key) => key === selectedAlbumMonth);
  const diaryCount = diaryItems.length;
  const demoSlideshowItems = useMemo(() => createDemoAlbumSlideItems(), []);
  const showingDemoSlides = diaryItems.length === 0;
  const slideshowBaseItems = showingDemoSlides ? demoSlideshowItems : diaryItems;
  const slideshowItems = useMemo(
    () => selectedAlbumMonth === 'all' || showingDemoSlides
      ? slideshowBaseItems
      : slideshowBaseItems.filter((item) => getAlbumMonthKey(item.createdAt) === selectedAlbumMonth),
    [selectedAlbumMonth, showingDemoSlides, slideshowBaseItems],
  );
  const slideshowDisplayIndex = slideshowItems.length ? Math.min(slideshowIndex, slideshowItems.length - 1) : 0;
  const slideshowItem = slideshowItems.length
    ? slideshowItems[slideshowDisplayIndex]
    : null;
  const slideshowMonthLabel = selectedAlbumMonth === 'all' || showingDemoSlides
    ? formatAlbumMonthLabel(getAlbumMonthKey(slideshowItems[0]?.createdAt ?? new Date().toISOString()))
    : formatAlbumMonthLabel(selectedAlbumMonth);
  const slideshowGenreCount = useMemo(
    () => new Set(slideshowItems.map((item) => getAlbumDiaryGenreLabel(item))).size,
    [slideshowItems],
  );
  const slideshowProgress = slideshowItems.length
    ? Math.round(((slideshowDisplayIndex + 1) / slideshowItems.length) * 100)
    : 0;
  const slideshowHeroGenre = getAlbumDiaryGenreLabel(slideshowItem);
  const slideshowHeroVisual = getGenreVisual(slideshowHeroGenre);
  const slideshowMoodLine = slideshowItem
    ? getAlbumSlideshowMoodLine(slideshowItem, slideshowDisplayIndex, slideshowItems.length)
    : '';
  const albumViews = [
    { key: 'photos', label: '写真', count: `${diaryCount}枚`, icon: 'images-outline' },
    { key: 'slideshow', label: 'スライド', count: `${slideshowBaseItems.length}枚`, icon: 'play-circle-outline' },
    { key: 'favorites', label: 'お気に入り', count: `${savedRestaurants.length}件`, icon: 'heart-outline' },
    { key: 'history', label: '履歴', count: `${drawHistories.length || history.length}件`, icon: 'time-outline' },
  ] as const;

  useEffect(() => {
    if (selectedAlbumMonth !== 'all' && !monthKeys.includes(selectedAlbumMonth)) {
      setSelectedAlbumMonth('all');
    }
  }, [monthKeys, selectedAlbumMonth]);

  useEffect(() => {
    if (slideshowIndex >= slideshowItems.length) {
      setSlideshowIndex(0);
    }
  }, [slideshowIndex, slideshowItems.length]);

  useEffect(() => {
    if (!slideshowPlaying || slideshowItems.length <= 1) {
      return undefined;
    }
    const timer = setInterval(() => {
      setSlideshowIndex((current) => (current + 1) % slideshowItems.length);
    }, 2600);
    return () => clearInterval(timer);
  }, [slideshowItems.length, slideshowPlaying]);

  if (!isRegisteredUser) {
    return (
      <View>
        <PageIntro title={uiText.savedTitle} lead={uiText.savedLead} />
        <View style={styles.albumLockedCard}>
          <View style={styles.albumLockedIcon}>
            <Image source={ALBUM_FOOTER_ICON} style={styles.albumLockedImage} resizeMode="contain" />
          </View>
          <View style={styles.albumLockedBody}>
            <Text style={styles.albumLockedKicker}>FOOD LOG</Text>
            <Text style={styles.albumLockedTitle}>アルバムは会員限定です</Text>
            <Text style={styles.albumLockedText}>
              写真を残す機能はアカウントに紐づけて保存します。登録するとフードログを使えます。
            </Text>
          </View>
          <Pressable style={styles.albumLockedButton} onPress={onRequireRegistration}>
            <Text style={styles.albumLockedButtonText}>会員登録へ</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View>
      <PageIntro title={uiText.savedTitle} lead={uiText.savedLead} />
      <View style={styles.albumCameraCard}>
        <View style={styles.albumCameraIconFrame}>
          <Image source={ALBUM_FOOTER_ICON} style={styles.albumCameraIcon} resizeMode="contain" />
        </View>
        <View style={styles.albumCameraBody}>
          <Text style={styles.albumCameraKicker}>PHOTO</Text>
          <Text style={styles.albumCameraTitle}>写真を撮って残す</Text>
          <Text style={styles.albumCameraText} numberOfLines={2}>
            食べたものやお店の雰囲気を一枚で残せます。
          </Text>
          <View style={styles.albumCameraStatsRow}>
            <View style={styles.albumCameraStatChip}>
              <Ionicons name="images-outline" size={14} color={ORANGE} />
              <Text style={styles.albumCameraStatText}>{diaryCount}枚</Text>
            </View>
            <View style={styles.albumCameraStatChip}>
              <Ionicons name="heart-outline" size={14} color="#81776b" />
              <Text style={styles.albumCameraStatText}>{savedRestaurants.length}件</Text>
            </View>
            <View style={styles.albumCameraStatChip}>
              <Ionicons name="time-outline" size={14} color="#81776b" />
              <Text style={styles.albumCameraStatText}>{albumHistory.length}件</Text>
            </View>
          </View>
        </View>
        <View style={styles.albumCameraActions}>
          <Pressable
            style={styles.albumCameraUploadButton}
            onPress={onUploadAlbumPhoto}
          >
            <Ionicons name="image-outline" size={20} color={ORANGE} />
            <Text style={styles.albumCameraUploadText}>追加</Text>
          </Pressable>
          <Pressable
            style={styles.albumCameraButton}
            onPress={onCaptureAlbumPhoto}
          >
            <Ionicons name="camera" size={25} color="#ffffff" />
            <Text style={styles.albumCameraButtonText}>撮影</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.albumViewTabs}>
        {albumViews.map((item) => {
          const active = activeAlbumView === item.key;
          return (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              style={[styles.albumViewTab, active && styles.albumViewTabActive]}
              onPress={() => setActiveAlbumView(item.key)}
            >
              <Ionicons name={item.icon} size={18} color={active ? '#ffffff' : ORANGE} />
              <Text style={[styles.albumViewTabLabel, active && styles.albumViewTabLabelActive]} numberOfLines={1}>
                {item.label}
              </Text>
              <Text style={[styles.albumViewTabCount, active && styles.albumViewTabCountActive]} numberOfLines={1}>
                {item.count}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {activeAlbumView === 'photos' && (
        <View style={styles.albumViewPanel}>
          {hiddenByPlanCount > 0 && (
            <View style={styles.albumRetentionNote}>
              <Ionicons name="time-outline" size={16} color={ORANGE} />
              <Text style={styles.albumRetentionText}>
                Freeプランでは直近3か月分を表示します。古い写真 {hiddenByPlanCount} 枚はProで見返せます。
              </Text>
            </View>
          )}
          {diaryCount === 0 ? (
            <View style={styles.emptyPanel}>
              <Text style={styles.emptyTitle}>写真はまだありません</Text>
              <Text style={styles.emptyText}>上の撮影ボタンから、食べたものをアルバムに残せます。</Text>
            </View>
          ) : (
            <View style={styles.albumDiarySection}>
              <SectionHeader title="写真アルバム" action={`${diaryCount}枚`} />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.albumMonthChipRow}
              >
                <Pressable
                  style={[styles.albumMonthChip, selectedAlbumMonth === 'all' && styles.albumMonthChipActive]}
                  onPress={() => setSelectedAlbumMonth('all')}
                >
                  <Text style={[styles.albumMonthChipTitle, selectedAlbumMonth === 'all' && styles.albumMonthChipTitleActive]}>
                    すべて表示
                  </Text>
                  <Text style={[styles.albumMonthChipCount, selectedAlbumMonth === 'all' && styles.albumMonthChipCountActive]}>
                    {diaryCount}枚
                  </Text>
                </Pressable>
                {monthKeys.map((monthKey) => {
                  const monthCount = diaryItems.filter((item) => getAlbumMonthKey(item.createdAt) === monthKey).length;
                  const active = selectedAlbumMonth === monthKey;
                  return (
                    <Pressable
                      key={monthKey}
                      style={[styles.albumMonthChip, active && styles.albumMonthChipActive]}
                      onPress={() => setSelectedAlbumMonth(monthKey)}
                    >
                      <Text style={[styles.albumMonthChipTitle, active && styles.albumMonthChipTitleActive]}>
                        {formatAlbumMonthLabel(monthKey)}
                      </Text>
                      <Text style={[styles.albumMonthChipCount, active && styles.albumMonthChipCountActive]}>
                        {monthCount}枚
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              {visibleMonthKeys.map((monthKey) => {
                const monthItems = diaryItems.filter((item) => getAlbumMonthKey(item.createdAt) === monthKey);
                return (
                  <View key={monthKey} style={styles.albumMonthSection}>
                    <View style={styles.albumMonthHeader}>
                      <Text style={styles.albumMonthTitle}>{formatAlbumMonthLabel(monthKey)}</Text>
                      <Text style={styles.albumMonthCount}>{monthItems.length}枚</Text>
                    </View>
                    <View style={styles.albumDiaryGrid}>
                      {monthItems.map((item) => (
                        <AlbumMemoryCard
                          key={item.id}
                          item={item}
                          onPress={() => setPreviewPhoto({
                            photoUri: item.photoUri,
                            imageSource: getAlbumDiaryImageSource(item),
                            title: item.title,
                            subtitle: item.subtitle,
                            dateLabel: formatShortDateTime(item.createdAt) || '今日',
                          })}
                        />
                      ))}
                    </View>
                  </View>
                );
              })}
              {visibleMonthKeys.length === 0 && (
                <View style={styles.albumEmptyMonthCard}>
                  <Text style={styles.albumEmptyMonthTitle}>この月の写真はまだありません</Text>
                  <Text style={styles.albumEmptyMonthText}>撮った写真はここに4列のアルバムで並びます。</Text>
                </View>
              )}
            </View>
          )}
        </View>
      )}

      {activeAlbumView === 'slideshow' && (
        <View style={styles.albumViewPanel}>
          {slideshowItems.length === 0 ? (
            <View style={styles.emptyPanel}>
              <Text style={styles.emptyTitle}>スライドはまだありません</Text>
              <Text style={styles.emptyText}>写真を追加すると、ごはんの思い出をスライドで見返せます。</Text>
            </View>
          ) : (
            <View style={styles.albumSlideshowCard}>
              <View style={styles.albumSlideshowHeader}>
                <View style={styles.albumSlideshowHeaderText}>
                  <Text style={styles.albumSlideshowKicker}>{showingDemoSlides ? 'DEMO FOOD MOVIE' : 'MONTHLY FOOD MOVIE'}</Text>
                  <Text style={styles.albumSlideshowHeading} numberOfLines={1}>{slideshowMonthLabel}のごはん記録</Text>
                </View>
                <Text style={styles.albumSlideshowCounter} numberOfLines={1}>
                  {slideshowItems.length ? slideshowDisplayIndex + 1 : 0}/{slideshowItems.length}
                </Text>
              </View>
              <View style={styles.albumSlideshowDigest}>
                <View style={styles.albumSlideshowDigestMain}>
                  <Text style={styles.albumSlideshowDigestKicker}>DIGEST</Text>
                  <Text style={styles.albumSlideshowDigestTitle} numberOfLines={1}>
                    {showingDemoSlides ? '展示用プレビュー' : '今月の食べた記録'}
                  </Text>
                </View>
                <View style={styles.albumSlideshowDigestStats}>
                  <View style={styles.albumSlideshowStatPill}>
                    <Ionicons name="images-outline" size={13} color={ORANGE} />
                    <Text style={styles.albumSlideshowStatText}>{slideshowItems.length}枚</Text>
                  </View>
                  <View style={styles.albumSlideshowStatPill}>
                    <Ionicons name="restaurant-outline" size={13} color="#4f7f58" />
                    <Text style={styles.albumSlideshowStatText}>{slideshowGenreCount}ジャンル</Text>
                  </View>
                </View>
              </View>
              <View style={styles.albumSlideshowProgressTrack}>
                <View style={[styles.albumSlideshowProgressFill, { width: `${slideshowProgress}%` }]} />
              </View>
              {slideshowItem ? (
                <>
                  <Pressable
                    style={[
                      styles.albumSlideshowHero,
                      showingDemoSlides && { backgroundColor: hexToRgba(slideshowHeroVisual.color, 0.13) },
                    ]}
                    onPress={() => setPreviewPhoto({
                      photoUri: slideshowItem.photoUri,
                      imageSource: getAlbumDiaryImageSource(slideshowItem),
                      title: slideshowItem.title,
                      subtitle: slideshowItem.subtitle,
                      dateLabel: formatShortDateTime(slideshowItem.createdAt) || '今日',
                    })}
                  >
                    {showingDemoSlides && (
                      <View
                        pointerEvents="none"
                        style={[
                          styles.albumSlideshowHeroGlow,
                          { backgroundColor: hexToRgba(slideshowHeroVisual.color, 0.18) },
                        ]}
                      />
                    )}
                    <Image
                      source={getAlbumDiaryImageSource(slideshowItem)}
                      style={[styles.albumSlideshowImage, showingDemoSlides && styles.albumSlideshowImageDemo]}
                      resizeMode={showingDemoSlides ? 'contain' : 'cover'}
                    />
                    <View style={styles.albumSlideshowScrim} />
                    <View style={styles.albumSlideshowPosterBadge}>
                      <Ionicons name="sparkles-outline" size={13} color="#ffffff" />
                      <Text style={styles.albumSlideshowPosterBadgeText} numberOfLines={1}>
                        {showingDemoSlides ? 'DEMO PREVIEW' : 'SAVED MEMORY'}
                      </Text>
                    </View>
                    <View style={styles.albumSlideshowGenrePill}>
                      <Text style={styles.albumSlideshowGenrePillText} numberOfLines={1}>{slideshowHeroGenre}</Text>
                    </View>
                    <View style={styles.albumSlideshowOverlay}>
                      <Text style={styles.albumSlideshowDate} numberOfLines={1}>
                        {formatShortDateTime(slideshowItem.createdAt) || '今日'}
                      </Text>
                      <Text style={styles.albumSlideshowTitle} numberOfLines={2}>{slideshowItem.title}</Text>
                      <Text style={styles.albumSlideshowMood} numberOfLines={2}>{slideshowMoodLine}</Text>
                      <Text style={styles.albumSlideshowSubtitle} numberOfLines={1}>{slideshowItem.subtitle}</Text>
                    </View>
                  </Pressable>
                  <View style={styles.albumSlideshowStoryCard}>
                    <View style={styles.albumSlideshowStoryIcon}>
                      <Ionicons name="film-outline" size={18} color={ORANGE} />
                    </View>
                    <View style={styles.albumSlideshowStoryBody}>
                      <Text style={styles.albumSlideshowStoryKicker}>FOOD MEMORY</Text>
                      <Text style={styles.albumSlideshowStoryText}>{slideshowMoodLine}</Text>
                    </View>
                  </View>
                  <View style={styles.albumSlideshowControls}>
                    <Pressable
                      style={[styles.albumSlideshowButton, slideshowItems.length <= 1 && styles.albumSlideshowButtonDisabled]}
                      disabled={slideshowItems.length <= 1}
                      onPress={() => setSlideshowIndex((current) => (current - 1 + slideshowItems.length) % slideshowItems.length)}
                    >
                      <Ionicons name="chevron-back" size={20} color={INK} />
                    </Pressable>
                    <Pressable
                      style={styles.albumSlideshowPrimaryButton}
                      onPress={() => setSlideshowPlaying((current) => !current)}
                    >
                      <Ionicons name={slideshowPlaying ? 'pause' : 'play'} size={18} color="#ffffff" />
                      <Text style={styles.albumSlideshowButtonText} numberOfLines={1}>
                        {slideshowPlaying ? '再生中' : 'ムービー再生'}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.albumSlideshowButton, slideshowItems.length <= 1 && styles.albumSlideshowButtonDisabled]}
                      disabled={slideshowItems.length <= 1}
                      onPress={() => setSlideshowIndex((current) => (current + 1) % slideshowItems.length)}
                    >
                      <Ionicons name="chevron-forward" size={20} color={INK} />
                    </Pressable>
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.albumSlideshowFilmstrip}
                  >
                    {slideshowItems.map((item, index) => {
                      const active = index === slideshowDisplayIndex;
                      return (
                        <Pressable
                          key={`${item.id}-slide-thumb`}
                          style={[styles.albumSlideshowThumb, active && styles.albumSlideshowThumbActive]}
                          onPress={() => setSlideshowIndex(index)}
                        >
                          <Image source={getAlbumDiaryImageSource(item)} style={styles.albumSlideshowThumbImage} resizeMode="cover" />
                          <View style={styles.albumSlideshowThumbShade} />
                          <Text style={styles.albumSlideshowThumbNumber}>{index + 1}</Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </>
              ) : (
                <View style={styles.albumSlideshowEmpty}>
                  <Text style={styles.albumEmptyMonthTitle}>この月の写真はまだありません</Text>
                  <Text style={styles.albumEmptyMonthText}>別の月か、すべて表示を選ぶとスライドを確認できます。</Text>
                </View>
              )}
            </View>
          )}
        </View>
      )}

      {activeAlbumView === 'favorites' && (
        <View style={styles.albumViewPanel}>
          {savedRestaurants.length === 0 ? (
            <View style={styles.emptyPanel}>
              <Text style={styles.emptyTitle}>{uiText.savedEmptyTitle}</Text>
              <Text style={styles.emptyText}>{uiText.savedEmptyText}</Text>
            </View>
          ) : (
            <View style={styles.savedListBlock}>
              <SectionHeader title={uiText.favoriteListTitle} action={`${savedRestaurants.length}件`} />
              <View style={styles.savedList}>
                {savedRestaurants.map((favorite) => (
                  <SavedPlaceCard
                    key={`${favorite.id}-saved`}
                    favorite={favorite}
                    loading={savedDetailLoadingId === favorite.id}
                    selected={savedDetail?.favorite.id === favorite.id}
                    onPress={() => onSavedPress(favorite)}
                    onPhotoPress={() => onAttachPhoto(favorite.id)}
                  />
                ))}
              </View>
            </View>
          )}
          {savedDetailError && (
            <View style={styles.savedErrorNotice}>
              <Ionicons name="alert-circle-outline" size={18} color={ORANGE} />
              <Text style={styles.savedErrorText}>{savedDetailError}</Text>
            </View>
          )}
          {savedDetail && (
            <View style={styles.savedDetailBlock}>
              <SectionHeader title="お気に入り詳細" action={savedDetail.favorite.photoUri ? '写真あり' : '写真なし'} />
              {savedDetail.favorite.photoUri ? (
                <View style={styles.savedPhotoHero}>
                  <Image source={{ uri: savedDetail.favorite.photoUri }} style={styles.savedPhotoHeroImage} />
                  <View style={styles.savedPhotoHeroBadge}>
                    <Ionicons name="camera" size={14} color="#ffffff" />
                    <Text style={styles.savedPhotoHeroBadgeText}>ごはん写真</Text>
                  </View>
                </View>
              ) : (
                <View style={styles.savedPhotoEmpty}>
                  <Image source={ALBUM_FOOD_ICON} style={styles.savedPhotoEmptyIcon} />
                  <Text style={styles.savedPhotoEmptyTitle}>この店の一枚を残せます</Text>
                  <Text style={styles.savedPhotoEmptyText}>行ったときのごはん写真を撮ると、アルバムらしく見返せます。</Text>
                </View>
              )}
              <Pressable style={styles.savedPhotoButton} onPress={() => onAttachPhoto(savedDetail.favorite.id)}>
                <Ionicons name="camera-outline" size={19} color={ORANGE} />
                <Text style={styles.savedPhotoButtonText}>{savedDetail.favorite.photoUri ? '写真を撮り直す' : 'ごはん写真を撮る'}</Text>
              </Pressable>
              <SectionHeader title="店舗情報" action="APIから取得" />
              <ResultCard
                restaurant={savedDetail.restaurant}
                userLocation={userLocation}
                preferredArea={savedDetail.favorite.savedArea}
                uiText={uiText}
                onMapPress={() => onSavedMapPress(savedDetail.restaurant)}
              />
            </View>
          )}
        </View>
      )}

      {activeAlbumView === 'history' && (
        <View style={styles.albumViewPanel}>
          <HistoryEntrySection
            entries={drawHistories}
            fallbackHistory={history}
            uiText={uiText}
            loadingId={historyDetailLoadingId}
            error={historyDetailError}
            onEntryPress={onHistoryPress}
          />
        </View>
      )}
      {showHotPepperCredit && <HotPepperCredit />}
      <Modal
        visible={Boolean(previewPhoto)}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewPhoto(null)}
      >
        <View style={styles.albumPreviewBackdrop}>
          <Pressable style={styles.albumPreviewDismissLayer} onPress={() => setPreviewPhoto(null)} />
          {previewPhoto && (
            <View style={styles.albumPreviewSheet}>
              <View style={styles.albumPreviewTopRow}>
                <View>
                  <Text style={styles.albumPreviewKicker}>{previewPhoto.dateLabel}</Text>
                  <Text style={styles.albumPreviewTitle} numberOfLines={1}>{previewPhoto.title}</Text>
                </View>
                <Pressable style={styles.albumPreviewCloseButton} onPress={() => setPreviewPhoto(null)}>
                  <Ionicons name="close" size={20} color={INK} />
                </Pressable>
              </View>
              <Image source={previewPhoto.imageSource ?? { uri: previewPhoto.photoUri }} style={styles.albumPreviewImage} resizeMode="cover" />
              <Text style={styles.albumPreviewSubtitle} numberOfLines={2}>{previewPhoto.subtitle}</Text>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

function AlbumMemoryCard({ item, onPress }: { item: AlbumDiaryItem; onPress: () => void }) {
  const savedDate = formatShortDateTime(item.createdAt) || '今日';

  return (
    <Pressable style={styles.albumDiaryCard} onPress={onPress}>
      <Image source={getAlbumDiaryImageSource(item)} style={styles.albumDiaryImage} resizeMode="cover" />
      <View style={styles.albumDiaryScrim} />
      <View style={styles.albumDiaryDateBadge}>
        <Ionicons name="calendar-clear-outline" size={9} color="#ffffff" />
        <Text style={styles.albumDiaryDateText}>{savedDate}</Text>
      </View>
      {item.source === 'saved' && item.onRetake && (
        <Pressable
          style={styles.albumDiaryCameraButton}
          onPress={(event) => {
            event.stopPropagation();
            item.onRetake?.();
          }}
        >
          <Ionicons name="camera" size={12} color="#ffffff" />
        </Pressable>
      )}
      <View style={styles.albumDiaryBody}>
        <Text style={styles.albumDiaryTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.albumDiaryMeta} numberOfLines={1}>{item.subtitle}</Text>
      </View>
    </Pressable>
  );
}

function GenreIconVisual({ genre }: { genre?: string | null }) {
  const genreVisual = getGenreVisual(genre);
  return (
    <View
      style={[
        styles.restaurantVisual,
        styles.restaurantVisualFrame,
        { backgroundColor: hexToRgba(genreVisual.color, 0.09) },
      ]}
    >
      <View style={[styles.genreVisualGlow, { backgroundColor: hexToRgba(genreVisual.color, 0.12) }]} />
      <Image source={genreVisual.image} style={[styles.genreVisualImage, styles.genreVisualImageSmall]} resizeMode="contain" />
    </View>
  );
}

function SavedPlaceCard({
  favorite,
  loading,
  selected,
  onPress,
  onPhotoPress,
}: {
  favorite: SavedRestaurant;
  loading: boolean;
  selected: boolean;
  onPress: () => void;
  onPhotoPress: () => void;
}) {
  const savedDate = formatShortDate(favorite.createdAt);
  const providerLabel = getProviderLabel(favorite.provider);
  const snapshot = favorite.snapshot ?? null;
  const savedGenre = favorite.savedGenre ?? snapshot?.genre ?? null;
  return (
    <Pressable style={[styles.savedPlaceCard, selected && styles.savedPlaceCardActive]} onPress={onPress}>
      {favorite.photoUri ? (
        <View style={styles.savedPlaceThumb}>
          <Image source={{ uri: favorite.photoUri }} style={styles.savedPlacePhoto} />
        </View>
      ) : (
        <View style={styles.savedPlaceThumb}>
          <GenreIconVisual genre={savedGenre} />
        </View>
      )}
      <View style={styles.savedPlaceBody}>
        <View style={styles.savedPlaceTopRow}>
          <Text style={styles.savedPlaceKicker}>{favorite.photoUri ? 'ごはん写真あり' : 'お気に入り'}</Text>
          <Text style={styles.savedPlaceProvider}>{providerLabel}</Text>
        </View>
        <Text style={styles.savedPlaceTitle} numberOfLines={1}>{`${savedGenre ?? 'お店'}の候補`}</Text>
        <Text style={styles.savedPlaceMeta} numberOfLines={2}>{buildSavedMetaLine(favorite)}</Text>
        <Text style={styles.savedPlaceDate}>{savedDate ? `${savedDate}に追加` : 'お気に入り済み'}</Text>
      </View>
      <View style={styles.savedPlaceAction}>
        {loading ? (
          <ActivityIndicator size="small" color={ORANGE} />
        ) : (
          <Pressable
            style={styles.savedPlacePhotoButton}
            onPress={(event) => {
              event.stopPropagation();
              onPhotoPress();
            }}
          >
            <Ionicons name={favorite.photoUri ? 'camera' : 'camera-outline'} size={18} color={selected ? ORANGE : '#9b9185'} />
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

function ProBadge({ label = 'Pro', dark = false }: { label?: string; dark?: boolean }) {
  return (
    <View style={[styles.proBadge, dark && styles.proBadgeDark]}>
      <Text style={[styles.proBadgeText, dark && styles.proBadgeTextDark]}>{label}</Text>
    </View>
  );
}

function ProTeaserCard({ isPro, onPress }: { isPro: boolean; onPress: () => void }) {
  return (
    <View style={styles.proTeaserCard}>
      <View style={styles.proTeaserTopRow}>
        <View style={styles.proTeaserBrandRow}>
          <View style={styles.proTeaserLogoBadge}>
            <Image source={RANDISH_LOGO} style={styles.proTeaserLogo} resizeMode="contain" />
          </View>
          <Text style={styles.proTeaserLabel}>RANDISH PRO</Text>
        </View>
        <View style={styles.proTeaserChip}>
          <Ionicons name="receipt-outline" size={13} color={ORANGE} />
          <Text style={styles.proTeaserChipText}>あとから見返す</Text>
        </View>
      </View>
      <Text style={styles.proTeaserTitle}>{isPro ? '過去の傾向を、残して見る。' : '今月だけで終わらせない。'}</Text>
      <Text style={styles.proTeaserLead}>
        {isPro
          ? '過去の抽選・外食費・ジャンル傾向を保存して見返せます。'
          : 'Proなら、過去の抽選・外食費・ジャンル傾向を残して見返せます。'}
      </Text>
      <Pressable style={[styles.proTeaserButton, isPro && styles.proTeaserButtonActive]} onPress={onPress}>
        <Text style={[styles.proTeaserButtonText, isPro && styles.proTeaserButtonTextActive]}>
          {isPro ? 'Pro有効' : 'Pro機能をみる'}
        </Text>
        {!isPro && <Ionicons name="arrow-forward" size={15} color={ORANGE} />}
      </Pressable>
      <View pointerEvents="none" style={styles.proTeaserArt}>
        <View style={[styles.proTeaserRoad, styles.proTeaserRoadOne]} />
        <View style={[styles.proTeaserRoad, styles.proTeaserRoadTwo]} />
        <View style={styles.proTeaserPin}>
          <View style={styles.proTeaserPinCore} />
        </View>
        <View style={styles.proTeaserChart}>
          <View style={[styles.proTeaserChartBar, styles.proTeaserChartBarOne]} />
          <View style={[styles.proTeaserChartBar, styles.proTeaserChartBarTwo]} />
          <View style={[styles.proTeaserChartBar, styles.proTeaserChartBarThree]} />
        </View>
      </View>
    </View>
  );
}

function ProFeatureCard({
  icon,
  title,
  description,
  value,
  detailLines = [],
  isPro,
  onPress,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  value?: string;
  detailLines?: string[];
  isPro: boolean;
  onPress: () => void;
  children?: any;
}) {
  return (
    <Pressable style={[styles.proFeatureCard, isPro && styles.proFeatureCardUnlocked]} onPress={isPro ? undefined : onPress}>
      <View style={styles.proFeatureHeader}>
        <View style={styles.proFeatureIcon}>
          <Ionicons name={icon} size={21} color={isPro ? ORANGE : INK} />
        </View>
        {isPro ? <ProBadge /> : (
          <View style={styles.proFeatureLock}>
            <Ionicons name="lock-closed-outline" size={14} color={ORANGE} />
            <Text style={styles.proFeatureLockText}>Proで表示</Text>
          </View>
        )}
      </View>
      <Text style={styles.proFeatureTitle}>{title}</Text>
      <Text style={styles.proFeatureValue} numberOfLines={2}>{isPro ? (value ?? '分析中') : 'Proで表示'}</Text>
      <Text style={styles.proFeatureDescription}>{description}</Text>
      {isPro && detailLines.map((line, index) => (
        <Text key={`${line}-${index}`} style={styles.proFeatureDetail} numberOfLines={1}>{line}</Text>
      ))}
      {isPro && children}
    </Pressable>
  );
}

function ProMonthBars({ items }: { items: MonthlyAnalytics[] }) {
  const max = Math.max(...items.map((item) => item.estimatedSpend), 1);
  return (
    <View style={styles.proMonthBars}>
      {items.map((item) => {
        const percent = item.estimatedSpend > 0 ? Math.max(16, Math.round((item.estimatedSpend / max) * 100)) : 0;
        return (
          <View key={`${item.monthDate.getFullYear()}-${item.monthDate.getMonth()}`} style={styles.proMonthBarItem}>
            <View style={styles.proMonthBarTrack}>
              <View style={[styles.proMonthBarFill, { height: `${percent}%` }]} />
            </View>
            <Text style={styles.proMonthBarLabel}>{item.monthLabel}</Text>
          </View>
        );
      })}
    </View>
  );
}

function AiMonthlyReportEntryCard({
  analytics,
  status,
  hasReport,
  isPro,
  isSamplePreview,
  onOpen,
  onToggleSample,
}: {
  analytics: MonthlyAnalytics;
  status: AiReportStatus;
  hasReport: boolean;
  isPro: boolean;
  isSamplePreview: boolean;
  onOpen: () => void;
  onToggleSample: () => void;
}) {
  const isLoading = status === 'loading';
  const hasHistory = analytics.drawCount > 0;
  const estimatedSpendLabel = analytics.budgetSampleCount ? `約${formatYen(analytics.estimatedSpend)}` : '未計測';
  const actionLabel = isLoading ? '読み込み中' : !isPro ? 'Proで受け取る' : hasReport ? 'レポートを見る' : '届いたレポートを開く';
  const disabled = isLoading || !hasHistory;

  return (
    <View style={styles.aiReportBuilderCard}>
      <View style={styles.aiReportBuilderHeader}>
        <View style={styles.aiReportBuilderHeaderText}>
          <Text style={styles.aiReportBuilderKicker}>{isSamplePreview ? 'SAMPLE REPORT' : 'MONTHLY REPORT'}</Text>
          <Text style={styles.aiReportBuilderTitle}>{hasHistory ? 'レポートが届きました' : 'レポートは抽選後に届きます'}</Text>
        </View>
        <View style={styles.aiReportBuilderBadge}>
          <Ionicons name={hasHistory ? 'mail-unread-outline' : 'calendar-outline'} size={15} color={ORANGE} />
          <Text style={styles.aiReportBuilderBadgeText}>{analytics.monthLabel}</Text>
        </View>
      </View>
      <Text style={styles.aiReportBuilderLead}>
        ルーレットで出たお店のジャンル・予算・場所をもとに、1か月ごとの食傾向をまとめます。
      </Text>
      <View style={styles.aiReportBuilderNotice}>
        <Ionicons name="information-circle-outline" size={17} color={ORANGE} />
        <Text style={styles.aiReportBuilderNoticeText}>{AI_REPORT_MONTHLY_NOTICE}</Text>
      </View>

      <View style={styles.aiReportAutoStats}>
        <View style={styles.aiReportAutoStat}>
          <Text style={styles.aiReportAutoStatLabel}>今月のルーレット</Text>
          <Text style={styles.aiReportAutoStatValue}>{analytics.drawCount}回</Text>
        </View>
        <View style={styles.aiReportAutoStat}>
          <Text style={styles.aiReportAutoStatLabel}>推定外食費</Text>
          <Text style={styles.aiReportAutoStatValue}>{estimatedSpendLabel}</Text>
        </View>
        <View style={styles.aiReportAutoStat}>
          <Text style={styles.aiReportAutoStatLabel}>多いジャンル</Text>
          <Text style={styles.aiReportAutoStatValue}>{analytics.topGenre}</Text>
        </View>
        <View style={styles.aiReportAutoStat}>
          <Text style={styles.aiReportAutoStatLabel}>よく出た場所</Text>
          <Text style={styles.aiReportAutoStatValue} numberOfLines={1}>{analytics.topArea}</Text>
        </View>
      </View>

      <View style={styles.aiReportBuilderSummary}>
        <Text style={styles.aiReportBuilderSummaryText} numberOfLines={2}>
          {hasHistory
            ? isSamplePreview
              ? '10回分のサンプル外食履歴で、スマホ上の見え方を確認しています。'
              : '自分でジャンルや金額を選ばず、抽選結果をそのままレポートに反映します。'
            : 'ルーレット結果が入ると、月次AIレポートがここに届きます。'}
        </Text>
      </View>

      <Pressable style={styles.aiReportSampleButton} onPress={onToggleSample} disabled={isLoading}>
        <Ionicons name={isSamplePreview ? 'refresh-outline' : 'phone-portrait-outline'} size={16} color={ORANGE} />
        <Text style={styles.aiReportSampleButtonText}>
          {isSamplePreview ? '実データに戻す' : `${AI_REPORT_SAMPLE_MEAL_COUNT}回サンプルで確認`}
        </Text>
      </Pressable>

      <Pressable
        style={[styles.aiReportOpenButton, disabled && styles.aiReportOpenButtonDisabled]}
        onPress={onOpen}
        disabled={disabled}
      >
        {isLoading ? <ActivityIndicator size="small" color="#ffffff" /> : <Ionicons name="document-text-outline" size={18} color="#ffffff" />}
        <Text style={styles.aiReportOpenButtonText}>{actionLabel}</Text>
      </Pressable>
    </View>
  );
}

function AiMonthlyReportCard({
  report,
  analytics,
  status,
  onRefresh,
  canRefresh = true,
  limitNotice,
}: {
  report: AiMonthlyReport;
  analytics?: MonthlyAnalytics;
  status: AiReportStatus;
  onRefresh: () => void;
  canRefresh?: boolean;
  limitNotice?: string;
}) {
  const sourceLabel = report.source === 'gemini'
    ? 'AI生成'
    : report.source === 'fallback'
      ? 'ローカル生成'
      : '端末生成';
  const generatedDate = formatShortDateTime(report.generatedAt);
  const isLoading = status === 'loading';

  return (
    <View style={styles.aiReportCard}>
      <View style={styles.aiReportHeader}>
        <View style={styles.aiReportHeaderText}>
          <Text style={styles.aiReportKicker}>AI MONTHLY REPORT</Text>
          <Text style={styles.aiReportTitle}>{report.title}</Text>
        </View>
        <View style={styles.aiReportBadge}>
          <Text style={styles.aiReportBadgeText}>{sourceLabel}</Text>
        </View>
      </View>
      <Text style={styles.aiReportMood}>{report.mood}</Text>
      <Text style={styles.aiReportSummary}>{report.summary}</Text>
      {limitNotice ? (
        <View style={styles.aiReportLimitNotice}>
          <Ionicons name="lock-closed-outline" size={14} color={ORANGE} />
          <Text style={styles.aiReportLimitNoticeText}>{limitNotice}</Text>
        </View>
      ) : null}

      {analytics ? (
        <View style={styles.aiReportGraphSection}>
          <Text style={styles.aiReportSectionTitle}>グラフで見る</Text>
          <Text style={styles.aiReportGraphLead}>
            ジャンルの回数と、ジャンルごとの支出割合を分けて表示します。
          </Text>
          <GenreSpendDonut
            items={analytics.genreAnalytics}
            totalLabel={`${analytics.drawCount}回`}
            metric="count"
            kicker="GENRE COUNT"
            summaryText="ジャンルごとの回数を円グラフ化。どの食べ方が多かったかを先に見られます。"
            emptyText="ジャンル回数のデータがまだありません。"
          />
          <GenreSpendDonut
            items={analytics.genreAnalytics}
            totalLabel={`約${formatYen(analytics.estimatedSpend)}`}
            metric="spend"
            kicker="SPEND SHARE"
            summaryText="ジャンル → 推定支出の順で、どこに外食費が寄っているかを表示します。"
            emptyText="支出割合を出せる予算データがまだありません。"
            showSpendArrow
          />
        </View>
      ) : null}

      <View style={styles.aiReportSection}>
        <Text style={styles.aiReportSectionTitle}>今月のポイント</Text>
        {report.highlights.map((item, index) => (
          <View key={`${item}-${index}`} style={styles.aiReportListRow}>
            <Ionicons name="sparkles-outline" size={15} color={ORANGE} />
            <Text style={styles.aiReportListText}>{item}</Text>
          </View>
        ))}
      </View>

      <View style={styles.aiReportSection}>
        <Text style={styles.aiReportSectionTitle}>AIからの提案</Text>
        {report.recommendations.map((item, index) => (
          <View key={`${item}-${index}`} style={styles.aiReportListRow}>
            <Ionicons name="bulb-outline" size={15} color="#4f7f58" />
            <Text style={styles.aiReportListText}>{item}</Text>
          </View>
        ))}
      </View>

      <View style={styles.aiReportSavingBox}>
        <Text style={styles.aiReportSavingTitle}>節約のコツ</Text>
        {report.savingsTips.map((item, index) => (
          <View key={`${item}-${index}`} style={styles.aiReportListRow}>
            <Ionicons name="wallet-outline" size={15} color="#4f7f58" />
            <Text style={styles.aiReportListText}>{item}</Text>
          </View>
        ))}
      </View>

      <View style={styles.aiReportNextBox}>
        <Ionicons name="arrow-forward-circle-outline" size={18} color={INK} />
        <Text style={styles.aiReportNextText}>{report.nextAction}</Text>
      </View>

      <View style={styles.aiReportClosingBox}>
        <Text style={styles.aiReportClosingTitle}>最後にひとこと</Text>
        <Text style={styles.aiReportClosingParagraph}>
          {report.closingNotes.filter(Boolean).join('\n')}
        </Text>
      </View>

      <View style={styles.aiReportFooter}>
        <Text style={styles.aiReportGenerated}>{generatedDate || '生成済み'}</Text>
        {canRefresh ? (
          <Pressable style={styles.aiReportRefreshButton} onPress={onRefresh} disabled={isLoading}>
            {isLoading ? <ActivityIndicator size="small" color={ORANGE} /> : <Ionicons name="refresh" size={14} color={ORANGE} />}
            <Text style={styles.aiReportRefreshText}>{isLoading ? '更新中' : '再生成'}</Text>
          </Pressable>
        ) : (
          <View style={styles.aiReportLimitPill}>
            <Ionicons name="checkmark-circle-outline" size={14} color={ORANGE} />
            <Text style={styles.aiReportLimitPillText}>1人1回まで</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function YearlyWrappedCard({
  analytics,
  report,
  open,
  now,
  isDemoPreview,
  isPro,
  onToggle,
  onToggleDemo,
  onOpenPro,
}: {
  analytics: YearlyAnalytics;
  report: YearlyWrappedReport;
  open: boolean;
  now: Date;
  isDemoPreview: boolean;
  isPro: boolean;
  onToggle: () => void;
  onToggleDemo: () => void;
  onOpenPro: () => void;
}) {
  const isYearEndWindow = now.getMonth() === 11 && now.getDate() >= 31;
  const releaseLabel = isDemoPreview ? 'デモ表示' : isYearEndWindow ? '公開中' : '12/31公開';
  const activeMonthsLabel = analytics.activeMonthCount ? `${analytics.activeMonthCount}か月分` : '記録待ち';
  const demoRangeLabel = `${now.getMonth() + 1}/${now.getDate()}〜12/31`;
  const freeHighlights = report.highlights.slice(0, 3);
  const proHighlights = report.highlights.slice(3);
  const proFeatureLines = [
    '節約のコツと来年の食べ方ミッション',
    '月別のピーク・価格帯・ジャンル偏り',
    'アルバム/スライドショーと過去年度保存',
  ];

  return (
    <View style={styles.yearWrappedCard}>
      <View style={styles.yearWrappedHeader}>
        <View style={styles.yearWrappedHeaderText}>
          <Text style={styles.yearWrappedKicker}>Year Review</Text>
          <Text style={styles.yearWrappedTitle}>{report.title}</Text>
        </View>
        <View style={styles.yearWrappedBadge}>
          <Ionicons name="sparkles-outline" size={14} color="#fff2df" />
          <Text style={styles.yearWrappedBadgeText}>{releaseLabel}</Text>
        </View>
      </View>

      <Text style={styles.yearWrappedSubtitle}>{report.subtitle}</Text>
      <Text style={styles.yearWrappedSourceText}>
        {isDemoPreview ? `${demoRangeLabel}のデモ外食ログで表示中` : '実際のルーレット履歴から年末まとめを作成します。'}
      </Text>
      <Text style={styles.yearWrappedHero}>{report.heroLine}</Text>

      <View style={styles.yearWrappedMetricGrid}>
        <View style={styles.yearWrappedMetric}>
          <Text style={styles.yearWrappedMetricLabel}>外食ログ</Text>
          <Text style={styles.yearWrappedMetricValue}>{report.totalMealsLabel}</Text>
        </View>
        <View style={styles.yearWrappedMetric}>
          <Text style={styles.yearWrappedMetricLabel}>推定外食費</Text>
          <Text style={styles.yearWrappedMetricValue}>{report.totalSpendLabel}</Text>
        </View>
        <View style={styles.yearWrappedMetric}>
          <Text style={styles.yearWrappedMetricLabel}>トップジャンル</Text>
          <Text style={styles.yearWrappedMetricValue}>{report.topGenreLabel}</Text>
        </View>
        <View style={styles.yearWrappedMetric}>
          <Text style={styles.yearWrappedMetricLabel}>よく行った県</Text>
          <Text style={styles.yearWrappedMetricValue}>{report.topAreaLabel}</Text>
        </View>
        <View style={styles.yearWrappedMetric}>
          <Text style={styles.yearWrappedMetricLabel}>一番濃い月</Text>
          <Text style={styles.yearWrappedMetricValue}>{report.topMonthLabel}</Text>
        </View>
        <View style={styles.yearWrappedMetric}>
          <Text style={styles.yearWrappedMetricLabel}>平均単価</Text>
          <Text style={styles.yearWrappedMetricValue}>{report.averageBudgetLabel}</Text>
        </View>
      </View>

      <View style={styles.yearWrappedMiniRow}>
        <View style={styles.yearWrappedMiniPill}>
          <Ionicons name="calendar-outline" size={13} color="#f6b27d" />
          <Text style={styles.yearWrappedMiniText}>{activeMonthsLabel}</Text>
        </View>
        <View style={styles.yearWrappedMiniPill}>
          <Ionicons name="restaurant-outline" size={13} color="#9bd37f" />
          <Text style={styles.yearWrappedMiniText}>{analytics.genreAnalytics.length}ジャンル</Text>
        </View>
        <View style={styles.yearWrappedMiniPill}>
          <Ionicons name="map-outline" size={13} color="#a7c7ff" />
          <Text style={styles.yearWrappedMiniText}>{analytics.areaAnalytics.length}県</Text>
        </View>
      </View>

      <View style={styles.yearWrappedActionRow}>
        <Pressable
          style={[styles.yearWrappedGhostButton, isDemoPreview && styles.yearWrappedGhostButtonActive]}
          onPress={onToggleDemo}
        >
          <Ionicons name="sparkles-outline" size={15} color={isDemoPreview ? '#15120f' : '#f2c27f'} />
          <Text style={[styles.yearWrappedGhostText, isDemoPreview && styles.yearWrappedGhostTextActive]}>
            {isDemoPreview ? '実データに戻す' : '年末デモを見る'}
          </Text>
        </Pressable>
        <Pressable style={styles.yearWrappedToggleButton} onPress={onToggle}>
          <Text style={styles.yearWrappedToggleText}>{open ? '閉じる' : '詳細を見る'}</Text>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color="#16130f" />
        </Pressable>
      </View>

      {open ? (
        <View style={styles.yearWrappedDetail}>
          <Text style={styles.yearWrappedSectionTitle}>無料で見られるまとめ</Text>
          {freeHighlights.map((item, index) => (
            <View key={`${item}-${index}`} style={styles.yearWrappedHighlightRow}>
              <Text style={styles.yearWrappedHighlightIndex}>{index + 1}</Text>
              <Text style={styles.yearWrappedHighlightText}>{item}</Text>
            </View>
          ))}

          {isPro ? (
            <>
              <View style={styles.yearWrappedProHeader}>
                <Text style={styles.yearWrappedSectionTitle}>Proの深掘り</Text>
                <ProBadge label="Pro" dark />
              </View>
              {proHighlights.map((item, index) => (
                <View key={`${item}-${index}`} style={styles.yearWrappedHighlightRow}>
                  <Text style={styles.yearWrappedHighlightIndex}>{freeHighlights.length + index + 1}</Text>
                  <Text style={styles.yearWrappedHighlightText}>{item}</Text>
                </View>
              ))}
              <View style={styles.yearWrappedMissionBox}>
                <Ionicons name="flag-outline" size={18} color="#d8b77d" />
                <Text style={styles.yearWrappedMissionText}>{report.nextYearMission}</Text>
              </View>
            </>
          ) : (
            <Pressable style={styles.yearWrappedProLockBox} onPress={onOpenPro}>
              <View style={styles.yearWrappedProLockTop}>
                <View style={styles.yearWrappedProLockIcon}>
                  <Ionicons name="lock-closed-outline" size={17} color="#16130f" />
                </View>
                <View style={styles.yearWrappedProLockCopy}>
                  <Text style={styles.yearWrappedProLockTitle}>深掘り年間レポートはPro</Text>
                  <Text style={styles.yearWrappedProLockText}>
                    無料では年1回の基本まとめまで。Proなら節約・月別比較・保存まで見られます。
                  </Text>
                </View>
              </View>
              <View style={styles.yearWrappedProList}>
                {proFeatureLines.map((line) => (
                  <View key={line} style={styles.yearWrappedProListRow}>
                    <Ionicons name="checkmark-circle-outline" size={15} color="#d8b77d" />
                    <Text style={styles.yearWrappedProListText}>{line}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.yearWrappedProButton}>
                <Text style={styles.yearWrappedProButtonText}>Proで深掘りを見る</Text>
                <Ionicons name="arrow-forward" size={15} color="#16130f" />
              </View>
            </Pressable>
          )}
        </View>
      ) : null}
    </View>
  );
}

function ProPaywall({
  visible,
  title,
  message,
  onStartPro,
  onRestorePro,
  onClose,
}: {
  visible: boolean;
  title?: string;
  message?: string;
  onStartPro: () => void;
  onRestorePro: () => void;
  onClose: () => void;
}) {
  const features = ['先月との差がわかる', '過去月の分析を保存', 'ジャンル別の傾向を確認', '価格帯ごとの傾向を確認', 'お気に入り店を分析'];

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View style={styles.proPaywallBackdrop}>
        <View style={styles.proPaywallCard}>
          <View style={styles.proPaywallHeader}>
            <View>
              <Text style={styles.proPaywallKicker}>RANDISH PRO</Text>
              <Text style={styles.proPaywallTitle}>今月だけで終わらせない。</Text>
            </View>
            <Pressable style={styles.proPaywallClose} onPress={onClose}>
              <Ionicons name="close" size={21} color={INK} />
            </Pressable>
          </View>
          <Text style={styles.proPaywallContextTitle}>{title ?? 'RANDISH PRO'}</Text>
          <Text style={styles.proPaywallLead}>
            {message ?? '過去の抽選・外食費・ジャンル傾向を残して見返せます。'}
          </Text>
          <View style={styles.proPaywallFeatureList}>
            {features.map((feature, index) => (
              <View key={`${feature}-${index}`} style={styles.proPaywallFeatureRow}>
                <Ionicons name="checkmark-circle" size={18} color={ORANGE} />
                <Text style={styles.proPaywallFeatureText}>{feature}</Text>
              </View>
            ))}
          </View>
          <Pressable
            style={styles.proPaywallPrimaryButton}
            onPress={() => {
              onStartPro();
              onClose();
            }}
          >
            <Text style={styles.proPaywallPrimaryText}>RANDISH PROを始める</Text>
          </Pressable>
          <Pressable
            style={styles.proPaywallRestoreButton}
            onPress={() => {
              onRestorePro();
              onClose();
            }}
          >
            <Text style={styles.proPaywallRestoreText}>購入を復元</Text>
          </Pressable>
          <Pressable style={styles.proPaywallSecondaryButton} onPress={onClose}>
            <Text style={styles.proPaywallSecondaryText}>あとで</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const ANALYSIS_DONUT_COLORS = ['#f05a28', '#f2a51a', '#9b6b43', '#4f7f58', '#d89a68'];
type DonutMetricMode = 'auto' | 'count' | 'spend';

function GenreSpendDonut({
  items,
  totalLabel,
  metric = 'auto',
  kicker = 'GENRE PIE',
  summaryText,
  emptyText = '推定できる予算データがまだありません。',
  showSpendArrow = false,
}: {
  items: AnalyticsTrendItem[];
  totalLabel: string;
  metric?: DonutMetricMode;
  kicker?: string;
  summaryText?: string;
  emptyText?: string;
  showSpendArrow?: boolean;
}) {
  const shouldUseSpend = metric === 'spend'
    || (metric === 'auto' && items.some((item) => item.estimatedSpend > 0));
  const getMetric = (item: AnalyticsTrendItem) => shouldUseSpend ? item.estimatedSpend : item.count;
  const sourceItems = items
    .filter((item) => item.count > 0 || item.estimatedSpend > 0)
    .filter((item) => getMetric(item) > 0)
    .sort((a, b) => getMetric(b) - getMetric(a));
  const topItems = sourceItems.slice(0, 4);
  const restItems = sourceItems.slice(4);
  const restMetric = restItems.reduce((total, item) => total + getMetric(item), 0);
  const restSpend = restItems.reduce((total, item) => total + item.estimatedSpend, 0);
  const restCount = restItems.reduce((total, item) => total + item.count, 0);
  const chartItems = restMetric > 0
    ? [...topItems, { label: 'その他', count: restCount, estimatedSpend: restSpend }]
    : topItems;
  const totalMetric = chartItems.reduce((total, item) => total + getMetric(item), 0);
  const totalCount = chartItems.reduce((total, item) => total + item.count, 0);

  if (!totalMetric) {
    return (
      <View style={styles.analysisDonutEmpty}>
        <Ionicons name="pie-chart-outline" size={28} color={ORANGE} />
        <Text style={styles.analysisDonutEmptyText}>{emptyText}</Text>
      </View>
    );
  }

  const chartSize = 138;
  const strokeWidth = 32;
  const radius = (chartSize - strokeWidth) / 2;
  const center = chartSize / 2;
  const circumference = 2 * Math.PI * radius;
  let segmentOffset = 0;
  const primaryPercent = Math.round((getMetric(chartItems[0]) / totalMetric) * 100);

  return (
    <View style={styles.analysisDonutPanel}>
      <View style={styles.analysisDonutTop}>
        <View style={styles.analysisDonutChart}>
          <Svg width={chartSize} height={chartSize}>
            <G rotation={-90} originX={center} originY={center}>
              <Circle
                cx={center}
                cy={center}
                r={radius}
                stroke="#efe5db"
                strokeWidth={strokeWidth}
                fill="none"
              />
              {chartItems.map((item, index) => {
                const itemMetric = getMetric(item);
                const fullDash = (itemMetric / totalMetric) * circumference;
                const dash = chartItems.length > 1 ? Math.max(0, fullDash - 2) : fullDash;
                const offset = segmentOffset;
                segmentOffset += fullDash;
                return (
                  <Circle
                    key={`${item.label}-${index}`}
                    cx={center}
                    cy={center}
                    r={radius}
                    stroke={ANALYSIS_DONUT_COLORS[index % ANALYSIS_DONUT_COLORS.length]}
                    strokeWidth={strokeWidth}
                    strokeDasharray={`${dash} ${circumference}`}
                    strokeDashoffset={-offset}
                    strokeLinecap="butt"
                    fill="none"
                  />
                );
              })}
            </G>
          </Svg>
          <View style={styles.analysisDonutCenter}>
            <Text style={styles.analysisDonutCenterLabel}>今月</Text>
            <Text style={styles.analysisDonutCenterValue} numberOfLines={1}>{shouldUseSpend ? totalLabel : `${totalCount}回`}</Text>
          </View>
          <View style={styles.analysisDonutShareBadge}>
            <Text style={styles.analysisDonutShareText}>{primaryPercent}%</Text>
          </View>
        </View>
        <View style={styles.analysisDonutSummary}>
          <Text style={styles.analysisDonutSummaryKicker}>{kicker}</Text>
          <Text style={styles.analysisDonutSummaryTitle}>{chartItems[0].label}</Text>
          <Text style={styles.analysisDonutSummaryText}>
            {summaryText ?? '今月いちばん多いジャンル。下に結果のgenre・回数・割合を表示します。'}
          </Text>
        </View>
      </View>
      <View style={styles.analysisDonutLegend}>
        {chartItems.map((item, index) => {
          const color = ANALYSIS_DONUT_COLORS[index % ANALYSIS_DONUT_COLORS.length];
          const percent = Math.round((getMetric(item) / totalMetric) * 100);
          const spendLabel = item.estimatedSpend > 0 ? `約${formatYen(item.estimatedSpend)}` : '未計測';
          return (
            <View key={`${item.label}-${index}`} style={styles.analysisDonutLegendRow}>
              <View style={[styles.analysisDonutLegendDot, { backgroundColor: color }]} />
              <View style={styles.analysisDonutLegendBody}>
                <Text style={styles.analysisDonutLegendLabel} numberOfLines={1}>{item.label}</Text>
                <Text style={styles.analysisDonutLegendMeta}>
                  {shouldUseSpend && showSpendArrow
                    ? `支出 → ${spendLabel} / ${percent}% / ${item.count}回`
                    : `${item.count}回 / ${percent}%${shouldUseSpend && item.estimatedSpend > 0 ? ` / ${spendLabel}` : ''}`}
                </Text>
                <View style={styles.analysisDonutLegendTrack}>
                  <View style={[styles.analysisDonutLegendFill, { width: `${percent}%`, backgroundColor: color }]} />
                </View>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function AnalysisSectionHeader({ kicker, title, lead }: { kicker: string; title: string; lead?: string }) {
  return (
    <View style={styles.analysisSectionHeader}>
      <Text style={styles.analysisSectionKicker}>{kicker}</Text>
      <Text style={styles.analysisSectionTitle}>{title}</Text>
      {lead && <Text style={styles.analysisSectionLead}>{lead}</Text>}
    </View>
  );
}

function AnalysisDigestCard({
  analytics,
  totalLabel,
  averageBudgetLabel,
  savedCount,
  onSpendPress,
}: {
  analytics: MonthlyAnalytics;
  totalLabel: string;
  averageBudgetLabel: string;
  savedCount: number;
  onSpendPress: () => void;
}) {
  const sampleLabel = analytics.budgetSampleCount ? `${analytics.budgetSampleCount}件から推定` : '推定データなし';
  const metrics = [
    { label: '抽選', value: `${analytics.drawCount}回` },
    { label: 'お気に入り', value: `${savedCount}件` },
    { label: '多いジャンル', value: analytics.topGenre },
    { label: '平均単価', value: averageBudgetLabel },
  ];

  return (
    <View style={styles.analysisDigestCard}>
      <View pointerEvents="none" style={styles.analysisDigestMapArt}>
        <View style={[styles.analysisDigestRoad, styles.analysisDigestRoadOne]} />
        <View style={[styles.analysisDigestRoad, styles.analysisDigestRoadTwo]} />
        <View style={styles.analysisDigestPin}>
          <View style={styles.analysisDigestPinCore} />
        </View>
        <View style={styles.analysisDigestBars}>
          <View style={[styles.analysisDigestBar, styles.analysisDigestBarOne]} />
          <View style={[styles.analysisDigestBar, styles.analysisDigestBarTwo]} />
          <View style={[styles.analysisDigestBar, styles.analysisDigestBarThree]} />
        </View>
      </View>
      <View style={styles.analysisDigestTopRow}>
        <View>
          <Text style={styles.analysisDigestKicker}>MONTHLY DIGEST</Text>
          <Text style={styles.analysisDigestTitle}>今月の外食ログ</Text>
        </View>
        <View style={styles.analysisDigestMonth}>
          <Text style={styles.analysisDigestMonthText}>{analytics.monthLabel}</Text>
        </View>
      </View>
      <Text style={styles.analysisDigestAmount} numberOfLines={1}>{totalLabel}</Text>
      <Text style={styles.analysisDigestLead}>{sampleLabel}。抽選した店の平均予算をざっくり見返せます。</Text>
      <View style={styles.analysisDigestMetricGrid}>
        {metrics.map((item) => (
          <View key={item.label} style={styles.analysisDigestMetric}>
            <Text style={styles.analysisDigestMetricLabel}>{item.label}</Text>
            <Text style={styles.analysisDigestMetricValue} numberOfLines={1}>{item.value}</Text>
          </View>
        ))}
      </View>
      <Pressable style={styles.analysisDigestButton} onPress={onSpendPress}>
        <Text style={styles.analysisDigestButtonText}>内訳を見る</Text>
        <Ionicons name="chevron-down" size={16} color={ORANGE} />
      </Pressable>
    </View>
  );
}

function AnalyticsTab({
  uiText,
  userId,
  apiBaseUrlCandidates,
  area,
  locationStatus,
  restaurants,
  history,
  drawHistories,
  savedRestaurants,
  isPro,
  onStartPro,
  onRestorePro,
  onAreaPress,
}: {
  uiText: Record<string, string>;
  userId: string;
  apiBaseUrlCandidates: readonly string[];
  area: string;
  locationStatus: string;
  restaurants: Restaurant[];
  history: Restaurant[];
  drawHistories: DrawHistoryEntry[];
  savedRestaurants: SavedRestaurant[];
  isPro: boolean;
  onStartPro: () => void;
  onRestorePro: () => void;
  onAreaPress: () => void;
}) {
  const [paywallContext, setPaywallContext] = useState<{ title: string; message: string } | null>(null);
  const [spendOpen, setSpendOpen] = useState(false);
  const [aiReportOpen, setAiReportOpen] = useState(false);
  const [aiReportStatus, setAiReportStatus] = useState<AiReportStatus>('idle');
  const [aiReport, setAiReport] = useState<AiMonthlyReport | null>(null);
  const [aiReportUsed, setAiReportUsed] = useState(false);
  const [aiReportSamplePreview, setAiReportSamplePreview] = useState(false);
  const [yearlyWrappedOpen, setYearlyWrappedOpen] = useState(false);
  const [yearlyWrappedDemoPreview, setYearlyWrappedDemoPreview] = useState(false);
  const now = useMemo(() => new Date(), []);

  const analyticsEntries = useMemo(() => {
    if (drawHistories.length || !history.length) {
      return drawHistories;
    }
    const createdAt = new Date().toISOString();
    return history.map((restaurant, index) => ({
      id: `session-${restaurant.id}-${index}`,
      provider: (restaurant.externalProvider || 'RANDISH_SEED').toUpperCase(),
      providerPlaceId: getProviderPlaceId(restaurant),
      restaurantId: shouldPersistRestaurantId(restaurant) ? restaurant.id : null,
      restaurant,
      area: restaurant.area ?? null,
      genre: restaurant.genre ?? null,
      budgetMin: toOptionalNumber(restaurant.budgetMin) ?? null,
      budgetMax: toOptionalNumber(restaurant.budgetMax) ?? null,
      rangeMeters: null,
      createdAt,
    }));
  }, [drawHistories, history]);

  const currentAnalytics = useMemo(() => getCurrentMonthAnalytics(analyticsEntries, now), [analyticsEntries, now]);
  const yearlyDemoEntries = useMemo(() => buildDemoYearlyWrappedEntries(now), [now]);
  const yearlyWrappedEntries = yearlyWrappedDemoPreview ? yearlyDemoEntries : analyticsEntries;
  const yearlyAnalytics = useMemo(() => getYearlyAnalytics(yearlyWrappedEntries, now), [now, yearlyWrappedEntries]);
  const yearlyWrappedReport = useMemo(() => buildYearlyWrappedReport(yearlyAnalytics), [yearlyAnalytics]);
  const comparison = useMemo(() => getPreviousMonthComparison(analyticsEntries, now), [analyticsEntries, now]);
  const savedAnalytics = useMemo(() => getSavedRestaurantAnalytics(savedRestaurants), [savedRestaurants]);
  const sampleReportAnalytics = useMemo(
    () => buildDemoAiReportAnalytics(AI_REPORT_SAMPLE_GENRE_PLANS, AI_REPORT_SAMPLE_MEAL_COUNT, area, now),
    [area, now],
  );
  const reportAnalytics = aiReportSamplePreview ? sampleReportAnalytics : currentAnalytics;
  const localAiReportPreview = useMemo(() => buildLocalAiReport(reportAnalytics, savedAnalytics), [reportAnalytics, savedAnalytics]);
  const reportDataSignature = useMemo(
    () => [
      reportAnalytics.monthLabel,
      reportAnalytics.drawCount,
      reportAnalytics.estimatedSpend,
      reportAnalytics.genreAnalytics.map((item) => `${item.label}:${item.count}:${item.estimatedSpend}`).join(','),
      savedAnalytics.totalSaved,
      aiReportSamplePreview ? 'sample' : 'live',
    ].join('|'),
    [aiReportSamplePreview, reportAnalytics, savedAnalytics],
  );
  const monthSeries = useMemo(
    () => [5, 4, 3, 2, 1, 0].map((offset) => getMonthlyAnalytics(analyticsEntries, addMonthsToStart(now, -offset))),
    [analyticsEntries, now],
  );

  useEffect(() => {
    setAiReportOpen(false);
    setAiReport(null);
    setAiReportStatus('idle');
    setAiReportUsed(false);
  }, [reportDataSignature]);

  const monthlyTotalLabel = currentAnalytics.budgetSampleCount ? `約${formatYen(currentAnalytics.estimatedSpend)}` : '0円';
  const averageBudgetLabel = currentAnalytics.budgetSampleCount ? `約${formatYen(currentAnalytics.averageBudget)}` : '0円';
  const topPriceRange = currentAnalytics.priceRangeAnalytics[0]?.label ?? 'まだなし';
  const topSavedGenre = savedAnalytics.genreAnalytics[0]?.label ?? 'まだなし';
  const topSavedPrice = savedAnalytics.priceRangeAnalytics[0]?.label ?? 'まだなし';

  const openPaywall = useCallback((title = 'RANDISH PRO', message = '過去の抽選・外食費・ジャンル傾向を残して見返せます。') => {
    setPaywallContext({ title, message });
  }, []);

  const openGenrePaywall = useCallback(() => {
    openPaywall(
      'ジャンル別の傾向はPro機能です。',
      '過去の抽選から、よく出るジャンル・価格帯・お気に入り傾向を確認できます。',
    );
  }, [openPaywall]);

  const toggleAiReportSamplePreview = useCallback(() => {
    setAiReportSamplePreview((current) => !current);
  }, []);

  const toggleYearlyWrapped = useCallback(() => {
    setYearlyWrappedOpen((current) => !current);
  }, []);

  const toggleYearlyWrappedDemoPreview = useCallback(() => {
    setYearlyWrappedDemoPreview((current) => !current);
    setYearlyWrappedOpen(true);
  }, []);

  const loadAiReport = useCallback(async () => {
    if (aiReportStatus === 'loading' || reportAnalytics.drawCount === 0) {
      return;
    }
    setAiReportOpen(false);
    setAiReportStatus('loading');
    const nextReport = await requestAiMonthlyReport(reportAnalytics, savedAnalytics, apiBaseUrlCandidates, userId);
    setAiReport(nextReport);
    setAiReportUsed(true);
    setAiReportStatus(nextReport.source === 'fallback' ? 'error' : 'ready');
    setAiReportOpen(true);
  }, [aiReportStatus, apiBaseUrlCandidates, reportAnalytics, savedAnalytics, userId]);

  const openAiReport = useCallback(() => {
    if (!isPro) {
      openPaywall(
        '月次AIレポートはPro機能です。',
        'ルーレット履歴から外食傾向、節約のヒント、次の選び方までまとめます。',
      );
      return;
    }
    if (aiReportUsed && aiReport) {
      setAiReportOpen(true);
      return;
    }
    if (!aiReportUsed && aiReportStatus === 'idle') {
      void loadAiReport();
      return;
    }
  }, [aiReport, aiReportStatus, aiReportUsed, isPro, loadAiReport, openPaywall]);

  return (
    <View style={styles.analysisScreen}>
      <View style={styles.analysisTitleBlock}>
        <View style={styles.analysisTitleRow}>
          <View style={styles.analysisTitleBar} />
          <Text style={styles.analysisTitle}>{uiText.analyticsTitle}</Text>
        </View>
        <Text style={styles.analysisLead}>{uiText.analyticsLead}</Text>
      </View>

      <AiMonthlyReportEntryCard
        analytics={reportAnalytics}
        status={aiReportStatus}
        hasReport={Boolean(aiReport)}
        isPro={isPro}
        isSamplePreview={aiReportSamplePreview}
        onOpen={openAiReport}
        onToggleSample={toggleAiReportSamplePreview}
      />

      {aiReportOpen && (
        <AiMonthlyReportCard
          report={aiReport ?? localAiReportPreview}
          analytics={reportAnalytics}
          status={aiReportStatus}
          onRefresh={loadAiReport}
          canRefresh={false}
          limitNotice={AI_REPORT_MONTHLY_NOTICE}
        />
      )}

      <YearlyWrappedCard
        analytics={yearlyAnalytics}
        report={yearlyWrappedReport}
        open={yearlyWrappedOpen}
        now={now}
        isDemoPreview={yearlyWrappedDemoPreview}
        isPro={isPro}
        onToggle={toggleYearlyWrapped}
        onToggleDemo={toggleYearlyWrappedDemoPreview}
        onOpenPro={() => openPaywall('年末Wrappedの深掘りはPro機能です。', '無料では年1回の基本まとめまで。Proなら節約のコツ、月別比較、アルバム/スライドショー、過去年度保存まで見られます。')}
      />

      <AnalysisDigestCard
        analytics={currentAnalytics}
        totalLabel={monthlyTotalLabel}
        averageBudgetLabel={averageBudgetLabel}
        savedCount={savedRestaurants.length}
        onSpendPress={() => setSpendOpen(true)}
      />

      <ProTeaserCard isPro={isPro} onPress={isPro ? () => undefined : () => openPaywall()} />

      <AnalysisSectionHeader
        kicker="FREE ANALYTICS"
        title="今月の支出をざっくり見る"
        lead="手入力なし。抽選結果の平均予算から、外食費の目安だけを軽く見返せます。"
      />

      <View style={styles.analysisFreeCard}>
        <View style={styles.analysisFreeTopRow}>
          <View>
            <Text style={styles.analysisFreeLabel}>FREE PLAN</Text>
            <Text style={styles.analysisFreeTitle}>今月の推定外食費</Text>
          </View>
          <View style={styles.analysisFreeBadge}>
            <Text style={styles.analysisFreeBadgeText}>{currentAnalytics.monthLabel}</Text>
          </View>
        </View>
        <Text style={styles.analysisFreeAmount} numberOfLines={1}>{monthlyTotalLabel}</Text>
        <Pressable style={styles.analysisFreeToggle} onPress={() => setSpendOpen((current) => !current)}>
          <Text style={styles.analysisFreeToggleText}>{spendOpen ? '閉じる' : '内訳を見る'}</Text>
          <Ionicons name={spendOpen ? 'chevron-up' : 'chevron-down'} size={16} color={ORANGE} />
        </Pressable>

        {spendOpen && (
          <>
            <Text style={styles.analysisFreeText}>
              抽選時の条件から平均予算を自動で合計しています。手入力なしで、ざっくり支出を見られます。
            </Text>

            <GenreSpendDonut items={currentAnalytics.genreAnalytics} totalLabel={monthlyTotalLabel} />

            <View style={styles.analysisFreeMetaRow}>
              <View style={styles.analysisFreeMetaItem}>
                <Text style={styles.analysisFreeMetaLabel}>計算方法</Text>
                <Text style={styles.analysisFreeMetaValue}>平均予算</Text>
              </View>
              <View style={styles.analysisFreeMetaItem}>
                <Text style={styles.analysisFreeMetaLabel}>対象</Text>
                <Text style={styles.analysisFreeMetaValue}>{currentAnalytics.monthLabel}の履歴</Text>
              </View>
            </View>
          </>
        )}
      </View>

      <AnalysisSectionHeader
        kicker="RANDISH PRO"
        title="あとから見返す分析"
        lead={isPro ? '過去月の流れまで表示中です。' : '過去月・比較・お気に入り店の傾向はProで開けます。'}
      />

      <View style={styles.proFeatureGrid}>
        <ProFeatureCard
          icon="swap-vertical-outline"
          title="先月との差"
          description="先月より何円増えたか、節約できたかを見られます。"
          value={comparison.label}
          detailLines={[`先月: 約${formatYen(comparison.previous.estimatedSpend)}`, `今月: 約${formatYen(comparison.current.estimatedSpend)}`]}
          isPro={isPro}
          onPress={() => openPaywall('先月との差はPro機能です。', '先月より何円増えたか、節約できたかを見られます。')}
        />
        <ProFeatureCard
          icon="bar-chart-outline"
          title="月別の推定外食費"
          description="過去月の分析を保存して、外食費の流れを見返せます。"
          value={`今月 約${formatYen(currentAnalytics.estimatedSpend)}`}
          isPro={isPro}
          onPress={() => openPaywall('月別グラフはPro機能です。', '過去月の抽選結果と推定外食費を残して見返せます。')}
        >
          <ProMonthBars items={monthSeries} />
        </ProFeatureCard>
        <ProFeatureCard
          icon="restaurant-outline"
          title="ジャンル別傾向"
          description="よく出るジャンルや偏りを確認できます。"
          value={currentAnalytics.topGenre}
          detailLines={currentAnalytics.genreAnalytics.slice(0, 3).map((item) => `${item.label}: ${item.count}回`)}
          isPro={isPro}
          onPress={openGenrePaywall}
        />
        <ProFeatureCard
          icon="cash-outline"
          title="価格帯の傾向"
          description="抽選時の価格帯を月ごとに確認できます。"
          value={topPriceRange}
          detailLines={currentAnalytics.priceRangeAnalytics.slice(0, 3).map((item) => `${item.label}: ${item.count}回`)}
          isPro={isPro}
          onPress={() => openPaywall('価格帯の傾向はPro機能です。', '抽選時の価格帯を月ごとに確認できます。')}
        />
        <ProFeatureCard
          icon="bookmark-outline"
          title="お気に入り店の分析"
          description="お気に入り店のジャンルや価格帯を見返せます。"
          value={`${savedAnalytics.totalSaved}件お気に入り`}
          detailLines={[`ジャンル: ${topSavedGenre}`, `価格帯: ${topSavedPrice}`]}
          isPro={isPro}
          onPress={() => openPaywall('お気に入り店の分析はPro機能です。', 'お気に入り店のジャンルや価格帯を見返せます。')}
        />
      </View>

      <AnalysisSectionHeader
        kicker="THIS MONTH"
        title="最近の履歴"
        lead="今月の抽選条件だけはFreeでも残ります。"
      />

      <View style={styles.analysisHistoryCard}>
        <View style={styles.analysisHistoryHeader}>
          <Text style={styles.analysisHistoryTitle}>今月の履歴</Text>
          {isPro ? <ProBadge label="Pro保存中" /> : (
            <Pressable style={styles.analysisProMark} onPress={() => openPaywall('過去月の履歴保存はPro機能です。', 'Freeでは今月分だけ。Proなら過去月の抽選履歴を見返せます。')}>
              <Ionicons name="lock-closed-outline" size={15} color={INK} />
              <Text style={styles.analysisProMarkText}>先月はPro</Text>
            </Pressable>
          )}
        </View>

        {currentAnalytics.recentDraws.length === 0 ? (
          <View style={styles.analysisHistoryEmpty}>
            <Ionicons name="receipt-outline" size={28} color="#9a9187" />
            <Text style={styles.analysisHistoryEmptyText}>今月の履歴が入ると、ここに推定予算が並びます。</Text>
          </View>
        ) : (
          currentAnalytics.recentDraws.map((entry, index) => {
            const displayEntry = {
              ...entry,
              area: entry.area ?? entry.restaurant?.area ?? null,
              genre: entry.genre ?? entry.restaurant?.genre ?? null,
              budgetMin: entry.budgetMin ?? toOptionalNumber(entry.restaurant?.budgetMin) ?? null,
              budgetMax: entry.budgetMax ?? toOptionalNumber(entry.restaurant?.budgetMax) ?? null,
            };
            const budget = getHistoryEstimatedBudget(displayEntry);
            const title = `${displayEntry.genre ?? 'お店'}の履歴`;
            return (
              <View key={`${entry.id}-${index}`} style={styles.analysisHistoryRow}>
                <Text style={styles.analysisHistoryDate}>{formatShortDate(entry.createdAt)}</Text>
                <View style={styles.analysisHistoryBody}>
                  <Text style={styles.analysisHistoryName} numberOfLines={1}>{title}</Text>
                  <Text style={styles.analysisHistoryMeta} numberOfLines={1}>{buildHistoryMetaLine(displayEntry)}</Text>
                </View>
                <Text style={styles.analysisHistoryBudget}>{budget == null ? '未計測' : `約${formatYen(budget)}`}</Text>
              </View>
            );
          })
        )}
      </View>

      <AnalysisSectionHeader
        kicker="REPORT"
        title="月次レポート通知"
        lead="ジャンルを並べる画面ではなく、抽選履歴から届いたレポートとして見せます。"
      />

      <AnalysisReportDeliveryCard
        analytics={currentAnalytics}
        status={aiReportStatus}
        isPro={isPro}
        onOpen={openAiReport}
      />
      <ProPaywall
        visible={paywallContext != null}
        title={paywallContext?.title}
        message={paywallContext?.message}
        onStartPro={onStartPro}
        onRestorePro={onRestorePro}
        onClose={() => setPaywallContext(null)}
      />
    </View>
  );
}

function AnalysisReportDeliveryCard({
  analytics,
  status,
  isPro,
  onOpen,
}: {
  analytics: MonthlyAnalytics;
  status: AiReportStatus;
  isPro: boolean;
  onOpen: () => void;
}) {
  const hasHistory = analytics.drawCount > 0;
  const isLoading = status === 'loading';
  const spendLabel = analytics.budgetSampleCount ? `約${formatYen(analytics.estimatedSpend)}` : '未計測';
  const actionLabel = isLoading
    ? '読み込み中'
    : hasHistory
      ? isPro ? 'レポートを開く' : 'Proで受け取る'
      : '抽選後に届きます';
  const metrics = [
    { label: 'ジャンル', value: analytics.topGenre },
    { label: '場所', value: analytics.topArea },
    { label: '予算', value: spendLabel },
  ];

  return (
    <View style={styles.analysisReportDeliveryCard}>
      <View style={styles.analysisReportDeliveryTop}>
        <View style={styles.analysisReportDeliveryIcon}>
          <Ionicons name={hasHistory ? 'mail-unread-outline' : 'mail-outline'} size={25} color="#ffffff" />
        </View>
        <View style={styles.analysisReportDeliveryCopy}>
          <Text style={styles.analysisReportDeliveryKicker}>RANDISH MONTHLY</Text>
          <Text style={styles.analysisReportDeliveryTitle}>
            {hasHistory ? '今月のレポートが届きました' : '今月のレポートは準備中'}
          </Text>
          <Text style={styles.analysisReportDeliveryLead}>
            {hasHistory
              ? '抽選で出た結果をもとに、ジャンル・予算・場所を月1回のレポートへまとめます。'
              : 'ルーレットを回すと、結果が月次レポートの材料として積み上がります。'}
          </Text>
        </View>
      </View>

      <View style={styles.analysisReportDeliveryMetrics}>
        {metrics.map((item) => (
          <View key={item.label} style={styles.analysisReportDeliveryMetric}>
            <Text style={styles.analysisReportDeliveryMetricLabel}>{item.label}</Text>
            <Text style={styles.analysisReportDeliveryMetricValue} numberOfLines={1}>{item.value}</Text>
          </View>
        ))}
      </View>

      <Pressable
        style={[styles.analysisReportDeliveryButton, (!hasHistory || isLoading) && styles.analysisReportDeliveryButtonDisabled]}
        onPress={onOpen}
        disabled={!hasHistory || isLoading}
      >
        {isLoading ? <ActivityIndicator size="small" color="#ffffff" /> : <Ionicons name="document-text-outline" size={17} color="#ffffff" />}
        <Text style={styles.analysisReportDeliveryButtonText}>{actionLabel}</Text>
      </Pressable>
    </View>
  );
}

function AnalyticsMetric({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.analyticsMetric}>
      <Text style={styles.analyticsMetricIcon}>{icon}</Text>
      <View style={styles.analyticsMetricBody}>
        <Text style={styles.analyticsMetricLabel}>{label}</Text>
        <Text style={styles.analyticsMetricValue} numberOfLines={1}>{value}</Text>
        <Text style={styles.analyticsMetricFoot}>過去30日間</Text>
      </View>
    </View>
  );
}

function ResultCard({
  restaurant,
  userLocation,
  preferredArea,
  uiText = UI_TEXT.ja,
  onMapPress,
  onFavoritePress,
  isFavorite = false,
  allowExternalPhoto = false,
}: {
  restaurant: Restaurant;
  userLocation: UserLocation | null;
  preferredArea?: string | null;
  uiText?: Record<string, string>;
  onMapPress: () => void;
  onFavoritePress?: () => void;
  isFavorite?: boolean;
  allowExternalPhoto?: boolean;
}) {
  const stationAccessItems = getNearestStationAccessItems(restaurant);
  const preferredStation = getPreferredStationAccessItem(restaurant, preferredArea);
  const primaryStation = preferredStation ?? stationAccessItems[0] ?? null;
  const stationLocation = primaryStation?.location ?? null;
  const stationDistanceLabel = primaryStation ? `徒歩${primaryStation.walkingMinutes}分` : uiText.mapCheck;
  const currentDistanceLabel = userLocation ? getDistanceLabel(userLocation, restaurant, uiText) : uiText.loading;
  const stationLabel = primaryStation ? primaryStation.stationName : uiText.nearestStationFrom;
  const miniMapDistanceLabel = primaryStation ? `${primaryStation.stationName} ${stationDistanceLabel}` : stationDistanceLabel;
  const priceLabel = formatPrice(restaurant, uiText);
  const actualGenreLabel = restaurant.genre?.trim() || 'ジャンル未分類';
  const openStatus = getOpenStatus(restaurant);

  return (
    <View style={styles.resultCard}>
      <RestaurantVisual restaurant={restaurant} large allowExternalPhoto={allowExternalPhoto} />
      <View style={styles.resultContent}>
        <View style={styles.resultTitleRow}>
          <Text style={styles.resultName}>{restaurant.name}</Text>
          {!!onFavoritePress && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isFavorite ? uiText.savedRestaurant : uiText.saveRestaurant}
              style={[styles.resultFavoriteButton, isFavorite && styles.resultFavoriteButtonActive]}
              onPress={onFavoritePress}
              disabled={isFavorite}
            >
              <Ionicons name={isFavorite ? 'heart' : 'heart-outline'} size={22} color={isFavorite ? '#ffffff' : FAVORITE_PINK} />
            </Pressable>
          )}
        </View>
        <View style={styles.resultDistanceBand}>
          <View style={styles.resultDistanceList}>
            <View style={styles.resultDistanceItem}>
              <Text style={styles.resultDistanceLabel}>{stationLabel}</Text>
              <Text style={styles.resultDistanceValue}>{stationDistanceLabel}</Text>
            </View>
            <View style={styles.resultDistanceItem}>
              <Text style={styles.resultDistanceLabel}>{uiText.currentLocationFrom}</Text>
              <Text style={[styles.resultDistanceValue, !userLocation && styles.resultDistanceValueMuted]}>{currentDistanceLabel}</Text>
            </View>
          </View>
          <Pressable style={styles.resultMapShortcut} onPress={onMapPress}>
            <Text style={styles.resultMapShortcutText}>Google Map</Text>
          </Pressable>
        </View>
        <NearestStationAccess items={stationAccessItems} />
        <View style={styles.metaRow}>
          <MetaPill label={`ジャンル ${actualGenreLabel}`} />
          <MetaPill label={priceLabel} />
        </View>
        <View style={styles.ratingRow}>
          <Text style={[styles.ratingText, getRatingValue(restaurant) == null && styles.ratingTextPending]}>{getRatingLabel(restaurant)}</Text>
          <View style={styles.openStatusRow}>
            <Text style={[styles.openNowText, openStatus.active === true && styles.openNowActiveText, openStatus.active === false && styles.openNowInactiveText, openStatus.active == null && styles.openNowUnknownText]}>
              {openStatus.label}
            </Text>
            <Text style={styles.openStatusDetail}>{openStatus.detail}</Text>
          </View>
          <Text style={styles.addressText} numberOfLines={1}>{restaurant.area} / {restaurant.address}</Text>
        </View>
        <MiniGoogleMap restaurant={restaurant} distanceLabel={miniMapDistanceLabel} onPress={onMapPress} />
        {!!restaurant.note && <Text style={styles.restaurantNote}>{restaurant.note}</Text>}
        {allowExternalPhoto && restaurant.externalProvider === 'HOTPEPPER' && <HotPepperCredit compact />}
      </View>
    </View>
  );
}

function NearestStationAccess({ items }: { items: StationAccessItem[] }) {
  if (items.length === 0) {
    return null;
  }

  return (
    <View style={styles.nearestStationPanel}>
      <Text style={styles.nearestStationTitle}>[ 最寄駅 ]</Text>
      <View style={styles.nearestStationList}>
        {items.map((item) => {
          const linePrefix = item.lineLabel ? `${item.lineLabel} / ` : '';
          return (
            <Text
              key={`${item.stationName}-${item.walkingMinutes}`}
              style={styles.nearestStationText}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {linePrefix}{item.stationName}（徒歩{item.walkingMinutes}分）
            </Text>
          );
        })}
      </View>
    </View>
  );
}

function MiniGoogleMap({
  restaurant,
  distanceLabel,
  onPress,
}: {
  restaurant: Restaurant;
  distanceLabel: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.miniMapCard} onPress={onPress}>
      <View style={styles.miniMapCanvas}>
        <View style={[styles.miniMapRoad, styles.miniMapRoadOne]} />
        <View style={[styles.miniMapRoad, styles.miniMapRoadTwo]} />
        <View style={[styles.miniMapRoad, styles.miniMapRoadThree]} />
        <View style={styles.miniMapPark} />
        <View style={styles.miniMapPin}>
          <View style={styles.miniMapPinCore} />
        </View>
      </View>
      <View style={styles.miniMapInfo}>
        <Text style={styles.miniMapLabel}>Google Map</Text>
        <Text style={styles.miniMapDistance}>{distanceLabel}</Text>
        <Text style={styles.miniMapAddress} numberOfLines={1}>{restaurant.address}</Text>
      </View>
    </Pressable>
  );
}

function RestaurantCard({
  restaurant,
  uiText = UI_TEXT.ja,
  isSaved = false,
  onSavePress,
}: {
  restaurant: Restaurant;
  uiText?: Record<string, string>;
  isSaved?: boolean;
  onSavePress?: () => void;
}) {
  return (
    <View style={styles.restaurantCard}>
      <View style={styles.restaurantThumbWrap}>
        <RestaurantVisual restaurant={restaurant} />
      </View>
      <View style={styles.restaurantBody}>
        <View style={styles.restaurantTitleRow}>
          <Text style={styles.restaurantName} numberOfLines={1}>{restaurant.name}</Text>
          <Text style={[styles.restaurantRating, getRatingValue(restaurant) == null && styles.restaurantRatingPending]}>{getRatingLabel(restaurant)}</Text>
        </View>
        <Text style={styles.restaurantSub} numberOfLines={1}>{restaurant.area} / {restaurant.genre}</Text>
        <View style={styles.restaurantMetaRow}>
          <Text style={styles.restaurantMetaPill}>{getStoredMinutesLabel(restaurant, uiText)}</Text>
          <Text style={styles.restaurantMetaPill}>{formatPrice(restaurant, uiText)}</Text>
        </View>
      </View>
      {!!onSavePress && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isSaved ? uiText.savedRestaurant : uiText.saveRestaurant}
          style={[styles.restaurantFavoriteButton, isSaved && styles.restaurantFavoriteButtonActive]}
          onPress={onSavePress}
          disabled={isSaved}
        >
          <Ionicons name={isSaved ? 'heart' : 'heart-outline'} size={17} color={isSaved ? '#ffffff' : FAVORITE_PINK} />
        </Pressable>
      )}
    </View>
  );
}

function CandidateCard({ restaurant, uiText = UI_TEXT.ja }: { restaurant: Restaurant; uiText?: Record<string, string> }) {
  return (
    <View style={styles.candidateCard}>
      <View style={styles.candidateImageWrap}>
        <RestaurantVisual restaurant={restaurant} large />
        <View style={styles.candidateShade} />
        <View style={styles.candidateTopBadge}>
          <Text style={styles.candidateTopBadgeText}>{getRatingLabel(restaurant)}</Text>
        </View>
        <View style={styles.candidateGenreBadge}>
          <Text style={styles.candidateGenreText}>{restaurant.genre}</Text>
        </View>
      </View>
      <View style={styles.candidateBody}>
        <Text style={styles.candidateName} numberOfLines={1}>{restaurant.name}</Text>
        <Text style={styles.candidateMeta} numberOfLines={1}>{restaurant.area}</Text>
        <View style={styles.candidateInfoRow}>
          <Text style={styles.candidateInfoPill}>{getStoredMinutesLabel(restaurant, uiText)}</Text>
          <Text style={styles.candidateInfoPill}>{formatPrice(restaurant, uiText)}</Text>
        </View>
      </View>
    </View>
  );
}

function RestaurantVisual({
  restaurant,
  large = false,
  allowExternalPhoto = false,
}: {
  restaurant: Restaurant;
  large?: boolean;
  allowExternalPhoto?: boolean;
}) {
  const genreVisual = getGenreVisual(restaurant.genre);
  const imageCredit = '画像提供：ホットペッパー グルメ';
  const hotPepperPhotoUrl = allowExternalPhoto && restaurant.externalProvider === 'HOTPEPPER'
    ? restaurant.photoUrl
    : null;

  if (hotPepperPhotoUrl) {
    return (
      <View style={[large ? styles.restaurantVisualLarge : styles.restaurantVisual, styles.restaurantVisualFrame]}>
        <Image source={{ uri: hotPepperPhotoUrl }} style={styles.restaurantVisualPhoto} resizeMode="cover" />
        {large && (
          <Text style={styles.hotpepperImageCredit} numberOfLines={1}>
            {imageCredit}
          </Text>
        )}
      </View>
    );
  }

  return (
    <View
      style={[
        large ? styles.restaurantVisualLarge : styles.restaurantVisual,
        styles.restaurantVisualFrame,
        { backgroundColor: hexToRgba(genreVisual.color, 0.09) },
      ]}
    >
      <View style={[styles.genreVisualGlow, { backgroundColor: hexToRgba(genreVisual.color, 0.12) }]} />
      <Image
        source={genreVisual.image}
        style={[styles.genreVisualImage, large ? styles.genreVisualImageLarge : styles.genreVisualImageSmall]}
        resizeMode="contain"
      />
      {large && (
        <View style={styles.genreVisualLabel}>
          <Text style={[styles.genreVisualLabelText, { color: genreVisual.color }]} numberOfLines={1}>
            {restaurant.genre}
          </Text>
        </View>
      )}
    </View>
  );
}

function HistoryEntrySection({
  entries,
  fallbackHistory,
  uiText,
  loadingId,
  error,
  onEntryPress,
}: {
  entries: DrawHistoryEntry[];
  fallbackHistory: Restaurant[];
  uiText: Record<string, string>;
  loadingId: string | null;
  error: string | null;
  onEntryPress: (entry: DrawHistoryEntry) => void;
}) {
  if (entries.length === 0) {
    return <HistorySection history={fallbackHistory} uiText={uiText} showAll />;
  }

  return (
    <View>
      <SectionHeader title={uiText.recentHistory} action={`${entries.length}件`} />
      {!!error && (
        <View style={styles.savedErrorNotice}>
          <Ionicons name="alert-circle-outline" size={18} color={ORANGE} />
          <Text style={styles.savedErrorText}>{error}</Text>
        </View>
      )}
      {entries.map((entry, index) => {
        const loading = loadingId === entry.id;
        const displayEntry = {
          ...entry,
          area: entry.area ?? entry.restaurant?.area ?? null,
          genre: entry.genre ?? entry.restaurant?.genre ?? null,
          budgetMin: entry.budgetMin ?? toOptionalNumber(entry.restaurant?.budgetMin) ?? null,
          budgetMax: entry.budgetMax ?? toOptionalNumber(entry.restaurant?.budgetMax) ?? null,
        };
        return (
          <View key={`${entry.id}-history-lookup-${index}`} style={styles.historyLookupCard}>
            <View style={styles.historyLookupTopRow}>
              <View style={styles.historyLookupIcon}>
                <GenreIconVisual genre={displayEntry.genre} />
              </View>
              <View style={styles.historyLookupBody}>
                <Text style={styles.historyLookupTitle}>{displayEntry.genre ?? 'お店'}の履歴</Text>
                <Text style={styles.historyLookupMeta} numberOfLines={1}>
                  {buildHistoryMetaLine(displayEntry)}
                </Text>
                <Text style={styles.historyLookupId} numberOfLines={1}>
                  {getProviderLabel(entry.provider)} / {formatShortDateTime(entry.createdAt) || '履歴'}
                </Text>
              </View>
            </View>
            <Pressable
              style={[styles.historyLookupButton, loading && styles.historyLookupButtonDisabled]}
              onPress={() => onEntryPress(entry)}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <>
                  <Ionicons name="cloud-download-outline" size={16} color="#ffffff" />
                  <Text style={styles.historyLookupButtonText}>{entry.restaurant ? '詳細画面で見る' : '最新情報を取得'}</Text>
                </>
              )}
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

function HistorySection({
  history,
  uiText,
  showAll = false,
}: {
  history: Restaurant[];
  uiText: Record<string, string>;
  showAll?: boolean;
}) {
  const displayedHistory = showAll ? history : history.slice(0, 5);
  return (
    <View>
      <SectionHeader title={uiText.recentHistory} action={history.length ? `${history.length}件` : uiText.noHistory} />
      {history.length === 0 ? (
        <Text style={styles.mutedText}>{uiText.historyEmpty}</Text>
      ) : (
        displayedHistory.map((restaurant, index) => {
          const provider = (restaurant.externalProvider || 'RANDISH_SEED').toUpperCase();
          const entry: DrawHistoryEntry = {
            id: `fallback-${restaurant.id}-${index}`,
            provider,
            providerPlaceId: getProviderPlaceId(restaurant),
            restaurantId: shouldPersistRestaurantId(restaurant) ? restaurant.id : null,
            restaurant: null,
            area: restaurant.area ?? null,
            genre: restaurant.genre ?? null,
            budgetMin: toOptionalNumber(restaurant.budgetMin) ?? null,
            budgetMax: toOptionalNumber(restaurant.budgetMax) ?? null,
            rangeMeters: null,
            createdAt: new Date().toISOString(),
          };
          return (
            <View key={`${restaurant.id}-history-safe-${index}`} style={styles.historyLookupCard}>
              <View style={styles.historyLookupTopRow}>
                <View style={styles.historyLookupIcon}>
                  <GenreIconVisual genre={entry.genre} />
                </View>
                <View style={styles.historyLookupBody}>
                  <Text style={styles.historyLookupTitle}>{entry.genre ?? 'お店'}の履歴</Text>
                  <Text style={styles.historyLookupMeta} numberOfLines={1}>{buildHistoryMetaLine(entry)}</Text>
                  <Text style={styles.historyLookupId} numberOfLines={1}>{getProviderLabel(provider)}</Text>
                </View>
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}

function HotPepperCredit({ compact = false }: { compact?: boolean }) {
  return (
    <Pressable
      style={[styles.hotpepperCredit, compact && styles.hotpepperCreditCompact]}
      onPress={() => Linking.openURL(HOTPEPPER_CREDIT_URL)}
      accessibilityLabel="ホットペッパーグルメ Webサービス"
    >
      <Image source={{ uri: HOTPEPPER_CREDIT_IMAGE_URL }} style={styles.hotpepperCreditImage} resizeMode="contain" />
    </Pressable>
  );
}

function InfoNotice({ text }: { text: string }) {
  return (
    <View style={styles.notice}>
      <Text style={styles.noticeDot}>●</Text>
      <Text style={styles.noticeText}>{text}</Text>
    </View>
  );
}

function SectionHeader({ title, action }: { title: string; action?: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {!!action && <Text style={styles.sectionAction}>{action}</Text>}
    </View>
  );
}

function PageIntro({ title, lead }: { title: string; lead: string }) {
  return (
    <View style={styles.pageIntro}>
      <Text style={styles.pageTitle}>{title}</Text>
      <Text style={styles.pageLead}>{lead}</Text>
    </View>
  );
}

function ConditionPill({ label, active = false }: { label: string; active?: boolean }) {
  return (
    <View style={[styles.conditionPill, active && styles.conditionPillActive]}>
      <Text style={[styles.conditionPillText, active && styles.conditionPillTextActive]}>{label}</Text>
    </View>
  );
}

function MetaPill({ label }: { label: string }) {
  return (
    <View style={styles.metaPill}>
      <Text style={styles.metaPillText}>{label}</Text>
    </View>
  );
}

function AppFooter({ activeTab, onPress, uiText }: { activeTab: TabKey; onPress: (tab: TabKey) => void; uiText: Record<string, string> }) {
  const labels: Record<TabKey, string> = {
    home: uiText.footerHome,
    search: uiText.footerSearch,
    random: uiText.footerRandom,
    save: uiText.footerSave,
    analytics: uiText.footerAnalytics,
  };
  return (
    <View style={styles.footer}>
      {FOOTER_ITEMS.map((item) => {
        const active = activeTab === item.key;
        return (
          <Pressable key={item.key} style={styles.footerItem} onPress={() => onPress(item.key)}>
            <View style={[styles.footerIconWrap, active && styles.footerIconWrapActive]}>
              {item.key === 'save' ? (
                <FooterAlbumIcon active={active} />
              ) : (
                <Ionicons name={item.icon} size={26} color={active ? '#ffffff' : '#777777'} />
              )}
            </View>
            <Text style={[styles.footerLabel, active && styles.footerLabelActive]}>{labels[item.key]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function FooterAlbumIcon({ active }: { active: boolean }) {
  return (
    <View style={[styles.footerAlbumImageCrop, active ? styles.footerAlbumImageActive : styles.footerAlbumImageInactive]}>
      <Image source={ALBUM_FOOTER_ICON} style={styles.footerAlbumImage} resizeMode="contain" />
    </View>
  );
}

