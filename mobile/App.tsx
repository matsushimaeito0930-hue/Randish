import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  ImageSourcePropType,
  Linking,
  NativeModules,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { randishApi, Restaurant as ApiRestaurant } from './services/randishApi';
import type { RandomHistory as ApiRandomHistory } from './services/randishApi';
import { JAPAN_MUNICIPALITY_PRESETS } from './data/japanMunicipalities';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

type AppStage = 'splash' | 'login' | 'main';
type TabKey = 'home' | 'search' | 'random' | 'save' | 'analytics';
type DrawAnimationKey = 'roulette' | 'lottery' | 'shuffle' | 'radar';
type DrawMode = 'condition' | 'everything';
type ConditionRandomField = 'budget' | 'distance' | 'genre';
type MealSlotKey = 'morning' | 'lunch' | 'dinner' | 'midnight';

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
};

type MealTicketState = {
  tickets: MealTicketView[];
  current: MealTicketView;
  nextUnlockLabel: string;
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
  restaurant: Restaurant;
  createdAt: string;
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

type DistanceOrigin = {
  location: UserLocation | null;
  label: string;
};

type LocationRequestMode = 'sync-search' | 'background';

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
const DEV_LAN_API_BASE_URLS = ['http://10.230.36.45:8080', 'http://10.230.36.34:8080'];
const LOCAL_API_BASE_URLS = ['http://localhost:8080', 'http://127.0.0.1:8080', 'http://10.0.2.2:8080'];
const TETHER_HOST_PATTERN = /^http:\/\/10\.230\.36\.\d+(?::8080)?$/;
const RANDISH_LOGO = require('./assets/randish-logo-square1.png');
const HOTPEPPER_CREDIT_URL = 'https://webservice.recruit.co.jp/';
const HOTPEPPER_CREDIT_IMAGE_URL = 'https://webservice.recruit.co.jp/banner/hotpepper-m.gif';

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
  if (!host) {
    return null;
  }
  return `http://${host}:${API_PORT}`;
};

const getMetroScriptUrl = () => {
  const sourceCode = NativeModules.SourceCode as { scriptURL?: string } | undefined;
  return sourceCode?.scriptURL;
};

const getWebLocationUrl = () => {
  const runtimeGlobal = globalThis as typeof globalThis & { location?: { href?: string } };
  return runtimeGlobal.location?.href;
};

const getRuntimeApiBaseUrl = () =>
  toApiBaseUrlFromHost(getHostFromUrl(getMetroScriptUrl()))
  ?? toApiBaseUrlFromHost(getHostFromUrl(getWebLocationUrl()))
  ?? DEV_LAN_API_BASE_URLS[0];

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

const buildApiBaseUrlCandidates = (primaryBaseUrl: string, runtimeBaseUrl: string) =>
  uniqueApiBaseUrls([primaryBaseUrl, runtimeBaseUrl, ...DEV_LAN_API_BASE_URLS, ...LOCAL_API_BASE_URLS]);

const toAbsoluteApiAssetUrl = (value?: string | null) => {
  if (!value || !value.startsWith('/')) {
    return value ?? null;
  }
  const baseUrl = normalizeApiBaseUrl(randishApi.getLastSuccessfulBaseUrl() ?? getRuntimeApiBaseUrl());
  return `${baseUrl}${value}`;
};

const isDevFallbackApiBaseUrl = (baseUrl: string) =>
  DEV_LAN_API_BASE_URLS.includes(baseUrl) || TETHER_HOST_PATTERN.test(baseUrl);

const shouldReplaceWithRuntimeApiBaseUrl = (currentBaseUrl: string, runtimeBaseUrl: string) => {
  const current = normalizeApiBaseUrl(currentBaseUrl);
  const runtime = normalizeApiBaseUrl(runtimeBaseUrl);
  return !current || (current !== runtime && isDevFallbackApiBaseUrl(current));
};

const ORANGE = '#f05a28';
const INK = '#171411';
const PAPER = '#ffffff';
const CARD = '#ffffff';
const LINE = '#ebe2d4';

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
const IS_PRO_USER = false;

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
    accent: '#5d5be8',
    genreHints: ['バー', '締めラーメン', '深夜カフェ'],
    proOnly: true,
  },
];

const PREFECTURE_IMAGES: Record<string, ImageSourcePropType> = {
  北海道: require('./assets/prefecture-clean/hokkaido.png'),
  青森県: require('./assets/prefecture-clean/aomori.png'),
  岩手県: require('./assets/prefecture-clean/iwate.png'),
  宮城県: require('./assets/prefecture-clean/miyagi.png'),
  秋田県: require('./assets/prefecture-clean/akita.png'),
  山形県: require('./assets/prefecture-clean/yamagata.png'),
  福島県: require('./assets/prefecture-clean/fukushima.png'),
  茨城県: require('./assets/prefecture-clean/ibaraki.png'),
  栃木県: require('./assets/prefecture-clean/tochigi.png'),
  群馬県: require('./assets/prefecture-clean/gunma.png'),
  埼玉県: require('./assets/prefecture-clean/saitama.png'),
  千葉県: require('./assets/prefecture-clean/chiba.png'),
  東京都: require('./assets/prefecture-clean/tokyo.png'),
  神奈川県: require('./assets/prefecture-clean/kanagawa.png'),
  新潟県: require('./assets/prefecture-clean/niigata.png'),
  富山県: require('./assets/prefecture-clean/toyama.png'),
  石川県: require('./assets/prefecture-clean/ishikawa.png'),
  福井県: require('./assets/prefecture-clean/fukui.png'),
  山梨県: require('./assets/prefecture-clean/yamanashi.png'),
  長野県: require('./assets/prefecture-clean/nagano.png'),
  岐阜県: require('./assets/prefecture-clean/gifu.png'),
  静岡県: require('./assets/prefecture-clean/shizuoka.png'),
  愛知県: require('./assets/prefecture-clean/aichi.png'),
  三重県: require('./assets/prefecture-clean/mie.png'),
  滋賀県: require('./assets/prefecture-clean/shiga.png'),
  京都府: require('./assets/prefecture-clean/kyoto.png'),
  大阪府: require('./assets/prefecture-clean/osaka.png'),
  兵庫県: require('./assets/prefecture-clean/hyogo.png'),
  奈良県: require('./assets/prefecture-clean/nara.png'),
  和歌山県: require('./assets/prefecture-clean/wakayama.png'),
  鳥取県: require('./assets/prefecture-clean/tottori.png'),
  島根県: require('./assets/prefecture-clean/shimane.png'),
  岡山県: require('./assets/prefecture-clean/okayama.png'),
  広島県: require('./assets/prefecture-clean/hiroshima.png'),
  山口県: require('./assets/prefecture-clean/yamaguchi.png'),
  徳島県: require('./assets/prefecture-clean/tokushima.png'),
  香川県: require('./assets/prefecture-clean/kagawa.png'),
  愛媛県: require('./assets/prefecture-clean/ehime.png'),
  高知県: require('./assets/prefecture-clean/kochi.png'),
  福岡県: require('./assets/prefecture-clean/fukuoka.png'),
  佐賀県: require('./assets/prefecture-clean/saga.png'),
  長崎県: require('./assets/prefecture-clean/nagasaki.png'),
  熊本県: require('./assets/prefecture-clean/kumamoto.png'),
  大分県: require('./assets/prefecture-clean/oita.png'),
  宮崎県: require('./assets/prefecture-clean/miyazaki.png'),
  鹿児島県: require('./assets/prefecture-clean/kagoshima.png'),
  沖縄県: require('./assets/prefecture-clean/okinawa.png'),
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
  { key: 'save', label: '保存', icon: 'bookmark-outline' },
  { key: 'analytics', label: '分析', icon: 'bar-chart-outline' },
];

const GENRES: GenreItem[] = [
  { label: 'すべて', color: '#111111', image: require('./assets/category/world.png') },
  { label: 'ラーメン', color: '#d94b42', image: require('./assets/category/chuka.png') },
  { label: '焼肉', color: '#d84527', image: require('./assets/category/yakiniku.png') },
  { label: '居酒屋', color: '#db8b00', image: require('./assets/category/izakaya.png') },
  { label: '韓国料理', color: '#f37768', image: require('./assets/category/korean.png') },
  { label: 'カレー', color: '#e5a100', image: require('./assets/category/curry.png') },
  { label: 'うどん', color: '#9a6a43', image: require('./assets/category/udon.png') },
  { label: 'そば', color: '#5d7f32', image: require('./assets/category/soba.png') },
  { label: 'たこ焼き', color: '#e2a11a', image: require('./assets/category/takoyaki.png') },
  { label: 'お好み焼き', color: '#e17400', image: require('./assets/category/okonomiyaki.png') },
  { label: '焼き鳥', color: '#8d5a35', image: require('./assets/category/yakitori.png') },
  { label: 'ピザ', color: '#df482f', image: require('./assets/category/pizza.png') },
  { label: 'ハンバーガー', color: '#dfa300', image: require('./assets/category/hamburger.png') },
  { label: '定食', color: '#2f70b3', image: require('./assets/category/teishoku.png') },
  { label: '串カツ', color: '#a560a5', image: require('./assets/category/kushikatsu.png') },
  { label: '餃子', color: '#5f8f45', image: require('./assets/category/gyoza-new.jpg') },
  { label: '和食', color: '#de5b3d', image: require('./assets/category/washoku.png') },
  { label: '洋食', color: '#f28c18', image: require('./assets/category/yoshoku.png') },
  { label: 'イタリアン', color: '#6b9144', image: require('./assets/category/italian.png') },
  { label: '中華', color: '#d94b42', image: require('./assets/category/chuka.png') },
  { label: '寿司', color: '#a06f47', image: require('./assets/category/sushi.png') },
  { label: '海鮮', color: '#3f6bad', image: require('./assets/category/seafood.png') },
  { label: '肉料理', color: '#895f43', image: require('./assets/category/meat.png') },
  { label: 'サラダ・野菜', color: '#6a984c', image: require('./assets/category/salad.png') },
  { label: 'スープ', color: '#e4aa19', image: require('./assets/category/soup.png') },
  { label: 'スイーツ', color: '#a465a4', image: require('./assets/category/sweets.png') },
  { label: 'カフェ', color: '#469fa0', image: require('./assets/category/cafe.png') },
  { label: 'パン', color: '#cf6688', image: require('./assets/category/bread.png') },
  { label: 'ファストフード', color: '#e2a61e', image: require('./assets/category/fastfood.png') },
  { label: 'お酒・バー', color: '#426cac', image: require('./assets/category/bar.png') },
  { label: '各国料理', color: '#a98652', image: require('./assets/category/world.png') },
];

const getGenreVisual = (genre?: string | null) =>
  GENRES.find((item) => item.label === genre) ?? GENRES[0];

const pickRandomDifferent = <T,>(items: T[], current: T) => {
  if (items.length <= 1) {
    return items[0];
  }
  const nextItems = items.filter((item) => item !== current);
  return nextItems[Math.floor(Math.random() * nextItems.length)];
};

const pickRandomBudgetValue = (currentMax: string) => pickRandomDifferent(BUDGET_MAX_OPTIONS, currentMax);

const formatBudgetLimit = (budgetMax: string) => {
  const value = Number(budgetMax || 0);
  return value > 0 ? `${value.toLocaleString()}円以内` : '予算なし';
};

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

const buildMealTicketState = (now: Date, drawHistories: DrawHistoryEntry[], isProUser: boolean): MealTicketState => {
  const dayKey = getLocalDayKey(now);
  const minutes = getMinutesOfDay(now);
  const currentDefinition = getMealTicketDefinitionForDate(now);
  const nextUnlockDate = getNextTicketStartDate(now, isProUser);
  const nextUnlockLabel = formatCountdown(nextUnlockDate, now);

  const usedKeys = new Set<MealSlotKey>();
  drawHistories.forEach((entry) => {
    const createdAt = new Date(entry.createdAt);
    if (Number.isNaN(createdAt.getTime()) || getLocalDayKey(createdAt) !== dayKey) {
      return;
    }
    usedKeys.add(getMealTicketDefinitionForDate(createdAt).key);
  });

  const tickets = MEAL_TICKET_DEFINITIONS.map((ticket) => {
    const active = currentDefinition.key === ticket.key;
    const used = usedKeys.has(ticket.key);
    const proLocked = Boolean(ticket.proOnly && !isProUser);
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
    };
  });

  const current = tickets.find((ticket) => ticket.active) ?? tickets[0];
  const usedFreeCount = tickets.filter((ticket) => !ticket.proOnly && ticket.used).length;

  return {
    tickets,
    current,
    nextUnlockLabel,
    usedFreeCount,
    totalFreeCount: FREE_MEAL_TICKET_COUNT,
    isProUser,
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

const formatPrice = (restaurant: ApiRestaurant) =>
  `${restaurant.budgetMin?.toLocaleString() ?? '?'}円〜${restaurant.budgetMax?.toLocaleString() ?? '?'}円`;

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

const toDrawHistoryEntry = (history: ApiRandomHistory): DrawHistoryEntry => ({
  id: history.id,
  restaurant: normalizeRestaurant(history.restaurant),
  createdAt: history.createdAt,
});

const isSameMonth = (dateText: string, monthDate: Date) => {
  const date = new Date(dateText);
  return !Number.isNaN(date.getTime())
    && date.getFullYear() === monthDate.getFullYear()
    && date.getMonth() === monthDate.getMonth();
};

const formatShortDate = (dateText: string) => {
  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return `${date.getMonth() + 1}/${date.getDate()}`;
};

const getRatingValue = (restaurant: Restaurant) => {
  const rating = toOptionalNumber(restaurant.googleRating) ?? toOptionalNumber(restaurant.rating);
  return rating != null && rating > 0 ? rating : null;
};

const getRatingLabel = (restaurant: Restaurant) => {
  const rating = getRatingValue(restaurant);
  return rating == null ? '評価取得中' : `★ ${rating.toFixed(1)}`;
};

const getStoredMinutesLabel = (restaurant: Restaurant) =>
  restaurant.minutes && restaurant.minutes > 0 ? `${restaurant.minutes}分` : '地図で確認';

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

const getDistanceLabel = (from: UserLocation | null, restaurant: Restaurant) => {
  const km = getDistanceKm(from, restaurant);
  if (km != null) {
    return km < 1 ? `約${Math.round(km * 1000)}m` : `約${km.toFixed(1)}km`;
  }
  return restaurant.minutes && restaurant.minutes > 0 ? `徒歩約${restaurant.minutes}分` : '地図で確認';
};

const getWalkingMinutesLabel = (from: UserLocation | null, restaurant: Restaurant) => {
  const km = getDistanceKm(from, restaurant);
  if (km != null) {
    return `${Math.max(1, Math.round(km * 12.5))}分`;
  }
  return restaurant.minutes && restaurant.minutes > 0 ? `${restaurant.minutes}分` : '地図で確認';
};

const getPresetPrefecture = (preset: AreaPreset) => preset.group.split('/')[0].trim();

const getAreaPresetValue = (preset: AreaPreset) => preset.value ?? preset.label;

const getAreaPresetSearchValue = (preset: AreaPreset) =>
  preset.searchValue ?? `${preset.group.replace(/\s*\/\s*/g, ' ')} ${preset.label}`.trim();

const getAreaPresetSearchText = (preset: AreaPreset) =>
  `${preset.group} ${preset.label} ${preset.value ?? ''} ${preset.searchValue ?? ''}`.toLowerCase();

const getAreaPresetKey = (preset: AreaPreset) => `${preset.group}-${getAreaPresetValue(preset)}`;

const formatAreaPresetStatus = (preset: AreaPreset) => `${preset.group} 周辺から探します`;

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
  ...JAPAN_MUNICIPALITY_PRESETS,
  ...SUPPLEMENTAL_AREA_PRESETS,
]);

const getPrefectureFromText = (value?: string | null) => {
  if (!value) {
    return undefined;
  }
  return PREFECTURE_REGIONS.find((item) => value.includes(item.prefecture))?.prefecture;
};

const isPrefectureName = (value: string) => PREFECTURE_REGIONS.some((item) => item.prefecture === value);

const getPrefectureRegion = (prefecture?: string | null) =>
  PREFECTURE_REGIONS.find((item) => item.prefecture === prefecture)?.region;

const getRegionGroupForPrefecture = (prefecture?: string | null) =>
  AREA_REGION_GROUPS.find((group) => group.prefectures.includes(prefecture ?? ''))?.label;

const formatLocationStatus = (prefecture: string | undefined, areaLabel: string) => {
  const region = getPrefectureRegion(prefecture);
  if (prefecture && region) {
    return `${prefecture} / ${region} / ${areaLabel} 周辺から探します`;
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

const isStationLikePreset = (preset: AreaPreset) => hasUsablePresetCoordinates(preset) && !NON_STATION_AREA_LABELS.has(preset.label);

const formatStationOriginLabel = (label: string) => `${label}${label.endsWith('駅') ? '' : '駅'}から`;

const getNearestStationOrigin = (restaurant: Restaurant): DistanceOrigin | null => {
  if (restaurant.latitude == null || restaurant.longitude == null) {
    return null;
  }

  const prefecture = getPrefectureFromText(`${restaurant.area} ${restaurant.address}`);
  const candidates = AREA_PRESETS
    .filter(isStationLikePreset)
    .filter((preset) => !prefecture || getPresetPrefecture(preset) === prefecture);

  const nearest = candidates
    .map((preset) => ({
      preset,
      distance: getDistanceKm(
        { latitude: preset.latitude, longitude: preset.longitude, label: preset.label },
        restaurant,
      ) ?? Number.POSITIVE_INFINITY,
    }))
    .sort((a, b) => a.distance - b.distance)[0];

  if (!nearest || !Number.isFinite(nearest.distance)) {
    return null;
  }

  return {
    label: formatStationOriginLabel(nearest.preset.label),
    location: {
      latitude: nearest.preset.latitude,
      longitude: nearest.preset.longitude,
      label: nearest.preset.label,
    },
  };
};

const getCoordinatePresetForArea = (area: string) => {
  const cleanArea = area.trim();
  if (!cleanArea || cleanArea === '現在地') {
    return null;
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
  const prefecture = isPrefectureName(cleanArea)
    ? cleanArea
    : selectedPreset
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
  const prefectureAnchor = ALL_AREA_PRESETS.find((preset) => getPresetPrefecture(preset) === prefecture && hasUsablePresetCoordinates(preset));
  const preset = sameAreaPreset ?? prefectureAnchor;
  if (!preset) {
    return null;
  }

  return { preset, label: isPrefectureName(cleanArea) ? `${cleanArea}中心` : cleanArea };
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
  const genre = selectedGenre.trim();
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
  const [budgetMax, setBudgetMax] = useState('3000');
  const [distance, setDistance] = useState('1.5km');
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);
  const [randomHistory, setRandomHistory] = useState<Restaurant[]>([]);
  const [drawHistories, setDrawHistories] = useState<DrawHistoryEntry[]>([]);
  const [savedRestaurants, setSavedRestaurants] = useState<Restaurant[]>([]);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [locationStatus, setLocationStatus] = useState('現在地を確認できます');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('条件を選んで、今日の一店を決めましょう。');
  const [drawAnimationKey, setDrawAnimationKey] = useState<DrawAnimationKey>('roulette');
  const [drawMode, setDrawMode] = useState<DrawMode>('condition');
  const [conditionRandom, setConditionRandom] = useState<ConditionRandomState>({
    budget: false,
    distance: false,
    genre: false,
  });
  const [now, setNow] = useState(() => new Date());

  const logoScale = useRef(new Animated.Value(0.88)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const spinValue = useRef(new Animated.Value(0)).current;
  const resultRevealValue = useRef(new Animated.Value(0)).current;
  const scrollViewRef = useRef<ScrollView | null>(null);
  const didAskLocation = useRef(false);
  const areaRef = useRef(area);

  const scrollToContentTop = useCallback((animated = true) => {
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({ y: 0, animated });
    }, 0);
  }, []);

  useEffect(() => {
    areaRef.current = area;
  }, [area]);

  useEffect(() => {
    setApiBaseUrl((current) => shouldReplaceWithRuntimeApiBaseUrl(current, runtimeApiBaseUrl) ? runtimeApiBaseUrl : current);
  }, [runtimeApiBaseUrl]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const mealTicketState = useMemo(
    () => buildMealTicketState(now, drawHistories, IS_PRO_USER),
    [drawHistories, now],
  );

  const apiBaseUrlCandidates = useMemo(
    () => buildApiBaseUrlCandidates(apiBaseUrl, runtimeApiBaseUrl),
    [apiBaseUrl, runtimeApiBaseUrl],
  );

  const syncWorkingApiBaseUrl = useCallback(() => {
    const workingBaseUrl = randishApi.getLastSuccessfulBaseUrl();
    if (workingBaseUrl) {
      setApiBaseUrl((current) => current === workingBaseUrl ? current : workingBaseUrl);
    }
  }, []);

  const loadDrawHistories = useCallback(async () => {
    try {
      const data = await randishApi.getRandomHistories(apiBaseUrlCandidates, userId);
      syncWorkingApiBaseUrl();
      const entries = data
        .map(toDrawHistoryEntry)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      const recentRestaurants: Restaurant[] = [];
      const seenRestaurantIds = new Set<string>();
      entries.forEach((entry) => {
        if (seenRestaurantIds.has(entry.restaurant.id)) {
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

  const recordDrawForAnalytics = useCallback((restaurant: Restaurant) => {
    const createdAt = new Date().toISOString();
    setDrawHistories((current) => [
      { id: `local-${createdAt}-${restaurant.id}`, restaurant, createdAt },
      ...current,
    ].slice(0, 100));
  }, []);

  useEffect(() => {
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

    const timer = setTimeout(() => setStage('login'), 900);
    return () => clearTimeout(timer);
  }, [logoOpacity, logoScale]);

  const apiParams = useMemo(
    () => {
      const selectedPreset = getAreaPreset(area);
      const usePresetCoordinates = selectedPreset != null && selectedPreset.label !== '現在地' && selectedPreset.useCoordinates !== false;
      const useCurrentLocationCoordinates = (!selectedPreset || selectedPreset.label === '現在地') && (!area.trim() || area === '現在地');
      const coordinateSource =
        usePresetCoordinates
          ? { latitude: selectedPreset.latitude, longitude: selectedPreset.longitude }
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
      };
    },
    [area, budgetMax, budgetMin, distance, genre, userLocation],
  );

  const distanceOrigin = useMemo<DistanceOrigin>(() => {
    const coordinatePreset = getCoordinatePresetForArea(area);
    if (coordinatePreset) {
      return {
        label: `${coordinatePreset.label}から`,
        location: {
          latitude: coordinatePreset.preset.latitude,
          longitude: coordinatePreset.preset.longitude,
          label: coordinatePreset.label,
        },
      };
    }

    if (area.trim() && area !== '現在地') {
      return {
        label: `${area}から`,
        location: null,
      };
    }

    return {
      label: '現在地から',
      location: userLocation,
    };
  }, [area, userLocation]);

  const visibleRestaurants = restaurants;

  const loadGenreDiagnosticMessage = useCallback(async () => {
    const cleanGenre = genre.trim();
    if (!cleanGenre || cleanGenre === 'すべて') {
      return null;
    }

    try {
      const genrelessParams = { ...apiParams, genre: undefined };
      const data = await randishApi.getRestaurants(apiBaseUrlCandidates, genrelessParams);
      syncWorkingApiBaseUrl();
      return buildGenreDiagnosticMessage(cleanGenre, data.map(normalizeRestaurant), area);
    } catch {
      return null;
    }
  }, [apiBaseUrlCandidates, apiParams, area, genre, syncWorkingApiBaseUrl]);

  const loadRestaurants = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await randishApi.getRestaurants(apiBaseUrlCandidates, apiParams);
      syncWorkingApiBaseUrl();
      const normalized = data.map(normalizeRestaurant).filter((restaurant) => restaurantMatchesSelectedGenre(restaurant, genre));
      setRestaurants(normalized);
      const genreLabel = genre === 'すべて' ? 'すべてのジャンル' : genre;
      if (normalized.length) {
        const apiGenres = buildGenreSummaryItems(normalized).join(' / ');
        setMessage(`${genreLabel}で${normalized.length}件から候補を整えました。APIジャンル: ${apiGenres}`);
      } else {
        const diagnosticMessage = await loadGenreDiagnosticMessage();
        setMessage(diagnosticMessage ?? `${genreLabel}に合うお店が見つかりませんでした。エリアやジャンルを変えてみてください。`);
      }
    } catch (error) {
      setRestaurants([]);
      const reason = error instanceof Error ? error.message : '通信エラー';
      const diagnosticMessage = await loadGenreDiagnosticMessage();
      setMessage(diagnosticMessage ?? `APIに接続できませんでした。接続先: ${apiBaseUrlCandidates.join(' / ')} / ${reason}`);
    } finally {
      setIsLoading(false);
    }
  }, [apiBaseUrlCandidates, apiParams, genre, loadGenreDiagnosticMessage, syncWorkingApiBaseUrl]);

  useEffect(() => {
    loadRestaurants();
  }, [loadRestaurants]);

  const requestCurrentLocation = useCallback(async (mode: LocationRequestMode = 'sync-search') => {
    const Location = getOptionalLocationModule();
    if (!Location) {
      if (mode === 'sync-search' || areaRef.current === '現在地') {
        setLocationStatus('現在地取得には expo-location が必要です');
      }
      return;
    }

    try {
      if (mode === 'sync-search' || areaRef.current === '現在地') {
        setLocationStatus('現在地を取得中...');
      }
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        if (mode === 'sync-search' || areaRef.current === '現在地') {
          setLocationStatus('位置情報の許可がオフです');
        }
        return;
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

      setUserLocation({ ...coords, label });
      if (mode === 'sync-search') {
        setArea(label);
        setLocationStatus(formatLocationStatus(prefecture, label));
      } else if (areaRef.current === '現在地') {
        setArea(label);
        setLocationStatus(formatLocationStatus(prefecture, label));
      }
    } catch {
      if (mode === 'sync-search' || areaRef.current === '現在地') {
        setLocationStatus('現在地を取得できませんでした');
      }
    }
  }, []);

  useEffect(() => {
    if (stage !== 'main' || didAskLocation.current) {
      return;
    }
    didAskLocation.current = true;
    requestCurrentLocation('background');
  }, [requestCurrentLocation, stage]);

  useEffect(() => {
    if (stage !== 'main') {
      return;
    }
    loadDrawHistories();
  }, [loadDrawHistories, stage]);

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
    setSelectedRestaurant(null);
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

  const chooseRandomRestaurant = useCallback(async () => {
    setActiveTab('random');
    scrollToContentTop();
    setIsLoading(true);
    const drawAnimation = startDrawAnimation();
    const recentIds = new Set([selectedRestaurant?.id, ...randomHistory.map((item) => item.id)].filter((id): id is string => Boolean(id)));
    let alternativesCache: Restaurant[] | null = null;
    const loadAlternatives = async () => {
      if (alternativesCache) {
        return alternativesCache;
      }
      alternativesCache = (await randishApi.getRestaurants(apiBaseUrlCandidates, apiParams))
        .map(normalizeRestaurant)
        .filter((restaurant) => restaurantMatchesSelectedGenre(restaurant, genre));
      return alternativesCache;
    };

    try {
      const data = await randishApi.chooseRandom(apiBaseUrlCandidates, {
        userId,
        ...apiParams,
      });
      syncWorkingApiBaseUrl();
      let normalized = normalizeRestaurant(data);
      if (!restaurantMatchesSelectedGenre(normalized, genre)) {
        const alternatives = await loadAlternatives();
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
      setMessage(recentIds.has(normalized.id) ? '候補が一巡しています。条件を広げると新しい店が出やすくなります。' : drawAnimation.doneMessage);
      setTimeout(revealSelectedRestaurant, 980);
    } catch (error) {
      setSelectedRestaurant(null);
      const reason = error instanceof Error ? error.message : '通信エラー';
      const diagnosticMessage = await loadGenreDiagnosticMessage();
      setMessage(diagnosticMessage ?? `APIから抽選できませんでした。接続先: ${apiBaseUrlCandidates.join(' / ')} / ${reason}`);
    } finally {
      setIsLoading(false);
    }
  }, [apiBaseUrlCandidates, apiParams, genre, loadGenreDiagnosticMessage, randomHistory, recordDrawForAnalytics, revealSelectedRestaurant, scrollToContentTop, selectedRestaurant, startDrawAnimation, syncWorkingApiBaseUrl, userId]);

  const chooseEverythingRandom = useCallback(async () => {
    setActiveTab('random');
    scrollToContentTop();
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
    } catch (error) {
      setSelectedRestaurant(null);
      const reason = error instanceof Error ? error.message : '通信エラー';
      setMessage(`全部ランダム抽選に失敗しました。接続先: ${apiBaseUrlCandidates.join(' / ')} / ${reason}`);
    } finally {
      setIsLoading(false);
    }
  }, [apiBaseUrlCandidates, randomHistory, recordDrawForAnalytics, revealSelectedRestaurant, scrollToContentTop, selectedRestaurant, startDrawAnimation, syncWorkingApiBaseUrl, userId]);

  const startPreparedDraw = useCallback(() => {
    if (isLoading) {
      return;
    }
    const currentTicket = mealTicketState.current;
    if (!currentTicket.available) {
      if (currentTicket.proOnly && !mealTicketState.isProUser) {
        setMessage(`深夜の食券はPro限定です。${mealTicketState.nextUnlockLabel}で朝の一枚が開きます。`);
      } else if (currentTicket.used) {
        setMessage(`${currentTicket.label}の食券は使用済みです。${mealTicketState.nextUnlockLabel}で次の一枚が開きます。`);
      } else {
        setMessage(`${currentTicket.label}の食券は${currentTicket.timeLabel}です。${currentTicket.countdownLabel}で使えます。`);
      }
      scrollToContentTop();
      return;
    }
    if (drawMode === 'everything') {
      chooseEverythingRandom();
      return;
    }
    chooseRandomRestaurant();
  }, [chooseEverythingRandom, chooseRandomRestaurant, drawMode, isLoading, mealTicketState, scrollToContentTop]);

  const saveSelectedRestaurant = useCallback(async () => {
    if (!selectedRestaurant) {
      setMessage('先に一店を抽選してください。');
      return;
    }

    setSavedRestaurants((current) => {
      if (current.some((item) => item.id === selectedRestaurant.id)) {
        return current;
      }
      return [selectedRestaurant, ...current];
    });

    try {
      await randishApi.addFavorite(apiBaseUrlCandidates, userId, selectedRestaurant.id);
      syncWorkingApiBaseUrl();
      setMessage('保存しました。');
    } catch {
      setMessage('端末内に保存しました。API接続後はサーバー保存もできます。');
    }
  }, [apiBaseUrlCandidates, selectedRestaurant, syncWorkingApiBaseUrl, userId]);

  const openMap = useCallback(() => {
    if (!selectedRestaurant) return;
    if (selectedRestaurant.googleMapsUri) {
      Linking.openURL(selectedRestaurant.googleMapsUri);
      return;
    }
    const query = encodeURIComponent(`${selectedRestaurant.name} ${selectedRestaurant.address}`);
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`);
  }, [selectedRestaurant]);

  const updateGenre = (value: string) => {
    setGenre(value);
    setDrawMode('condition');
    setConditionRandom((current) => ({ ...current, genre: false }));
    setSelectedRestaurant(null);
  };

  const updateArea = (value: string) => {
    const preset = getAreaPreset(value);
    if (value === '現在地') {
      setLocationStatus(userLocation ? `${userLocation.label} 周辺から探します` : '現在地を確認できます');
    } else if (preset?.useCoordinates === false) {
      setLocationStatus(formatAreaPresetStatus(preset));
    } else if (preset) {
      setLocationStatus(formatAreaPresetStatus(preset));
    } else if (isPrefectureName(value)) {
      setLocationStatus(formatLocationStatus(value, '全域'));
    }
    setArea(value);
    setDrawMode('condition');
    setSelectedRestaurant(null);
  };

  const updateBudgetMin = (value: string) => {
    setBudgetMin(value);
    setDrawMode('condition');
    setConditionRandom((current) => ({ ...current, budget: false }));
    setSelectedRestaurant(null);
  };

  const updateBudgetMax = (value: string) => {
    setBudgetMin('0');
    setBudgetMax(value);
    setDrawMode('condition');
    setConditionRandom((current) => ({ ...current, budget: false }));
    setSelectedRestaurant(null);
  };

  const updateDistance = (value: string) => {
    setDistance(value);
    setDrawMode('condition');
    setConditionRandom((current) => ({ ...current, distance: false }));
    setSelectedRestaurant(null);
  };

  const markConditionRandom = useCallback((field: ConditionRandomField) => {
    setDrawMode('condition');
    setConditionRandom((current) => ({ ...current, [field]: !current[field] }));
    setSelectedRestaurant(null);
  }, []);

  const openRandomTab = useCallback(() => {
    setDrawMode('condition');
    setActiveTab('random');
    setMessage('抽選カードを押すとスタートします。');
    scrollToContentTop();
  }, [scrollToContentTop]);

  const handleFooterPress = useCallback((tab: TabKey) => {
    if (tab === 'random') {
      openRandomTab();
      return;
    }
    setActiveTab(tab);
    scrollToContentTop(false);
  }, [openRandomTab, scrollToContentTop]);

  const enterMain = useCallback((nextUserId = APP_USER_ID) => {
    setUserId(nextUserId);
    setStage('main');
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
        onApiConnected={syncWorkingApiBaseUrl}
        onStart={enterMain}
      />
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="dark-content" />
      {activeTab !== 'home' && <AppHeader area={area} locationStatus={locationStatus} onLocationPress={requestCurrentLocation} />}
      <ScrollView ref={scrollViewRef} style={styles.content} contentContainerStyle={styles.contentInner} showsVerticalScrollIndicator={false}>
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
            isLoading={isLoading}
            mealTicketState={mealTicketState}
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
            onLocationPress={requestCurrentLocation}
          />
        )}
        {activeTab === 'search' && (
          <SearchTab
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
            onSearch={loadRestaurants}
            onRandomPress={prepareConditionDraw}
            onAllRandomPress={prepareEverythingDraw}
          />
        )}
        {activeTab === 'random' && (
          <RandomTab
            area={area}
            genre={genre}
            budgetMin={budgetMin}
            budgetMax={budgetMax}
            distance={distance}
            message={message}
            isLoading={isLoading}
            selectedRestaurant={selectedRestaurant}
            distanceOrigin={distanceOrigin}
            userLocation={userLocation}
            history={randomHistory}
            conditionRandom={conditionRandom}
            drawAnimationKey={drawAnimationKey}
            drawMode={drawMode}
            mealTicketState={mealTicketState}
            spinValue={spinValue}
            resultRevealValue={resultRevealValue}
            onRandomPress={startPreparedDraw}
            onSavePress={saveSelectedRestaurant}
            onGoPress={openMap}
          />
        )}
        {activeTab === 'save' && <SaveTab savedRestaurants={savedRestaurants} history={randomHistory} />}
        {activeTab === 'analytics' && (
          <AnalyticsTab
            area={area}
            locationStatus={locationStatus}
            restaurants={visibleRestaurants}
            history={randomHistory}
            drawHistories={drawHistories}
            savedRestaurants={savedRestaurants}
            onAreaPress={() => setActiveTab('home')}
          />
        )}
      </ScrollView>
      <AppFooter activeTab={activeTab} onPress={handleFooterPress} />
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

function LoginScreen({
  apiBaseUrlCandidates,
  onApiConnected,
  onStart,
}: {
  apiBaseUrlCandidates: string[];
  onApiConnected: () => void;
  onStart: (userId?: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [authNotice, setAuthNotice] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleRegister = async () => {
    if (isSubmitting) {
      return;
    }
    if (!acceptedTerms) {
      setAuthNotice('利用規約とプライバシーポリシーへの同意が必要です。');
      return;
    }
    if (!email.trim() || !displayName.trim()) {
      setAuthNotice('メールアドレスとニックネームを入力してください。');
      return;
    }
    if (password.length < 8) {
      setAuthNotice('パスワードは8文字以上で入力してください。');
      return;
    }
    if (password !== passwordConfirm) {
      setAuthNotice('確認用パスワードが一致していません。');
      return;
    }

    setIsSubmitting(true);
    setAuthNotice('');
    try {
      const auth = await randishApi.registerUser(apiBaseUrlCandidates, {
        email,
        password,
        displayName,
      });
      randishApi.setAuthToken(auth.accessToken);
      onApiConnected();
      if (!auth.accessToken && auth.user.authProvider === 'SUPABASE') {
        setAuthNotice('登録しました。メール確認が有効な場合は、確認後にこの画面でログインしてください。');
        return;
      }
      onStart(auth.user.id);
    } catch (error) {
      const reason = error instanceof Error ? error.message : '登録に失敗しました。';
      setAuthNotice(`登録できませんでした。${reason}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogin = async () => {
    if (isSubmitting) {
      return;
    }
    if (!email.trim() || !password) {
      setAuthNotice('メールアドレスとパスワードを入力してください。');
      return;
    }

    setIsSubmitting(true);
    setAuthNotice('');
    try {
      const auth = await randishApi.login(apiBaseUrlCandidates, { email, password });
      randishApi.setAuthToken(auth.accessToken);
      onApiConnected();
      onStart(auth.user.id);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'ログインに失敗しました。';
      setAuthNotice(`ログインできませんでした。${reason}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSocialPress = (provider: string) => {
    setAuthNotice(`${provider}ログインは認証設定を追加すると有効化できます。今はUIだけ用意しています。`);
  };

  return (
    <SafeAreaView style={styles.registerSafe}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.registerContainer} showsVerticalScrollIndicator={false}>
        <View style={styles.registerHeader}>
          <Text style={styles.registerLogo}>RANDISH</Text>
          <Text style={styles.registerSub}>京都府 / 近畿地方 / 全域 周辺から探します</Text>
        </View>

        <Text style={styles.registerTitle}>会員登録</Text>
        <Text style={styles.registerDesc}>アカウントを作成して、RANDISHをもっと便利に使いましょう。</Text>

        <View style={styles.registerCard}>
          <RegisterLabel text="メールアドレス" />
          <TextInput
            style={styles.registerInput}
            placeholder="例）randish@example.com"
            placeholderTextColor="#aaa"
            keyboardType="email-address"
            autoCapitalize="none"
            textContentType="emailAddress"
            value={email}
            onChangeText={setEmail}
          />

          <RegisterLabel text="パスワード" />
          <TextInput
            style={styles.registerInput}
            placeholder="8文字以上の半角英数字"
            placeholderTextColor="#aaa"
            secureTextEntry
            textContentType="newPassword"
            value={password}
            onChangeText={setPassword}
          />

          <RegisterLabel text="パスワード（確認）" />
          <TextInput
            style={styles.registerInput}
            placeholder="もう一度入力してください"
            placeholderTextColor="#aaa"
            secureTextEntry
            textContentType="newPassword"
            value={passwordConfirm}
            onChangeText={setPasswordConfirm}
          />

          <RegisterLabel text="ニックネーム" />
          <TextInput
            style={styles.registerInput}
            placeholder="例）ランディッシュ太郎"
            placeholderTextColor="#aaa"
            value={displayName}
            onChangeText={setDisplayName}
          />

          <Pressable style={styles.registerCheckRow} onPress={() => setAcceptedTerms((value) => !value)}>
            <View style={[styles.registerCheckbox, acceptedTerms && styles.registerCheckboxActive]}>
              {acceptedTerms && <Ionicons name="checkmark" size={16} color="#ffffff" />}
            </View>
            <Text style={styles.registerTerms}>
              <Text style={styles.registerLink}>利用規約</Text> と <Text style={styles.registerLink}>プライバシーポリシー</Text> に同意します
            </Text>
          </Pressable>

          {!!authNotice && <Text style={styles.registerNotice}>{authNotice}</Text>}

          <Pressable
            style={[styles.registerMainButton, isSubmitting && styles.registerButtonDisabled]}
            onPress={handleRegister}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.registerMainButtonText}>登録する</Text>
            )}
          </Pressable>

          <Pressable style={styles.registerGuestButton} onPress={() => onStart()}>
            <Ionicons name="person-outline" size={18} color="#ef552e" />
            <Text style={styles.registerGuestButtonText}>ゲストではじめる</Text>
          </Pressable>
          <Text style={styles.registerGuestNote}>登録なしでRANDISHを試せます</Text>
        </View>

        <Text style={styles.registerOr}>または</Text>

        <RegisterSocialButton text="Googleで登録" onPress={() => handleSocialPress('Google')} />
        <RegisterSocialButton text="Appleで登録" onPress={() => handleSocialPress('Apple')} />
        <RegisterSocialButton text="LINEで登録" onPress={() => handleSocialPress('LINE')} />

        <Pressable style={styles.registerLoginBox} onPress={handleLogin}>
          <Text style={styles.registerLoginText}>すでにアカウントをお持ちですか？</Text>
          <Text style={styles.registerLoginLink}>ログイン</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function RegisterLabel({ text }: { text: string }) {
  return (
    <View style={styles.registerLabelRow}>
      <Text style={styles.registerLabel}>{text}</Text>
      <Text style={styles.registerRequired}>必須</Text>
    </View>
  );
}

function RegisterSocialButton({ text, onPress }: { text: string; onPress: () => void }) {
  return (
    <Pressable style={styles.registerSocialButton} onPress={onPress}>
      <Text style={styles.registerSocialText}>{text}</Text>
    </Pressable>
  );
}

function MealTicketPanel({ state, compact = false }: { state: MealTicketState; compact?: boolean }) {
  const midnightTicket = state.tickets.find((ticket) => ticket.key === 'midnight');
  const current = state.current;
  const ticketMeta = current.available
    ? `${current.label}の一枚が使えます`
    : current.used
      ? current.countdownLabel
      : current.statusLabel;

  return (
    <View style={[styles.mealTicketPanel, compact && styles.mealTicketPanelCompact]}>
      <View style={styles.mealTicketHeader}>
        <View>
          <Text style={styles.mealTicketKicker}>DAILY ACCESS</Text>
          <Text style={styles.mealTicketTitle}>今日の利用枠</Text>
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
          const iconColor = ticket.available ? '#ffffff' : ticket.proOnly ? '#5d5be8' : ticket.accent;
          return (
            <View
              key={ticket.key}
              style={[
                styles.mealTicketCard,
                ticket.available && styles.mealTicketCardActive,
                ticket.used && styles.mealTicketCardUsed,
                ticket.proOnly && styles.mealTicketCardPro,
              ]}
            >
              <View style={styles.mealTicketCardTop}>
                <View
                  style={[
                    styles.mealTicketIcon,
                    { borderColor: `${ticket.accent}33`, backgroundColor: `${ticket.accent}12` },
                    ticket.available && { backgroundColor: ticket.accent, borderColor: ticket.accent },
                  ]}
                >
                  <Ionicons name={ticket.icon} size={compact ? 15 : 18} color={iconColor} />
                </View>
                <View style={styles.mealTicketTextBlock}>
                  <Text style={[styles.mealTicketName, ticket.available && styles.mealTicketNameActive]}>{ticket.label}</Text>
                  <Text style={styles.mealTicketTime}>{ticket.timeLabel}</Text>
                </View>
              </View>
              <View style={styles.mealTicketStatusRow}>
                {(ticket.used || (ticket.proOnly && !state.isProUser)) && (
                  <Ionicons name={ticket.used ? 'checkmark-circle' : 'lock-closed'} size={13} color={ticket.used ? '#8c8379' : '#5d5be8'} />
                )}
                <Text
                  style={[
                    styles.mealTicketStatus,
                    ticket.available && styles.mealTicketStatusActive,
                    ticket.proOnly && !state.isProUser && styles.mealTicketStatusPro,
                  ]}
                  numberOfLines={1}
                >
                  {ticket.statusLabel}
                </Text>
              </View>
              {!compact && <Text style={styles.mealTicketCountdown} numberOfLines={1}>{ticket.countdownLabel}</Text>}
            </View>
          );
        })}
      </View>
      {!compact && midnightTicket && (
        <View style={styles.mealTicketNightRail}>
          <View style={styles.mealTicketNightTitleRow}>
            <Ionicons name="sparkles-outline" size={16} color="#5d5be8" />
            <Text style={styles.mealTicketNightTitle}>Pro深夜ジャンル</Text>
          </View>
          <View style={styles.mealTicketNightChips}>
            {midnightTicket.genreHints.map((hint) => (
              <View key={hint} style={styles.mealTicketNightChip}>
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
  isLoading,
  mealTicketState,
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
  onLocationPress,
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
  isLoading: boolean;
  mealTicketState: MealTicketState;
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
  onLocationPress: () => void;
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
            mealTicketState={mealTicketState}
            onAreaChange={onAreaChange}
            onOpenFilters={onOpenFilters}
            onLocationPress={onLocationPress}
            onAllRandomPress={onAllRandomPress}
            onConditionRandomPress={onRandomPress}
            onSubmit={onLoadRestaurants}
          />
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
  mealTicketState,
  onAreaChange,
  onOpenFilters,
  onLocationPress,
  onAllRandomPress,
  onConditionRandomPress,
  onSubmit,
}: {
  area: string;
  genre: string;
  budgetMin: string;
  distance: string;
  presets: AreaPreset[];
  history: Restaurant[];
  locationStatus: string;
  mealTicketState: MealTicketState;
  onAreaChange: (value: string) => void;
  onOpenFilters: () => void;
  onLocationPress: () => void;
  onAllRandomPress: () => void;
  onConditionRandomPress: () => void;
  onSubmit: () => void;
}) {
  const [query, setQuery] = useState('');
  const [showAllFavorites, setShowAllFavorites] = useState(false);
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
  const allFavoriteAreas = uniqueAreaPresets([...(currentAreaPreset ? [currentAreaPreset] : []), ...historyAreaPresets, ...prefecturePresets])
    .filter((preset) => preset.label !== '現在地');
  const favoriteAreas = showAllFavorites ? allFavoriteAreas : allFavoriteAreas.slice(0, 8);
  const favoriteAreaTitle = selectedPrefecture ? `${selectedPrefecture}の市町村・主要エリア` : '県を選ぶと市町村が出ます';
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

  return (
    <View style={styles.homeLocationPanel}>
      <View style={styles.homeTopBar}>
        <View style={styles.homeLogoButton}>
          <Image source={RANDISH_LOGO} style={styles.homeLogoImage} resizeMode="contain" />
        </View>
        <Pressable style={styles.homeAccountButton} onPress={() => {}}>
          <Ionicons name="person-outline" size={24} color={INK} />
        </Pressable>
      </View>
      <Text style={styles.homeLocationEyebrow}>AREA SETUP</Text>
      <Text style={styles.homeLocationTitle}>どの街から探す？</Text>
      <Text style={styles.homeLocationLead}>現在地、駅名、市町村。今日の一店を決める起点を選びます。</Text>
      <MealTicketPanel state={mealTicketState} />

      <View style={styles.homeSearchBox}>
        <Ionicons name="search" size={28} color={INK} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          style={styles.homeSearchInput}
          placeholder="梅田・美郷町・駅名で検索"
          placeholderTextColor="#a29b94"
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
          {searchResults.length === 0 && <Text style={styles.areaNoResult}>その街はまだ隠れています</Text>}
        </View>
      ) : (
        <>
          <View style={styles.homeLocationCards}>
            <Pressable style={styles.homeCurrentCard} onPress={onLocationPress}>
              <View style={styles.homeCurrentBadge}>
                <Ionicons name="navigate" size={13} color={ORANGE} />
                <Text style={styles.homeCurrentBadgeText}>いまここ</Text>
              </View>
              <View style={styles.homeTargetMark}>
                <View style={styles.homeTargetOuter}>
                  <View style={styles.homeTargetInner} />
                </View>
              </View>
              <View style={styles.homeCurrentBottom}>
                <View style={styles.homeCurrentTextWrap}>
                  <Text style={styles.homeCurrentTitle}>近くのごはんを引く</Text>
                  <Text style={styles.homeCurrentText}>{locationStatus}</Text>
                </View>
              </View>
            </Pressable>
            <Pressable style={styles.homeMapPreview} onPress={selectedPrefecture ? exploreSelectedPrefecture : undefined}>
              <View style={[styles.homeMapRoad, styles.homeMapRoadOne]} />
              <View style={[styles.homeMapRoad, styles.homeMapRoadTwo]} />
              <View style={[styles.homeMapRoad, styles.homeMapRoadThree]} />
              <View style={styles.homeMapPark} />
              <View style={styles.homeMapPin} />
              <Ionicons name="location-sharp" size={38} color={INK} style={styles.homeMapMarkerIcon} />
              <View style={styles.homeMapBottom}>
                <Text style={styles.homeMapTitle}>{selectedPrefecture ? `${selectedPrefecture}を探検` : 'まず県を選ぶ'}</Text>
                <Text style={styles.homeMapLead}>{selectedPrefecture ? '市町村を決めずに県全体で探す' : '県を選ぶと市町村が出ます'}</Text>
              </View>
            </Pressable>
          </View>

          <View style={styles.homeSubsection}>
            <View style={styles.homeSubsectionHeader}>
              <Ionicons name="map-outline" size={28} color={INK} />
              <Text style={styles.homeSubsectionTitle}>地方から選ぶ</Text>
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
                        <Text style={styles.homeRegionMeta}>{group.prefectures.length}都道府県</Text>
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
              {!!selectedPrefecture && allFavoriteAreas.length > 8 && (
                <Pressable onPress={() => setShowAllFavorites((current) => !current)}>
                  <Text style={styles.homeSectionSeeAll}>{showAllFavorites ? 'きゅっと戻す' : 'もっとまちを見る ＞'}</Text>
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
                    <Text style={styles.homeExploreTitle}>{selectedPrefecture}全体で探す</Text>
                    <Text style={styles.homeExploreText}>市町村を絞らず、県全域を対象にします</Text>
                  </View>
                  <Ionicons name="arrow-forward" size={20} color="#ffffff" />
                </Pressable>
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
              </>
            ) : (
              <View style={styles.homePrefecturePrompt}>
                <Ionicons name="map-outline" size={22} color={ORANGE} />
                <Text style={styles.homePrefecturePromptText}>先に都道府県を選ぶと、市町村のまち札がここに並びます。</Text>
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
  compact = false,
  showAreaPicker = true,
  onAreaChange,
  onGenreChange,
  onBudgetMinChange,
  onBudgetMaxChange,
  onDistanceChange,
  onRandomized,
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
  compact?: boolean;
  showAreaPicker?: boolean;
  onAreaChange: (value: string) => void;
  onGenreChange: (value: string) => void;
  onBudgetMinChange: (value: string) => void;
  onBudgetMaxChange: (value: string) => void;
  onDistanceChange: (value: string) => void;
  onRandomized?: (field: ConditionRandomField) => void;
  onSubmit: () => void;
}) {
  const [showAllGenres, setShowAllGenres] = useState(false);
  const randomState = conditionRandom ?? { budget: false, distance: false, genre: false };
  const selectableGenres = compact ? genres.slice(1) : genres;
  const mainGenres = selectableGenres.slice(0, 12);
  const selectedHiddenGenre = selectableGenres.find((item) => item.label === genre && !mainGenres.some((mainGenre) => mainGenre.label === item.label));
  const visibleGenres = showAllGenres ? selectableGenres : selectedHiddenGenre ? [...mainGenres, selectedHiddenGenre] : mainGenres;
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

  return (
    <View style={styles.filterPanel}>
      <View style={styles.filterHeader}>
        <Text style={styles.panelTitle}>今日の条件</Text>
        <Pressable style={styles.refreshButton} onPress={onSubmit}>
          <Text style={styles.refreshButtonText}>候補更新</Text>
        </Pressable>
      </View>
      {showAreaPicker && (
        <>
          <View style={styles.locationField}>
            <Text style={styles.fieldIcon}>⌖</Text>
            <TextInput value={area} onChangeText={onAreaChange} style={styles.locationInput} placeholder="現在地エリア" placeholderTextColor="#9b9184" />
          </View>
          <AreaPresetPicker selectedArea={area} presets={areaPresets} onSelect={onAreaChange} />
        </>
      )}
      <View style={styles.filterGrid}>
        <SmallField label="予算" value={budgetMax} suffix="円以内" onChangeText={onBudgetMaxChange} onRandom={randomizeBudget} randomActive={randomState.budget} />
        <SegmentedValue label="距離" value={distance} values={DISTANCE_OPTIONS} onChange={onDistanceChange} onRandom={randomizeDistance} randomActive={randomState.distance} />
      </View>
      <View style={styles.genreSectionHeader}>
        <Text style={styles.genreSectionTitle}>ジャンル</Text>
        <Pressable style={[styles.randomMiniButton, randomState.genre && styles.randomMiniButtonActive]} onPress={randomizeGenre}>
          <Ionicons name="shuffle-outline" size={14} color={randomState.genre ? '#ffffff' : ORANGE} />
          <Text style={[styles.randomMiniButtonText, randomState.genre && styles.randomMiniButtonTextActive]}>ランダム</Text>
        </Pressable>
      </View>
      <View style={styles.genreGridTwo}>
        {visibleGenres.map((item) => {
          const selected = !randomState.genre && genre === item.label;
          return (
            <Pressable
              key={item.label}
              style={[styles.genreChip, selected && { borderColor: item.color, backgroundColor: '#fff7ed' }]}
              onPress={() => onGenreChange(item.label)}
            >
              <View
                style={[
                  styles.genreIconChip,
                  { backgroundColor: `${item.color}12`, borderColor: `${item.color}30` },
                  selected && { backgroundColor: '#ffffff', borderColor: item.color },
                ]}
              >
                <Image source={item.image} style={[styles.genreChipImage, selected && styles.genreChipImageActive]} resizeMode="contain" />
              </View>
              <Text style={[styles.genreChipText, selected && { color: item.color }]} numberOfLines={1}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {selectableGenres.length > 12 && (
        <Pressable style={styles.showAllGenresButton} onPress={() => setShowAllGenres((current) => !current)}>
          <Text style={styles.showAllGenresText}>{showAllGenres ? 'ジャンルを少なく表示' : `すべてを表示（${selectableGenres.length}件）`}</Text>
        </Pressable>
      )}
    </View>
  );
}

function AreaPresetPicker({
  selectedArea,
  presets,
  onSelect,
}: {
  selectedArea: string;
  presets: AreaPreset[];
  onSelect: (value: string) => void;
}) {
  const prefectures = useMemo(() => Array.from(new Set(presets.map(getPresetPrefecture))), [presets]);
  const selectedPreset = getAreaPreset(selectedArea);
  const [areaQuery, setAreaQuery] = useState('');
  const [selectedPrefecture, setSelectedPrefecture] = useState(
    selectedPreset ? getPresetPrefecture(selectedPreset) : isPrefectureName(selectedArea) ? selectedArea : prefectures[0] ?? '現在地',
  );
  const selectedPrefectureAreas = useMemo(
    () => uniqueAreaPresets(presets.filter((preset) => getPresetPrefecture(preset) === selectedPrefecture)),
    [presets, selectedPrefecture],
  );
  const searchResults = useMemo(() => {
    const query = areaQuery.trim().toLowerCase();
    if (!query) {
      return [];
    }
    return uniqueAreaPresets(presets.filter((preset) => getAreaPresetSearchText(preset).includes(query))).slice(0, 24);
  }, [areaQuery, presets]);
  const hasQuery = areaQuery.trim().length > 0;

  return (
    <View style={styles.areaPicker}>
      <View style={styles.areaPickerHeader}>
        <Text style={styles.areaPickerTitle}>エリアを検索</Text>
        <Text style={styles.areaPickerMeta}>{prefectures.length}都道府県 / {presets.length}エリア</Text>
      </View>
      <View style={styles.areaSearchBox}>
        <Text style={styles.areaSearchIcon}>⌕</Text>
        <TextInput
          value={areaQuery}
          onChangeText={setAreaQuery}
          style={styles.areaSearchInput}
          placeholder="例: 大阪 / 美郷町 / 北区 / 梅田"
          placeholderTextColor="#9b9184"
        />
        {!!areaQuery && (
          <Pressable style={styles.areaSearchClear} onPress={() => setAreaQuery('')}>
            <Text style={styles.areaSearchClearText}>×</Text>
          </Pressable>
        )}
      </View>
      {hasQuery ? (
        <View style={styles.areaGroup}>
          <Text style={styles.areaGroupTitle}>検索結果</Text>
          <View style={styles.areaChipWrap}>
            {searchResults.map((item, index) => {
              const itemValue = getAreaPresetValue(item);
              const selected = selectedArea === itemValue || selectedArea === item.label;
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
            {searchResults.length === 0 && <Text style={styles.areaNoResult}>該当エリアがありません</Text>}
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
          <View style={styles.areaGroup}>
            <Text style={styles.areaGroupTitle}>{selectedPrefecture} の市区町村・主要エリア</Text>
            <View style={styles.areaChipWrap}>
              {selectedPrefectureAreas.map((item, index) => {
                const itemValue = getAreaPresetValue(item);
                const selected = selectedArea === itemValue || selectedArea === item.label;
                return (
                  <Pressable key={`${getAreaPresetKey(item)}-${index}`} style={[styles.areaChip, selected && styles.areaChipActive]} onPress={() => onSelect(itemValue)}>
                    <Text style={[styles.areaChipText, selected && styles.areaChipTextActive]}>{item.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </>
      )}
    </View>
  );
}

function RandomFieldHeader({ label, onRandom, randomActive = false }: { label: string; onRandom?: () => void; randomActive?: boolean }) {
  return (
    <View style={styles.fieldHeaderRow}>
      <Text style={styles.smallFieldLabel}>{label}</Text>
      {!!onRandom && (
        <Pressable style={[styles.randomMiniButton, randomActive && styles.randomMiniButtonActive]} onPress={onRandom}>
          <Ionicons name="shuffle-outline" size={14} color={randomActive ? '#ffffff' : ORANGE} />
          <Text style={[styles.randomMiniButtonText, randomActive && styles.randomMiniButtonTextActive]}>ランダム</Text>
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
}: {
  label: string;
  value: string;
  suffix: string;
  onChangeText: (value: string) => void;
  onRandom?: () => void;
  randomActive?: boolean;
}) {
  return (
    <View style={styles.smallField}>
      <RandomFieldHeader label={label} onRandom={onRandom} randomActive={randomActive} />
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
}: {
  label: string;
  value: string;
  values: string[];
  onChange: (value: string) => void;
  onRandom?: () => void;
  randomActive?: boolean;
}) {
  return (
    <View style={styles.segmentWrap}>
      <RandomFieldHeader label={label} onRandom={onRandom} randomActive={randomActive} />
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
  onSearch,
  onRandomPress,
  onAllRandomPress,
}: {
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
  onSearch: () => void;
  onRandomPress: () => void;
  onAllRandomPress: () => void;
}) {
  const isEverythingRandom = drawMode === 'everything';
  const summaryBudget = isEverythingRandom || conditionRandom.budget ? '？' : formatBudgetLimit(budgetMax);
  const summaryDistance = isEverythingRandom || conditionRandom.distance ? '？' : distance;
  const summaryGenre = isEverythingRandom || conditionRandom.genre ? '？' : genre;

  return (
    <View>
      <PageIntro title="条件を整える" lead="探し込みすぎず、決めるために必要な条件だけを残しました。" />
      <View style={styles.apiCard}>
        <Text style={styles.apiLabel}>API URL</Text>
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
          <Text style={styles.decisionSummaryLabel}>予算</Text>
          <Text style={styles.decisionSummaryValue}>{summaryBudget}</Text>
        </View>
        <View style={styles.decisionSummaryChip}>
          <Text style={styles.decisionSummaryLabel}>距離</Text>
          <Text style={styles.decisionSummaryValue}>{summaryDistance}</Text>
        </View>
        <View style={styles.decisionSummaryChip}>
          <Text style={styles.decisionSummaryLabel}>GENRE</Text>
          <Text style={styles.decisionSummaryValue} numberOfLines={1}>{summaryGenre}</Text>
        </View>
      </View>
      <View style={styles.decisionActionRow}>
        <Pressable style={[styles.bigDecisionButton, styles.bigDecisionButtonPrimary]} onPress={onRandomPress}>
          <Text style={styles.bigDecisionSmall}>{isLoading ? '候補を確認中...' : `${restaurants.length}件から抽選`}</Text>
          <Text style={styles.bigDecisionText}>この条件で決める</Text>
        </Pressable>
        <Pressable style={[styles.bigDecisionButton, styles.bigDecisionButtonRandom]} onPress={onAllRandomPress}>
          <Ionicons name="shuffle-outline" size={21} color="#ffffff" />
          <Text style={styles.allRandomDecisionText}>完全ランダム</Text>
        </Pressable>
      </View>
      <SectionHeader title="候補一覧" action={`${restaurants.length}件`} />
      {restaurants.map((restaurant) => (
        <RestaurantCard key={restaurant.id} restaurant={restaurant} />
      ))}
      {restaurants.length > 0 && <HotPepperCredit />}
    </View>
  );
}

function RandomTab({
  area,
  genre,
  budgetMin,
  budgetMax,
  distance,
  message,
  isLoading,
  selectedRestaurant,
  distanceOrigin,
  userLocation,
  history,
  conditionRandom,
  drawAnimationKey,
  drawMode,
  mealTicketState,
  spinValue,
  resultRevealValue,
  onRandomPress,
  onSavePress,
  onGoPress,
}: {
  area: string;
  genre: string;
  budgetMin: string;
  budgetMax: string;
  distance: string;
  message: string;
  isLoading: boolean;
  selectedRestaurant: Restaurant | null;
  distanceOrigin: DistanceOrigin;
  userLocation: UserLocation | null;
  history: Restaurant[];
  conditionRandom: ConditionRandomState;
  drawAnimationKey: DrawAnimationKey;
  drawMode: DrawMode;
  mealTicketState: MealTicketState;
  spinValue: Animated.Value;
  resultRevealValue: Animated.Value;
  onRandomPress: () => void;
  onSavePress: () => void;
  onGoPress: () => void;
}) {
  const isEverythingRandom = drawMode === 'everything';
  const drawAnimation = DRAW_ANIMATION_PROFILES[drawAnimationKey];
  const displayArea = isEverythingRandom ? '？' : area;
  const displayGenre = isEverythingRandom || conditionRandom.genre ? '？' : genre;
  const displayBudget = isEverythingRandom || conditionRandom.budget ? '？' : formatBudgetLimit(budgetMax);
  const displayDistance = isEverythingRandom || conditionRandom.distance ? '？' : distance;
  const currentTicket = mealTicketState.current;
  const ticketAvailable = currentTicket.available;
  const statusText = !ticketAvailable
    ? 'TICKET LOCKED'
    : isLoading
    ? drawAnimation.activeStatus
    : isEverythingRandom
      ? 'ALL RANDOM READY'
      : 'READY TO DRAW';
  const startText = !ticketAvailable
    ? currentTicket.proOnly && !mealTicketState.isProUser
      ? 'Pro深夜チケット'
      : '次の食券を待つ'
    : isEverythingRandom
      ? '完全ランダム START'
      : 'PRESS START';
  const rotate = spinValue.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '1440deg'] });
  const dartDrop = spinValue.interpolate({ inputRange: [0, 0.72, 1], outputRange: [-18, -18, 0] });
  const dartWiggle = spinValue.interpolate({ inputRange: [0, 0.74, 0.88, 1], outputRange: ['-8deg', '-8deg', '6deg', '0deg'] });
  const wheelScale = spinValue.interpolate({ inputRange: [0, 0.18, 0.52, 0.82, 1], outputRange: [1, 0.98, 1.03, 0.995, 1] });
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
  const mapPins = [
    { top: 22, left: 91, color: '#ea4335' },
    { top: 51, left: 153, color: '#fbbc04' },
    { top: 122, left: 166, color: '#34a853' },
    { top: 160, left: 72, color: '#4285f4' },
    { top: 90, left: 27, color: '#f05a28' },
    { top: 36, left: 50, color: '#7c5cff' },
    { top: 153, left: 132, color: '#00a884' },
  ];
  const roulettePockets = [
    { label: '1', top: 8, left: 101, color: ORANGE },
    { label: '2', top: 27, left: 155, color: '#4285f4' },
    { label: '3', top: 80, left: 181, color: '#34a853' },
    { label: '4', top: 136, left: 166, color: '#fbbc04' },
    { label: '5', top: 171, left: 105, color: '#ea4335' },
    { label: '6', top: 150, left: 43, color: '#00a884' },
    { label: '7', top: 88, left: 16, color: '#7c5cff' },
    { label: '8', top: 29, left: 46, color: '#f05a28' },
  ];
  const rouletteLabels = [
    { text: displayGenre, style: styles.rouletteLabelTop },
    { text: displayArea, style: styles.rouletteLabelBottom },
    { text: isEverythingRandom ? '気分' : '近場', style: styles.rouletteLabelRight },
    { text: isEverythingRandom ? '直感' : '予算内', style: styles.rouletteLabelLeft },
  ];

  return (
    <View>
      <MealTicketPanel state={mealTicketState} compact />
      <View style={styles.drawConditionRow}>
          <ConditionPill label={isEverythingRandom ? '完全ランダム' : displayArea} active />
          <ConditionPill label={displayGenre} />
          <ConditionPill label={displayBudget} />
          <ConditionPill label={displayDistance} />
      </View>
      <Pressable style={[styles.drawStage, isLoading && styles.drawStageLoading]} onPress={onRandomPress} disabled={isLoading}>
        <View style={styles.rouletteStatusPill}>
          <Text style={styles.rouletteStatusText}>{statusText}</Text>
        </View>
        <View style={styles.rouletteButton}>
          <Animated.View style={[styles.dart, { transform: [{ translateY: dartDrop }, { rotate: dartWiggle }] }]}>
            <View style={styles.dartNeedle} />
            <View style={styles.dartTail} />
          </Animated.View>
          <View style={styles.rouletteHalo} />
          {drawAnimationKey === 'radar' && (
            <Animated.View style={[styles.radarMotionLayer, { opacity: radarPulseOpacity, transform: [{ scale: radarPulseScale }] }]}>
              <View style={styles.radarRingOuter} />
              <View style={styles.radarRingInner} />
            </Animated.View>
          )}
          <Animated.View style={[styles.rouletteWheel, { transform: [{ rotate }, { scale: wheelScale }] }]}>
            <View style={styles.rouletteMapTint} />
            <View style={[styles.rouletteDivider, styles.rouletteDividerVertical]} />
            <View style={[styles.rouletteDivider, styles.rouletteDividerHorizontal]} />
            <View style={[styles.rouletteDivider, styles.rouletteDividerDiagonalOne]} />
            <View style={[styles.rouletteDivider, styles.rouletteDividerDiagonalTwo]} />
            <View style={[styles.mapRoad, styles.mapRoadOne]} />
            <View style={[styles.mapRoad, styles.mapRoadTwo]} />
            <View style={[styles.mapRoad, styles.mapRoadThree]} />
            <View style={[styles.mapPark, styles.mapParkOne]} />
            <View style={[styles.mapPark, styles.mapParkTwo]} />
            {roulettePockets.map((pocket) => (
              <View key={pocket.label} style={[styles.roulettePocket, { top: pocket.top, left: pocket.left, backgroundColor: pocket.color }]}>
                <Text style={styles.roulettePocketText}>{pocket.label}</Text>
              </View>
            ))}
            {rouletteLabels.map((label) => (
              <View key={label.text} style={[styles.rouletteLabelChip, label.style]}>
                <Text style={styles.rouletteLabelText} numberOfLines={1}>{label.text}</Text>
              </View>
            ))}
            {mapPins.map((pin, index) => (
              <View key={`${pin.color}-${index}`} style={[styles.mapPin, { top: pin.top, left: pin.left, backgroundColor: pin.color }]} />
            ))}
            <View style={styles.wheelCore}>
              <Image source={RANDISH_LOGO} style={styles.wheelLogo} resizeMode="contain" />
              <Text style={styles.wheelCoreTitle}>RANDISH</Text>
              <Text style={styles.wheelCoreSub}>MAP</Text>
            </View>
          </Animated.View>
          {drawAnimationKey === 'radar' && (
            <Animated.View style={[styles.radarSweep, { transform: [{ rotate: radarRotate }] }]} />
          )}
          {drawAnimationKey === 'lottery' && (
            <Animated.View style={[styles.lotteryMotionLayer, { opacity: ticketOpacity, transform: [{ translateY: ticketLift }, { rotate: ticketRotate }] }]}>
              <View style={[styles.lotteryTicket, styles.lotteryTicketBackLeft]} />
              <View style={[styles.lotteryTicket, styles.lotteryTicketBackRight]} />
              <View style={styles.lotteryTicketFront}>
                <Text style={styles.lotteryTicketLabel}>RANDISH</Text>
                <Text style={styles.lotteryTicketTitle}>今日の一店</Text>
              </View>
            </Animated.View>
          )}
          {drawAnimationKey === 'shuffle' && (
            <View style={styles.shuffleMotionLayer}>
              <Animated.View style={[styles.shuffleCard, styles.shuffleCardOne, { transform: [{ translateX: shuffleOneX }, { translateY: shuffleCardY }, { scale: shuffleCardScale }, { rotate: '-8deg' }] }]}>
                <Text style={styles.shuffleCardLabel}>AREA</Text>
                <Text style={styles.shuffleCardValue} numberOfLines={1}>{displayArea}</Text>
              </Animated.View>
              <Animated.View style={[styles.shuffleCard, styles.shuffleCardTwo, { transform: [{ translateX: shuffleTwoX }, { translateY: shuffleCardY }, { scale: shuffleCardScale }, { rotate: '5deg' }] }]}>
                <Text style={styles.shuffleCardLabel}>GENRE</Text>
                <Text style={styles.shuffleCardValue} numberOfLines={1}>{displayGenre}</Text>
              </Animated.View>
              <Animated.View style={[styles.shuffleCard, styles.shuffleCardThree, { transform: [{ translateX: shuffleThreeX }, { translateY: shuffleCardY }, { scale: shuffleCardScale }, { rotate: '10deg' }] }]}>
                <Text style={styles.shuffleCardLabel}>PRICE</Text>
                <Text style={styles.shuffleCardValue} numberOfLines={1}>{displayBudget}</Text>
              </Animated.View>
            </View>
          )}
          <View style={styles.rouletteHintRow}>
            <Text style={styles.rouletteHintText}>{drawAnimation.hint}</Text>
            <Text style={styles.rouletteHintAccent}>{drawAnimation.accent}</Text>
          </View>
          <View style={styles.mapChoiceCard}>
            <Text style={styles.mapChoiceLabel}>GENRE</Text>
            <Text style={styles.mapChoiceValue}>{displayGenre}</Text>
            <View style={styles.mapChoiceDivider} />
            <Text style={styles.mapChoiceLabel}>AREA</Text>
            <Text style={styles.mapChoiceValue}>{displayArea}</Text>
          </View>
          <View style={[styles.rouletteCta, !ticketAvailable && styles.rouletteCtaLocked]}>
            {isLoading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <>
                <Ionicons name={drawAnimation.icon} size={25} color="#ffffff" />
                <Text style={styles.rouletteCtaText}>{startText}</Text>
              </>
            )}
          </View>
          <Text style={styles.rouletteMessage}>{message}</Text>
        </View>
      </Pressable>
      {selectedRestaurant ? (
        <Animated.View style={[styles.resultWrap, { opacity: resultRevealValue, transform: [{ translateY: resultTranslateY }, { scale: resultScale }] }]}>
          <Text style={styles.resultKicker}>TODAY'S PICK</Text>
          <ResultCard restaurant={selectedRestaurant} selectedGenre={isEverythingRandom ? 'すべて' : genre} distanceOrigin={distanceOrigin} userLocation={userLocation} onMapPress={onGoPress} />
          <View style={styles.resultActions}>
            <Pressable style={styles.secondaryAction} onPress={onRandomPress}>
              <Text style={styles.secondaryActionText}>もう一回引く</Text>
            </Pressable>
            <Pressable style={styles.primaryAction} onPress={onGoPress}>
              <Text style={styles.primaryActionText}>この店に行く</Text>
            </Pressable>
          </View>
          <Pressable style={styles.saveAction} onPress={onSavePress}>
            <Text style={styles.saveActionText}>保存する</Text>
          </Pressable>
        </Animated.View>
      ) : (
        <View style={styles.emptyPanel}>
          <Text style={styles.emptyTitle}>まだ一店は決まっていません</Text>
          <Text style={styles.emptyText}>大きなカードのSTARTを押すと抽選が始まります。</Text>
        </View>
      )}
      <HistorySection history={history} />
      {!selectedRestaurant && history.length > 0 && <HotPepperCredit />}
    </View>
  );
}

function SaveTab({ savedRestaurants, history }: { savedRestaurants: Restaurant[]; history: Restaurant[] }) {
  return (
    <View>
      <PageIntro title="保存したお店" lead="また行きたい候補をここに残しておけます。" />
      {savedRestaurants.length === 0 ? (
        <View style={styles.emptyPanel}>
          <Text style={styles.emptyTitle}>保存はまだありません</Text>
          <Text style={styles.emptyText}>結果カードの「保存する」から追加できます。</Text>
        </View>
      ) : (
        savedRestaurants.map((restaurant) => <RestaurantCard key={`${restaurant.id}-saved`} restaurant={restaurant} />)
      )}
      <HistorySection history={history} />
      {(savedRestaurants.length > 0 || history.length > 0) && <HotPepperCredit />}
    </View>
  );
}

function AnalyticsTab({
  area,
  locationStatus,
  restaurants,
  history,
  drawHistories,
  savedRestaurants,
  onAreaPress,
}: {
  area: string;
  locationStatus: string;
  restaurants: Restaurant[];
  history: Restaurant[];
  drawHistories: DrawHistoryEntry[];
  savedRestaurants: Restaurant[];
  onAreaPress: () => void;
}) {
  const monthDate = useMemo(() => new Date(), []);
  const monthLabel = `${monthDate.getMonth() + 1}月`;

  const monthlyDraws = useMemo(() => {
    const month = new Date();
    const currentMonthEntries = drawHistories.filter((entry) => isSameMonth(entry.createdAt, month));
    if (drawHistories.length || !history.length) {
      return currentMonthEntries;
    }
    const createdAt = new Date().toISOString();
    return history.map((restaurant, index) => ({
      id: `session-${restaurant.id}-${index}`,
      restaurant,
      createdAt,
    }));
  }, [drawHistories, history]);

  const budgetValues = useMemo(
    () => monthlyDraws
      .map((entry) => getEstimatedBudget(entry.restaurant))
      .filter((value): value is number => value != null),
    [monthlyDraws],
  );

  const monthlyEstimatedTotal = budgetValues.reduce((total, value) => total + value, 0);
  const monthlyTotalLabel = budgetValues.length ? `約${formatYen(monthlyEstimatedTotal)}` : '0円';
  const averageBudgetLabel = budgetValues.length ? `約${formatYen(monthlyEstimatedTotal / budgetValues.length)}` : '0円';

  const topGenre = useMemo(() => {
    const counts = monthlyDraws.reduce<Record<string, number>>((current, entry) => {
      const restaurant = entry.restaurant;
      current[restaurant.genre] = (current[restaurant.genre] ?? 0) + 1;
      return current;
    }, {});
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'まだなし';
  }, [monthlyDraws]);

  const weekSpends = useMemo(() => {
    const buckets = [0, 0, 0, 0, 0];
    monthlyDraws.forEach((entry) => {
      const date = new Date(entry.createdAt);
      const budget = getEstimatedBudget(entry.restaurant);
      if (Number.isNaN(date.getTime()) || budget == null) {
        return;
      }
      const weekIndex = Math.min(4, Math.floor((date.getDate() - 1) / 7));
      buckets[weekIndex] += budget;
    });
    const max = Math.max(...buckets, 1);
    return buckets.map((amount, index) => ({
      label: `${index + 1}週`,
      amount,
      percent: amount > 0 ? Math.max(18, Math.round((amount / max) * 100)) : 0,
    }));
  }, [monthlyDraws]);

  const recentDraws = monthlyDraws.slice(0, 3);

  const stats: Array<{
    label: string;
    value: string;
    sub: string;
    icon: keyof typeof MaterialCommunityIcons.glyphMap;
  }> = [
    { label: '今月の抽選', value: `${monthlyDraws.length}回`, sub: `${monthLabel}だけ表示`, icon: 'dice-5-outline' },
    { label: '保存した店', value: `${savedRestaurants.length}件`, sub: '無料で確認', icon: 'bookmark-outline' },
    { label: 'よく出るジャンル', value: topGenre, sub: `${monthLabel}の傾向`, icon: 'silverware-fork-knife' },
    { label: '平均単価', value: averageBudgetLabel, sub: '店の平均予算', icon: 'currency-jpy' },
  ];

  const trendGenres: Array<{ label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }> = [
    { label: 'ラーメン', icon: 'noodles' },
    { label: 'カフェ', icon: 'coffee-outline' },
    { label: '焼肉', icon: 'food-steak' },
    { label: '寿司', icon: 'rice' },
    { label: 'イタリアン', icon: 'pasta' },
    { label: 'すべて', icon: 'view-grid-outline' },
  ];

  return (
    <View style={styles.analysisScreen}>
      <View style={styles.analysisHeader}>
        <View style={styles.analysisHeaderText}>
          <Text style={styles.analysisBrand}>RANDISH</Text>
          <Text style={styles.analysisAreaCopy}>{locationStatus}</Text>
        </View>
        <Pressable style={styles.analysisAreaPill} onPress={onAreaPress}>
          <Ionicons name="locate-outline" size={18} color={ORANGE} />
          <Text style={styles.analysisAreaText} numberOfLines={1}>{area}</Text>
        </Pressable>
      </View>

      <View style={styles.analysisTitleBlock}>
        <View style={styles.analysisTitleRow}>
          <View style={styles.analysisTitleBar} />
          <Text style={styles.analysisTitle}>分析</Text>
        </View>
        <Text style={styles.analysisLead}>食の傾向を見える化するプレミアム機能です。</Text>
      </View>

      <View style={styles.analysisFreeCard}>
        <View style={styles.analysisFreeTopRow}>
          <View>
            <Text style={styles.analysisFreeLabel}>FREE PLAN</Text>
            <Text style={styles.analysisFreeTitle}>今月の推定外食費</Text>
          </View>
          <View style={styles.analysisFreeBadge}>
            <Text style={styles.analysisFreeBadgeText}>{monthLabel}</Text>
          </View>
        </View>
        <Text style={styles.analysisFreeAmount} numberOfLines={1}>{monthlyTotalLabel}</Text>
        <Text style={styles.analysisFreeText}>
          抽選で出た店の平均予算を自動で合計しています。手入力なしで、ざっくり支出を見られます。
        </Text>

        <View style={styles.analysisSpendBars}>
          {weekSpends.map((item) => (
            <View key={item.label} style={styles.analysisSpendBarItem}>
              <Text style={styles.analysisSpendBarAmount} numberOfLines={1}>
                {item.amount ? formatYen(item.amount).replace('円', '') : '0'}
              </Text>
              <View style={styles.analysisSpendBarTrack}>
                <View style={[styles.analysisSpendBarFill, { height: `${item.percent}%` }]} />
              </View>
              <Text style={styles.analysisSpendBarLabel}>{item.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.analysisFreeMetaRow}>
          <View style={styles.analysisFreeMetaItem}>
            <Text style={styles.analysisFreeMetaLabel}>計算方法</Text>
            <Text style={styles.analysisFreeMetaValue}>平均予算</Text>
          </View>
          <View style={styles.analysisFreeMetaItem}>
            <Text style={styles.analysisFreeMetaLabel}>対象</Text>
            <Text style={styles.analysisFreeMetaValue}>{monthLabel}の抽選結果</Text>
          </View>
        </View>
      </View>

      <View style={styles.analysisPremiumHero}>
        <Text style={styles.analysisPremiumLabel}>RANDISH PRO</Text>
        <Text style={styles.analysisPremiumTitle}>先月との差まで、{'\n'}残して見る。</Text>
        <Text style={styles.analysisPremiumLead}>
          Freeは今月分だけ。Proなら過去月を保存して、{'\n'}先月より何円増えたか、節約できたかを見られます。
        </Text>
        <Pressable style={styles.analysisBillingButton}>
          <Text style={styles.analysisBillingText}>Pro予定</Text>
        </Pressable>
        <View style={styles.analysisPremiumIcon}>
          <Ionicons name="bar-chart" size={86} color="#ffffff" />
        </View>
      </View>

      <View style={styles.analysisStatsGrid}>
        {stats.map((item) => (
          <View key={item.label} style={styles.analysisStatCard}>
            <MaterialCommunityIcons name={item.icon} size={28} color={INK} />
            <Text style={styles.analysisStatLabel}>{item.label}</Text>
            <Text style={styles.analysisStatValue} numberOfLines={1}>{item.value}</Text>
            <Text style={styles.analysisStatSub}>{item.sub}</Text>
          </View>
        ))}
      </View>

      <View style={styles.analysisHistoryCard}>
        <View style={styles.analysisHistoryHeader}>
          <Text style={styles.analysisHistoryTitle}>今月の抽選結果</Text>
          <View style={styles.analysisPremiumMark}>
            <Ionicons name="lock-closed-outline" size={15} color={INK} />
            <Text style={styles.analysisPremiumMarkText}>先月はPro</Text>
          </View>
        </View>

        {recentDraws.length === 0 ? (
          <View style={styles.analysisHistoryEmpty}>
            <Ionicons name="receipt-outline" size={28} color="#9a9187" />
            <Text style={styles.analysisHistoryEmptyText}>今月の抽選結果が入ると、ここに推定予算が並びます。</Text>
          </View>
        ) : (
          recentDraws.map((entry) => {
            const budget = getEstimatedBudget(entry.restaurant);
            return (
              <View key={entry.id} style={styles.analysisHistoryRow}>
                <Text style={styles.analysisHistoryDate}>{formatShortDate(entry.createdAt)}</Text>
                <View style={styles.analysisHistoryBody}>
                  <Text style={styles.analysisHistoryName} numberOfLines={1}>{entry.restaurant.name}</Text>
                  <Text style={styles.analysisHistoryMeta} numberOfLines={1}>{entry.restaurant.genre} / {entry.restaurant.area}</Text>
                </View>
                <Text style={styles.analysisHistoryBudget}>{budget == null ? '未計測' : `約${formatYen(budget)}`}</Text>
              </View>
            );
          })
        )}
      </View>

      <View style={styles.analysisGenreCard}>
        <View style={styles.analysisGenreHeader}>
          <Text style={styles.analysisGenreTitle}>ジャンル傾向</Text>
          <View style={styles.analysisPremiumMark}>
            <Ionicons name="diamond" size={15} color={INK} />
            <Text style={styles.analysisPremiumMarkText}>Premium</Text>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.analysisGenreRail}>
          {trendGenres.map((genre, index) => {
            const active = index === trendGenres.length - 1;
            return (
              <Pressable key={genre.label} style={[styles.analysisGenrePill, active && styles.analysisGenrePillActive]}>
                <MaterialCommunityIcons name={genre.icon} size={28} color={active ? '#ffffff' : INK} />
                <Text style={[styles.analysisGenreLabel, active && styles.analysisGenreLabelActive]}>{genre.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.analysisInsightPanel}>
          <Ionicons name="analytics-outline" size={74} color="#444444" />
          <View style={styles.analysisInsightCopy}>
            <Text style={styles.analysisInsightTitle}>プレミアムで傾向を可視化</Text>
            <Text style={styles.analysisInsightText}>
              ジャンルごとの出現頻度や、保存率などのデータをグラフで確認できます。
            </Text>
            <Pressable style={styles.analysisInsightButton}>
              <Text style={styles.analysisInsightButtonText}>プレミアム機能をみる</Text>
            </Pressable>
          </View>
        </View>
      </View>
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
  selectedGenre,
  distanceOrigin,
  userLocation,
  onMapPress,
}: {
  restaurant: Restaurant;
  selectedGenre: string;
  distanceOrigin: DistanceOrigin;
  userLocation: UserLocation | null;
  onMapPress: () => void;
}) {
  const stationOrigin = getNearestStationOrigin(restaurant);
  const stationDistanceLabel = stationOrigin ? getDistanceLabel(stationOrigin.location, restaurant) : '地図で確認';
  const currentDistanceLabel = userLocation ? getDistanceLabel(userLocation, restaurant) : '取得中';
  const minutesLabel = getWalkingMinutesLabel(stationOrigin?.location ?? distanceOrigin.location, restaurant);
  const miniMapDistanceLabel = stationOrigin ? `${stationOrigin.label} ${stationDistanceLabel}` : stationDistanceLabel;
  const openStatus = getOpenStatus(restaurant);

  return (
    <View style={styles.resultCard}>
      <RestaurantVisual restaurant={restaurant} large />
      <View style={styles.resultContent}>
        <Text style={styles.resultName}>{restaurant.name}</Text>
        <View style={styles.resultDistanceBand}>
          <View style={styles.resultDistanceList}>
            <View style={styles.resultDistanceItem}>
              <Text style={styles.resultDistanceLabel}>{stationOrigin?.label ?? '最寄り駅から'}</Text>
              <Text style={styles.resultDistanceValue}>{stationDistanceLabel}</Text>
            </View>
            <View style={styles.resultDistanceItem}>
              <Text style={styles.resultDistanceLabel}>現在地から</Text>
              <Text style={[styles.resultDistanceValue, !userLocation && styles.resultDistanceValueMuted]}>{currentDistanceLabel}</Text>
            </View>
          </View>
          <Pressable style={styles.resultMapShortcut} onPress={onMapPress}>
            <Text style={styles.resultMapShortcutText}>Google Map</Text>
          </Pressable>
        </View>
        <View style={styles.metaRow}>
          {selectedGenre !== 'すべて' && <MetaPill label={`選択 ${selectedGenre}`} />}
          <MetaPill label={`API ${restaurant.genre}`} />
          <MetaPill label={restaurant.priceRange ?? formatPrice(restaurant)} />
          <MetaPill label={minutesLabel} />
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
        {restaurant.externalProvider === 'HOTPEPPER' && <HotPepperCredit compact />}
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

function RestaurantCard({ restaurant }: { restaurant: Restaurant }) {
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
          <Text style={styles.restaurantMetaPill}>{getStoredMinutesLabel(restaurant)}</Text>
          <Text style={styles.restaurantMetaPill}>{restaurant.priceRange ?? formatPrice(restaurant)}</Text>
        </View>
      </View>
    </View>
  );
}

function CandidateCard({ restaurant }: { restaurant: Restaurant }) {
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
          <Text style={styles.candidateInfoPill}>{getStoredMinutesLabel(restaurant)}</Text>
          <Text style={styles.candidateInfoPill}>{restaurant.priceRange ?? formatPrice(restaurant)}</Text>
        </View>
      </View>
    </View>
  );
}

function RestaurantVisual({
  restaurant,
  large = false,
}: {
  restaurant: Restaurant;
  large?: boolean;
}) {
  const genreVisual = getGenreVisual(restaurant.genre);
  const imageCredit = restaurant.externalProvider === 'GOOGLE_PLACES'
    ? '画像提供：Google Places'
    : '画像提供：ホットペッパー グルメ';

  if (large && restaurant.photoUrl) {
    return (
      <View style={[styles.restaurantVisualLarge, styles.restaurantVisualFrame]}>
        <Image source={{ uri: restaurant.photoUrl }} style={styles.restaurantVisualPhoto} resizeMode="cover" />
        <Text style={styles.hotpepperImageCredit} numberOfLines={1}>
          {imageCredit}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[
        large ? styles.restaurantVisualLarge : styles.restaurantVisual,
        styles.restaurantVisualFrame,
        { backgroundColor: `${genreVisual.color}16` },
      ]}
    >
      <View style={[styles.genreVisualGlow, { backgroundColor: `${genreVisual.color}1f` }]} />
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

function HistorySection({ history }: { history: Restaurant[] }) {
  return (
    <View>
      <SectionHeader title="最近引いた店" action={history.length ? `${history.length}件` : '履歴なし'} />
      {history.length === 0 ? (
        <Text style={styles.mutedText}>抽選すると、ここに履歴が残ります。</Text>
      ) : (
        history.slice(0, 5).map((restaurant) => <RestaurantCard key={`${restaurant.id}-history`} restaurant={restaurant} />)
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

function AppFooter({ activeTab, onPress }: { activeTab: TabKey; onPress: (tab: TabKey) => void }) {
  return (
    <View style={styles.footer}>
      {FOOTER_ITEMS.map((item) => {
        const active = activeTab === item.key;
        return (
          <Pressable key={item.key} style={styles.footerItem} onPress={() => onPress(item.key)}>
            <View style={[styles.footerIconWrap, active && styles.footerIconWrapActive]}>
              <Ionicons name={item.icon} size={26} color={active ? ORANGE : '#777777'} />
            </View>
            <Text style={[styles.footerLabel, active && styles.footerLabelActive]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: PAPER,
  },
  splashScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PAPER,
    gap: 14,
  },
  splashLogo: {
    width: 156,
    height: 156,
    borderRadius: 34,
  },
  splashTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: INK,
  },
  registerSafe: {
    flex: 1,
    backgroundColor: '#fffdf9',
  },
  registerContainer: {
    padding: 24,
    paddingBottom: 40,
  },
  registerHeader: {
    marginTop: 12,
    marginBottom: 32,
  },
  registerLogo: {
    fontSize: 34,
    fontWeight: '900',
    color: '#171412',
    letterSpacing: -1,
  },
  registerSub: {
    marginTop: 6,
    fontSize: 14,
    color: '#8a817a',
    fontWeight: '700',
  },
  registerTitle: {
    marginBottom: 10,
    fontSize: 32,
    fontWeight: '900',
    color: '#1c1917',
  },
  registerDesc: {
    marginBottom: 22,
    fontSize: 15,
    lineHeight: 23,
    color: '#7b716a',
    fontWeight: '700',
  },
  registerCard: {
    padding: 20,
    borderRadius: 24,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#efe7de',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  registerLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 8,
  },
  registerLabel: {
    fontSize: 16,
    fontWeight: '900',
    color: '#211e1b',
  },
  registerRequired: {
    overflow: 'hidden',
    marginLeft: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#fff0ea',
    fontSize: 12,
    fontWeight: '900',
    color: '#ef552e',
  },
  registerInput: {
    height: 58,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#e6dcd2',
    backgroundColor: '#fffdfb',
    fontSize: 15,
    fontWeight: '700',
    color: '#1c1917',
  },
  registerCheckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 22,
    marginBottom: 18,
  },
  registerCheckbox: {
    width: 22,
    height: 22,
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#d8ccc1',
  },
  registerCheckboxActive: {
    borderColor: '#ef552e',
    backgroundColor: '#ef552e',
  },
  registerTerms: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: '#756b64',
    fontWeight: '700',
  },
  registerLink: {
    color: '#ef552e',
    fontWeight: '900',
  },
  registerNotice: {
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    overflow: 'hidden',
    borderRadius: 12,
    backgroundColor: '#fff3ed',
    fontSize: 12,
    lineHeight: 18,
    color: '#a23d22',
    fontWeight: '800',
  },
  registerMainButton: {
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    borderRadius: 18,
    backgroundColor: '#f2552c',
  },
  registerButtonDisabled: {
    opacity: 0.7,
  },
  registerMainButtonText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '900',
  },
  registerGuestButton: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    borderRadius: 16,
    backgroundColor: '#fff7f2',
    borderWidth: 1.5,
    borderColor: '#ffd8c6',
  },
  registerGuestButtonText: {
    color: '#ef552e',
    fontSize: 16,
    fontWeight: '900',
  },
  registerGuestNote: {
    marginTop: 8,
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 17,
    color: '#8a817a',
    fontWeight: '800',
  },
  registerOr: {
    marginVertical: 24,
    textAlign: 'center',
    color: '#7b716a',
    fontWeight: '900',
  },
  registerSocialButton: {
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#efe4da',
  },
  registerSocialText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#2a2622',
  },
  registerLoginBox: {
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    marginTop: 18,
    borderRadius: 18,
    backgroundColor: '#f7f0e8',
  },
  registerLoginText: {
    fontSize: 14,
    color: '#7b716a',
    fontWeight: '800',
  },
  registerLoginLink: {
    fontSize: 15,
    color: '#ef552e',
    fontWeight: '900',
  },
  loginScreen: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 24,
    justifyContent: 'center',
  },
  loginBootstrapHeader: {
    alignItems: 'center',
    marginBottom: 22,
  },
  loginBootstrapLogo: {
    width: 72,
    height: 72,
    borderRadius: 18,
  },
  loginBootstrapBrand: {
    marginTop: 12,
    fontSize: 22,
    letterSpacing: 2,
    fontWeight: '900',
    color: ORANGE,
  },
  loginBootstrapCard: {
    padding: 22,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dee2e6',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  loginBootstrapTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#212529',
  },
  loginBootstrapLead: {
    marginTop: 8,
    marginBottom: 18,
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '700',
    color: '#6c757d',
  },
  loginAlert: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
    borderRadius: 8,
    backgroundColor: '#e7f1ff',
    borderWidth: 1,
    borderColor: '#b6d4fe',
  },
  loginAlertText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    color: '#084298',
  },
  loginFormGroup: {
    marginBottom: 14,
  },
  loginFormLabel: {
    marginBottom: 6,
    fontSize: 13,
    fontWeight: '800',
    color: '#212529',
  },
  loginFormControl: {
    height: 48,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#ced4da',
    fontSize: 15,
    fontWeight: '700',
    color: '#212529',
  },
  loginTerms: {
    marginTop: 16,
    paddingHorizontal: 8,
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 17,
    fontWeight: '700',
    color: '#6c757d',
  },
  loginTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  loginBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  loginBrandLogo: {
    width: 36,
    height: 36,
    borderRadius: 12,
  },
  loginSkip: {
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#efe4d8',
    fontSize: 12,
    fontWeight: '900',
    color: '#756b60',
  },
  loginHero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  loginLogoCircle: {
    width: 112,
    height: 112,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 32,
    backgroundColor: '#fffaf5',
    borderWidth: 1,
    borderColor: '#f1e7dc',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  loginLogo: {
    width: 84,
    height: 84,
  },
  loginBrand: {
    marginTop: 22,
    fontSize: 18,
    letterSpacing: 2,
    fontWeight: '900',
    color: ORANGE,
  },
  loginHeroCard: {
    minHeight: 370,
    overflow: 'hidden',
    borderRadius: 34,
    backgroundColor: '#171411',
    shadowColor: ORANGE,
    shadowOpacity: 0.18,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 18 },
  },
  loginHeroMap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#201b17',
  },
  loginHeroRoad: {
    position: 'absolute',
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  loginHeroRoadOne: {
    width: 430,
    top: 92,
    left: -54,
    transform: [{ rotate: '22deg' }],
  },
  loginHeroRoadTwo: {
    width: 390,
    bottom: 92,
    right: -80,
    transform: [{ rotate: '-28deg' }],
  },
  loginHeroPark: {
    position: 'absolute',
    right: 24,
    top: 42,
    width: 112,
    height: 74,
    borderRadius: 28,
    backgroundColor: 'rgba(90,130,84,0.45)',
  },
  loginHeroPin: {
    position: 'absolute',
    left: '50%',
    top: 126,
    width: 118,
    height: 118,
    marginLeft: -59,
    borderRadius: 59,
    backgroundColor: ORANGE,
    borderWidth: 9,
    borderColor: '#fff2e8',
    shadowColor: ORANGE,
    shadowOpacity: 0.7,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 0 },
  },
  loginHeroOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: 24,
  },
  loginHeroBadge: {
    alignSelf: 'flex-start',
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    fontSize: 11,
    fontWeight: '900',
    color: '#ffd8c2',
  },
  loginTitle: {
    marginTop: 18,
    fontSize: 34,
    lineHeight: 42,
    fontWeight: '900',
    color: INK,
    textAlign: 'center',
  },
  loginLead: {
    maxWidth: 280,
    marginTop: 12,
    fontSize: 15,
    lineHeight: 24,
    fontWeight: '800',
    color: '#756b60',
    textAlign: 'center',
  },
  loginFeatureRow: {
    flexDirection: 'row',
    gap: 10,
  },
  loginFeatureChip: {
    flex: 1,
    minHeight: 74,
    justifyContent: 'center',
    paddingHorizontal: 13,
    borderRadius: 23,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#efe4d8',
  },
  loginFeatureValue: {
    fontSize: 18,
    fontWeight: '900',
    color: ORANGE,
  },
  loginFeatureLabel: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '900',
    color: '#756b60',
  },
  loginPanel: {
    padding: 18,
    borderRadius: 28,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: LINE,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  loginPanelTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: INK,
  },
  loginPanelLead: {
    marginTop: 4,
    marginBottom: 14,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '800',
    color: '#756b60',
  },
  loginInput: {
    minHeight: 62,
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: '#f8f3eb',
    marginBottom: 10,
  },
  loginInputLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#9b9184',
  },
  loginInputValue: {
    marginTop: 4,
    fontSize: 16,
    fontWeight: '900',
    color: INK,
  },
  loginButton: {
    height: 50,
    marginTop: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: ORANGE,
  },
  loginButtonText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#ffffff',
  },
  loginGhostButton: {
    height: 44,
    marginTop: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dee2e6',
    backgroundColor: '#ffffff',
  },
  loginGhostText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#495057',
  },
  header: {
    minHeight: 88,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#efe7da',
    backgroundColor: PAPER,
  },
  headerLogo: {
    width: 54,
    height: 54,
    borderRadius: 16,
  },
  headerText: {
    flex: 1,
  },
  headerName: {
    fontSize: 20,
    fontWeight: '900',
    color: INK,
  },
  headerCopy: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
    color: '#7d7367',
  },
  locationPill: {
    maxWidth: 96,
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    borderRadius: 17,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: LINE,
  },
  locationIcon: {
    color: ORANGE,
    fontWeight: '900',
  },
  locationText: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '900',
    color: INK,
  },
  content: {
    flex: 1,
  },
  contentInner: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 156,
  },
  hero: {
    padding: 22,
    borderRadius: 30,
    backgroundColor: '#191512',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  heroBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#ffcfb8',
  },
  heroCount: {
    fontSize: 12,
    fontWeight: '900',
    color: '#f4eadf',
  },
  heroTitle: {
    marginTop: 24,
    fontSize: 35,
    lineHeight: 42,
    fontWeight: '900',
    color: '#fffaf3',
  },
  heroLead: {
    marginTop: 14,
    fontSize: 15,
    lineHeight: 24,
    fontWeight: '700',
    color: '#d9cec2',
  },
  heroButton: {
    height: 58,
    marginTop: 22,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ORANGE,
  },
  heroButtonText: {
    fontSize: 17,
    fontWeight: '900',
    color: '#ffffff',
  },
  homeLocationPanel: {
    paddingHorizontal: 0,
    paddingBottom: 20,
  },
  homeBackButton: {
    position: 'absolute',
    top: 4,
    left: 0,
    zIndex: 2,
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  homeBackText: {
    marginTop: -2,
    fontSize: 38,
    lineHeight: 40,
    fontWeight: '600',
    color: INK,
  },
  homeTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 22,
    paddingTop: 12,
  },
  homeLogoButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e8ded3',
  },
  homeLogoImage: {
    width: 36,
    height: 36,
  },
  homeAccountButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e8ded3',
  },
  homeBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  homeBrandLogo: {
    width: 30,
    height: 30,
    borderRadius: 9,
  },
  homeBrandIcon: {
    fontSize: 24,
    color: ORANGE,
    fontWeight: '900',
  },
  homeBrandText: {
    fontSize: 24,
    letterSpacing: 4,
    fontWeight: '900',
    color: ORANGE,
  },
  homeBellButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#eee7df',
    position: 'relative',
  },
  homeBellDome: {
    width: 17,
    height: 17,
    borderTopLeftRadius: 9,
    borderTopRightRadius: 9,
    borderWidth: 2,
    borderBottomWidth: 0,
    borderColor: INK,
  },
  homeBellBase: {
    width: 22,
    height: 7,
    marginTop: -1,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    borderWidth: 2,
    borderTopWidth: 0,
    borderColor: INK,
  },
  homeBellClapper: {
    width: 5,
    height: 5,
    marginTop: -1,
    borderRadius: 3,
    backgroundColor: INK,
  },
  homeBellText: {
    fontSize: 23,
    fontWeight: '900',
    color: INK,
  },
  homeBellDot: {
    position: 'absolute',
    top: 7,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: ORANGE,
  },
  homeLocationEyebrow: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '900',
    color: ORANGE,
  },
  homeLocationTitle: {
    marginTop: 8,
    textAlign: 'left',
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '900',
    color: INK,
  },
  homeLocationLead: {
    marginTop: 8,
    marginBottom: 18,
    textAlign: 'left',
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '700',
    color: '#6f665f',
  },
  mealTicketPanel: {
    marginBottom: 18,
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#fffdf9',
    borderWidth: 1,
    borderColor: '#e6ddd2',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  mealTicketPanelCompact: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 20,
  },
  mealTicketHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  mealTicketKicker: {
    fontSize: 11,
    fontWeight: '900',
    color: '#8d8277',
  },
  mealTicketTitle: {
    marginTop: 1,
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '900',
    color: INK,
  },
  mealTicketCountBadge: {
    minWidth: 58,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#eadfca',
  },
  mealTicketCountBadgeActive: {
    backgroundColor: INK,
    borderColor: INK,
  },
  mealTicketCountText: {
    fontSize: 16,
    lineHeight: 18,
    fontWeight: '900',
    color: INK,
  },
  mealTicketCountTextActive: {
    color: '#ffffff',
  },
  mealTicketCountSub: {
    marginTop: 1,
    fontSize: 9,
    fontWeight: '900',
    color: '#9b9184',
  },
  mealTicketCountSubActive: {
    color: '#f7d6c6',
  },
  mealTicketLead: {
    marginTop: 7,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '800',
    color: '#756b61',
  },
  mealTicketGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 11,
  },
  mealTicketCard: {
    width: '48.5%',
    minHeight: 82,
    padding: 10,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e8ddcf',
  },
  mealTicketCardActive: {
    backgroundColor: '#fff8f2',
    borderColor: ORANGE,
  },
  mealTicketCardUsed: {
    backgroundColor: '#f6f1ea',
  },
  mealTicketCardPro: {
    backgroundColor: '#f7f6fb',
    borderColor: '#dedbe8',
  },
  mealTicketCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mealTicketIcon: {
    width: 29,
    height: 29,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
  },
  mealTicketTextBlock: {
    flex: 1,
  },
  mealTicketName: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
    color: INK,
  },
  mealTicketNameActive: {
    color: ORANGE,
  },
  mealTicketTime: {
    marginTop: 1,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '800',
    color: '#8f8579',
  },
  mealTicketStatusRow: {
    minHeight: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 7,
  },
  mealTicketStatus: {
    flexShrink: 1,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '900',
    color: '#7d7368',
  },
  mealTicketStatusActive: {
    color: ORANGE,
  },
  mealTicketStatusPro: {
    color: '#5d5be8',
  },
  mealTicketCountdown: {
    marginTop: 2,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '800',
    color: '#9b9184',
  },
  mealTicketNightRail: {
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e0ff',
  },
  mealTicketNightTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  mealTicketNightTitle: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
    color: '#514fd0',
  },
  mealTicketNightChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  mealTicketNightChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#f4f2ff',
  },
  mealTicketNightChipText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '900',
    color: '#514fd0',
  },
  homeSearchBox: {
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e6ddd2',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
  },
  homeSearchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    color: INK,
  },
  homeMicIcon: {
    fontSize: 24,
    fontWeight: '900',
    color: ORANGE,
  },
  homeSearchFilterButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#f8f3ed',
  },
  homeSearchFilterButtonMuted: {
    opacity: 0.35,
  },
  homeSearchFilterText: {
    fontSize: 25,
    lineHeight: 28,
    fontWeight: '900',
    color: INK,
  },
  homeMicDot: {
    width: 8,
    height: 24,
    borderRadius: 5,
    backgroundColor: '#9d8772',
  },
  homeSearchResults: {
    marginTop: 14,
    overflow: 'hidden',
    borderRadius: 20,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5ded6',
  },
  homeMoodRail: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  homeMoodChip: {
    flex: 1,
    minHeight: 70,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 22,
    backgroundColor: '#fffaf5',
    borderWidth: 1,
    borderColor: '#f0e4d9',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  homeMoodTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: INK,
  },
  homeMoodSub: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '800',
    color: ORANGE,
  },
  homeDecisionCard: {
    marginTop: 22,
    padding: 18,
    borderRadius: 28,
    backgroundColor: '#171411',
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  homeDecisionTop: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 14,
  },
  homeDecisionKicker: {
    fontSize: 11,
    fontWeight: '900',
    color: ORANGE,
  },
  homeDecisionArea: {
    maxWidth: 180,
    marginTop: 6,
    fontSize: 31,
    lineHeight: 37,
    fontWeight: '900',
    color: '#ffffff',
  },
  homeDecisionMeta: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '800',
    color: '#d8ccc1',
  },
  homeDecisionMap: {
    flex: 1,
    minHeight: 118,
    overflow: 'hidden',
    borderRadius: 22,
    backgroundColor: '#e8efe2',
    position: 'relative',
  },
  homeDecisionGenres: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  homeDecisionGenre: {
    width: 45,
    height: 45,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: '#ffffff',
  },
  homeDecisionGenreImage: {
    width: 36,
    height: 36,
  },
  homeDecisionCopy: {
    marginTop: 15,
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '800',
    color: '#f5eee8',
  },
  homeOrbitStage: {
    minHeight: 520,
    marginTop: 22,
    marginHorizontal: -8,
    overflow: 'hidden',
    borderRadius: 34,
    backgroundColor: '#17120f',
    borderWidth: 1,
    borderColor: '#2b241e',
    position: 'relative',
    shadowColor: ORANGE,
    shadowOpacity: 0.22,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
  },
  homeOrbitRingLarge: {
    position: 'absolute',
    top: 78,
    left: -30,
    width: 390,
    height: 390,
    borderRadius: 195,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
  },
  homeOrbitRingMedium: {
    position: 'absolute',
    top: 120,
    left: 15,
    width: 300,
    height: 300,
    borderRadius: 150,
    borderWidth: 1,
    borderColor: 'rgba(255,126,46,0.28)',
  },
  homeOrbitRingSmall: {
    position: 'absolute',
    top: 160,
    left: 55,
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  homeOrbitCore: {
    position: 'absolute',
    top: 202,
    left: '50%',
    width: 142,
    height: 142,
    marginLeft: -71,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 71,
    backgroundColor: ORANGE,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.82)',
    shadowColor: ORANGE,
    shadowOpacity: 0.75,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 0 },
  },
  homeOrbitCoreLabel: {
    fontSize: 13,
    fontWeight: '900',
    color: '#fff4e8',
  },
  homeOrbitCoreArea: {
    maxWidth: 116,
    marginTop: 4,
    fontSize: 23,
    fontWeight: '900',
    color: '#ffffff',
  },
  homeOrbitCoreHint: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    overflow: 'hidden',
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.18)',
    fontSize: 11,
    fontWeight: '900',
    color: '#ffffff',
  },
  homeFloatingCard: {
    position: 'absolute',
    width: 112,
    minHeight: 86,
    padding: 14,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
  },
  homeFloatingCardOne: {
    top: 78,
    left: 88,
    transform: [{ rotate: '-8deg' }],
  },
  homeFloatingCardTwo: {
    top: 132,
    left: 22,
    transform: [{ rotate: '-10deg' }],
  },
  homeFloatingCardThree: {
    top: 120,
    right: 26,
    transform: [{ rotate: '8deg' }],
  },
  homeFloatingCardFour: {
    top: 314,
    left: 112,
    transform: [{ rotate: '-6deg' }],
  },
  homeFloatingCardFive: {
    top: 82,
    right: 122,
    width: 84,
    minHeight: 64,
    transform: [{ rotate: '7deg' }],
  },
  homeFloatingName: {
    fontSize: 21,
    fontWeight: '900',
    color: INK,
  },
  homeFloatingDistance: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '800',
    color: '#70675f',
  },
  homeFoodBubbleOne: {
    position: 'absolute',
    right: 30,
    top: 220,
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 27,
    backgroundColor: 'rgba(255,255,255,0.82)',
  },
  homeFoodBubbleTwo: {
    position: 'absolute',
    left: 36,
    top: 330,
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.82)',
  },
  homeFoodBubbleImage: {
    width: 42,
    height: 42,
  },
  homeMiniMapCard: {
    position: 'absolute',
    left: 18,
    bottom: 18,
    width: 154,
    height: 86,
    overflow: 'hidden',
    borderRadius: 24,
    backgroundColor: '#c9d2c1',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  homeMiniMapText: {
    position: 'absolute',
    left: 12,
    bottom: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    overflow: 'hidden',
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontWeight: '900',
    color: INK,
  },
  homeRecommendPill: {
    position: 'absolute',
    right: 16,
    bottom: 18,
    width: 186,
    minHeight: 86,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 13,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.30)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  homeRecommendStar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#ffffff',
  },
  homeRecommendLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#ffffff',
  },
  homeRecommendArea: {
    marginTop: 2,
    fontSize: 17,
    fontWeight: '900',
    color: '#ffffff',
  },
  homeRecommendCopy: {
    marginTop: 4,
    maxWidth: 118,
    fontSize: 10,
    lineHeight: 15,
    fontWeight: '700',
    color: '#f7eee5',
  },
  homeLocationCards: {
    marginTop: 20,
    flexDirection: 'row',
    gap: 10,
  },
  homeCurrentCard: {
    flex: 1,
    height: 156,
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e6ddd2',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  homeCurrentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#fff8f4',
    borderWidth: 1,
    borderColor: '#ffd7c6',
  },
  homeCurrentBadgeText: {
    fontSize: 12,
    fontWeight: '900',
    color: ORANGE,
  },
  homeTargetMark: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 42,
  },
  homeTargetOuter: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: '#fffdf9',
    shadowColor: ORANGE,
    shadowOpacity: 0.11,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
  },
  homeTargetInner: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 5,
    borderColor: '#fff2ea',
    backgroundColor: ORANGE,
  },
  homeCurrentBottom: {
    justifyContent: 'flex-end',
  },
  homePinCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#eee6de',
  },
  homePinText: {
    fontSize: 31,
    color: ORANGE,
    lineHeight: 34,
  },
  homePinMarker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: ORANGE,
    borderWidth: 7,
    borderColor: '#ffffff',
  },
  homeCurrentTextWrap: {
    flex: 1,
  },
  homeCurrentTitle: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '900',
    color: INK,
  },
  homeCurrentText: {
    marginTop: 7,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    color: '#756b60',
  },
  homeCurrentArrowCircle: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: ORANGE,
  },
  homeCurrentArrow: {
    marginTop: -3,
    fontSize: 32,
    fontWeight: '800',
    color: '#ffffff',
  },
  homeMapPreview: {
    flex: 1,
    height: 156,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#f2f5ef',
    borderWidth: 1,
    borderColor: '#d8ead1',
    position: 'relative',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
  },
  homeMapRoad: {
    position: 'absolute',
    height: 14,
    borderRadius: 7,
    backgroundColor: '#ffffff',
    opacity: 0.78,
    borderWidth: 1,
    borderColor: '#e5eadf',
  },
  homeMapRoadOne: {
    width: 160,
    top: 28,
    left: -14,
    transform: [{ rotate: '30deg' }],
  },
  homeMapRoadTwo: {
    width: 150,
    top: 74,
    left: 8,
    backgroundColor: '#ffe1a3',
    borderColor: '#f2cf78',
    transform: [{ rotate: '-18deg' }],
  },
  homeMapRoadThree: {
    width: 120,
    top: 55,
    left: 52,
    transform: [{ rotate: '78deg' }],
  },
  homeMapPark: {
    position: 'absolute',
    width: 44,
    height: 32,
    top: 12,
    right: 12,
    borderRadius: 15,
    backgroundColor: '#c9eabd',
  },
  homeMapPin: {
    position: 'absolute',
    top: 54,
    left: '50%',
    width: 32,
    height: 32,
    marginLeft: -16,
    borderRadius: 16,
    backgroundColor: ORANGE,
    borderWidth: 7,
    borderColor: '#fffdf9',
    shadowColor: ORANGE,
    shadowOpacity: 0.14,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  homeMapMarkerIcon: {
    position: 'absolute',
    top: 17,
    right: 17,
    zIndex: 2,
  },
  homeMapBottom: {
    marginTop: 18,
    zIndex: 2,
  },
  homeMapTitle: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '900',
    color: INK,
  },
  homeMapLead: {
    marginTop: 7,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    color: '#666666',
  },
  homeMapArrowCircle: {
    position: 'absolute',
    right: 18,
    bottom: 32,
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  homeMapArrow: {
    marginTop: -3,
    fontSize: 30,
    fontWeight: '800',
    color: INK,
  },
  homeAllRandomCard: {
    marginTop: 22,
    padding: 18,
    overflow: 'hidden',
    borderRadius: 28,
    backgroundColor: '#171411',
    borderWidth: 1,
    borderColor: '#2b231d',
    shadowColor: ORANGE,
    shadowOpacity: 0.2,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 14 },
  },
  homeAllRandomHeader: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
  },
  homeAllRandomIconWrap: {
    width: 66,
    height: 66,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: '#ffffff',
  },
  homeAllRandomLogo: {
    width: 54,
    height: 54,
  },
  homeAllRandomTextWrap: {
    flex: 1,
  },
  homeAllRandomKicker: {
    fontSize: 11,
    fontWeight: '900',
    color: ORANGE,
  },
  homeAllRandomTitle: {
    marginTop: 4,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '900',
    color: '#ffffff',
  },
  homeAllRandomLead: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '700',
    color: '#d9cfc7',
  },
  homeAllRandomChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16,
  },
  homeAllRandomChip: {
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    fontSize: 12,
    fontWeight: '900',
    color: '#fff5ec',
  },
  homeRandomModeRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  homeRandomModeGhost: {
    flex: 0.86,
    minHeight: 62,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  homeRandomModeGhostSub: {
    fontSize: 11,
    fontWeight: '900',
    color: '#d9cfc7',
  },
  homeRandomModeGhostText: {
    marginTop: 2,
    fontSize: 16,
    fontWeight: '900',
    color: '#ffffff',
  },
  homeAllRandomButton: {
    flex: 1.14,
    minHeight: 62,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
    backgroundColor: ORANGE,
    shadowColor: ORANGE,
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  homeAllRandomButtonSub: {
    fontSize: 11,
    fontWeight: '900',
    color: '#ffe7da',
  },
  homeAllRandomButtonText: {
    marginTop: 2,
    fontSize: 19,
    fontWeight: '900',
    color: '#ffffff',
  },
  homeSubsection: {
    marginTop: 24,
  },
  homeSubsectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  homeSubsectionIcon: {
    fontSize: 29,
    color: INK,
    fontWeight: '900',
  },
  homeSubsectionTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '900',
    color: INK,
  },
  homeSectionSeeAll: {
    fontSize: 13,
    fontWeight: '900',
    color: ORANGE,
  },
  homeFavoriteWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
  },
  homeExplorePrefectureButton: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: INK,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
  },
  homeExploreIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  homeExploreBody: {
    flex: 1,
  },
  homeExploreTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '900',
    color: '#ffffff',
  },
  homeExploreText: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 17,
    fontWeight: '800',
    color: '#ffe7da',
  },
  homePrefecturePrompt: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: '#fffdf9',
    borderWidth: 1,
    borderColor: '#ffd7c6',
  },
  homePrefecturePromptText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '800',
    color: '#756b60',
  },
  homeFavoriteChip: {
    minHeight: 40,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: '#fffdf9',
    borderWidth: 1,
    borderColor: LINE,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  homeFavoriteChipActive: {
    backgroundColor: '#fff2ea',
    borderColor: ORANGE,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
  },
  homeFavoritePin: {
    width: 25,
    height: 34,
    alignItems: 'center',
    justifyContent: 'flex-start',
    position: 'relative',
  },
  homeFavoritePinActive: {
    opacity: 1,
  },
  homeFavoritePinDot: {
    width: 25,
    height: 25,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: '#3d3a37',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  homeFavoritePinDotActive: {
    borderColor: '#ffffff',
  },
  homeFavoritePinHole: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#3d3a37',
  },
  homeFavoritePinHoleActive: {
    borderColor: '#ffffff',
  },
  homeFavoritePinNeedle: {
    width: 12,
    height: 12,
    marginTop: -7,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderColor: '#3d3a37',
    transform: [{ rotate: '45deg' }],
  },
  homeFavoritePinNeedleActive: {
    borderColor: '#ffffff',
  },
  homeFavoritePinBase: {
    width: 14,
    height: 3,
    marginTop: 5,
    borderRadius: 2,
    backgroundColor: ORANGE,
  },
  homeFavoritePinBaseActive: {
    backgroundColor: '#ffffff',
  },
  homeFavoriteText: {
    fontSize: 14,
    fontWeight: '900',
    color: INK,
  },
  homeFavoriteTextActive: {
    color: ORANGE,
  },
  homeFavoriteChipIcon: {
    fontSize: 17,
    fontWeight: '900',
    color: '#54504b',
  },
  homeRegionList: {
    overflow: 'hidden',
    borderRadius: 18,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: LINE,
  },
  homeRegionBlock: {
    borderTopWidth: 1,
    borderTopColor: LINE,
  },
  homeRegionBlockFirst: {
    borderTopWidth: 0,
  },
  homeRegionBlockLast: {
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
  },
  homeRegionRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: '#ffffff',
  },
  homeRegionRowActive: {
    backgroundColor: '#fff8f3',
  },
  homeRegionIconFrame: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderRadius: 12,
    backgroundColor: '#fbf7f1',
    borderWidth: 1,
    borderColor: '#f2dfcf',
  },
  homeRegionIconFrameActive: {
    backgroundColor: '#fff0e9',
    borderColor: '#ffd3c2',
  },
  homeRegionName: {
    fontSize: 15,
    fontWeight: '900',
    color: INK,
  },
  homeRegionNameActive: {
    color: ORANGE,
  },
  homeRegionMeta: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '800',
    color: '#8a8178',
  },
  homePrefectureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
    paddingHorizontal: 14,
    paddingTop: 2,
    paddingBottom: 14,
    backgroundColor: '#fffdfb',
  },
  homePrefecturePill: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 10,
    paddingRight: 12,
    borderRadius: 999,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: LINE,
  },
  homePrefecturePillActive: {
    backgroundColor: '#fff8f3',
    borderColor: ORANGE,
  },
  homePrefectureList: {
    overflow: 'hidden',
    borderRadius: 22,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: LINE,
  },
  homePrefectureRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    borderTopWidth: 1,
    borderTopColor: LINE,
  },
  homePrefectureRowFirst: {
    borderTopWidth: 0,
  },
  homePrefectureRowLast: {
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
  },
  homePrefectureRowActive: {
    backgroundColor: '#fff7f1',
  },
  homePrefectureIconFrame: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: 20,
    backgroundColor: '#fbfaf8',
    borderWidth: 1,
    borderColor: '#eee6dd',
    marginRight: 10,
  },
  homePrefectureIconFrameActive: {
    backgroundColor: '#fff0e9',
    borderColor: '#ffd3c2',
  },
  homePrefectureAssetIcon: {
    width: 30,
    height: 30,
  },
  homePrefectureIcon: {
    width: 30,
    height: 30,
    textAlign: 'center',
    textAlignVertical: 'center',
  },
  homePrefectureName: {
    fontSize: 17,
    fontWeight: '900',
    color: INK,
  },
  homePrefectureNameActive: {
    color: ORANGE,
  },
  homePrefectureRegion: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '800',
    color: '#8a8178',
  },
  homePrefectureArrow: {
    fontSize: 22,
    fontWeight: '900',
    color: INK,
  },
  homePrefectureArrowActive: {
    color: ORANGE,
  },
  homeAreaList: {
    overflow: 'hidden',
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#ded8d1',
  },
  recommendAreaList: {
    gap: 12,
    paddingRight: 18,
  },
  recommendAreaCard: {
    width: 170,
    height: 156,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    padding: 14,
    borderRadius: 18,
    position: 'relative',
  },
  recommendAreaRoad: {
    position: 'absolute',
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.42)',
  },
  recommendAreaRoadOne: {
    width: 190,
    top: 38,
    left: -20,
    transform: [{ rotate: '25deg' }],
  },
  recommendAreaRoadTwo: {
    width: 160,
    top: 80,
    left: 30,
    transform: [{ rotate: '-18deg' }],
  },
  recommendAreaShade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 78,
    backgroundColor: 'rgba(0,0,0,0.34)',
  },
  recommendAreaName: {
    fontSize: 20,
    fontWeight: '900',
    color: '#ffffff',
  },
  recommendAreaCopy: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '800',
    color: '#ffffff',
  },
  recommendAreaDistance: {
    marginTop: 7,
    fontSize: 11,
    fontWeight: '800',
    color: '#ffffff',
  },
  homeAreaRow: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee8e2',
  },
  homeAreaRowIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    textAlign: 'center',
    lineHeight: 30,
    color: ORANGE,
    backgroundColor: '#fff1e8',
    fontWeight: '900',
  },
  homeAreaRowDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#fff1e8',
    borderWidth: 8,
    borderColor: ORANGE,
  },
  homeAreaRowBody: {
    flex: 1,
  },
  homeAreaRowName: {
    fontSize: 17,
    fontWeight: '900',
    color: INK,
  },
  homeAreaRowMeta: {
    marginTop: 3,
    fontSize: 11,
    fontWeight: '700',
    color: '#8a8175',
  },
  homeAreaChevron: {
    fontSize: 30,
    color: '#8c8982',
  },
  homeLocationButton: {
    minHeight: 66,
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderRadius: 22,
    backgroundColor: ORANGE,
    shadowColor: ORANGE,
    shadowOpacity: 0.24,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  homeLocationButtonIcon: {
    fontSize: 24,
    color: '#ffffff',
    lineHeight: 26,
  },
  homeLocationButtonText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#ffffff',
  },
  homeQuickFilters: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 24,
  },
  homeQuickFilter: {
    flex: 1,
    minHeight: 76,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#eee6de',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  homeQuickFilterSmall: {
    width: 84,
    minHeight: 76,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#eee6de',
  },
  homeQuickIcon: {
    fontSize: 21,
    fontWeight: '900',
    color: ORANGE,
  },
  homeQuickLabel: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '900',
    color: INK,
    textAlign: 'center',
  },
  homeQuickSmallLabel: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '900',
    color: INK,
    textAlign: 'center',
  },
  homeQuickChevron: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '900',
    color: '#8c8982',
  },
  filterPanel: {
    marginTop: 18,
    padding: 16,
    borderRadius: 26,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: LINE,
  },
  filterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  panelTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: INK,
  },
  refreshButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#fff2e8',
  },
  refreshButtonText: {
    fontSize: 12,
    fontWeight: '900',
    color: ORANGE,
  },
  locationField: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: '#f8f3eb',
    borderWidth: 1,
    borderColor: '#efe4d6',
  },
  fieldIcon: {
    color: ORANGE,
    fontSize: 18,
    fontWeight: '900',
  },
  locationInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    color: INK,
  },
  areaPicker: {
    marginTop: 14,
  },
  areaPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  areaPickerTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: INK,
  },
  areaPickerMeta: {
    fontSize: 11,
    fontWeight: '900',
    color: '#9b9184',
  },
  areaSearchBox: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 13,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#eadfca',
    marginBottom: 10,
  },
  areaSearchIcon: {
    fontSize: 18,
    fontWeight: '900',
    color: ORANGE,
  },
  areaSearchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    color: INK,
  },
  areaSearchClear: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8f3eb',
  },
  areaSearchClearText: {
    fontSize: 17,
    fontWeight: '900',
    color: '#8a8175',
  },
  areaGroupStrip: {
    gap: 10,
    paddingRight: 16,
  },
  prefectureStrip: {
    gap: 8,
    paddingRight: 16,
    paddingBottom: 10,
  },
  prefectureChip: {
    minHeight: 38,
    paddingHorizontal: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#eadfca',
  },
  prefectureChipActive: {
    backgroundColor: INK,
    borderColor: INK,
  },
  prefectureChipText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#6f665c',
  },
  prefectureChipTextActive: {
    color: '#ffffff',
  },
  areaGroup: {
    width: '100%',
    padding: 12,
    borderRadius: 20,
    backgroundColor: '#f8f3eb',
    borderWidth: 1,
    borderColor: '#efe4d6',
  },
  areaGroupTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#8a8175',
    marginBottom: 8,
  },
  areaChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  areaChip: {
    minHeight: 34,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#eadfca',
  },
  areaChipActive: {
    backgroundColor: INK,
    borderColor: INK,
  },
  areaChipText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#6f665c',
  },
  areaChipTextActive: {
    color: '#ffffff',
  },
  areaResultCard: {
    width: '48.5%',
    minHeight: 66,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#eadfca',
  },
  areaResultName: {
    fontSize: 15,
    fontWeight: '900',
    color: INK,
  },
  areaResultGroup: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: '800',
    color: '#8a8175',
  },
  areaNoResult: {
    paddingVertical: 8,
    fontSize: 13,
    fontWeight: '800',
    color: '#8a8175',
  },
  genreStrip: {
    gap: 10,
    paddingVertical: 16,
  },
  genreGridTwo: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 8,
    paddingTop: 10,
    paddingBottom: 14,
  },
  genreChip: {
    width: '31.8%',
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    overflow: 'hidden',
    paddingLeft: 6,
    paddingRight: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#eee5d8',
  },
  genreIconChip: {
    width: 26,
    height: 26,
    marginRight: 5,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: 999,
    borderWidth: 1,
  },
  genreChipImage: {
    width: 18,
    height: 18,
    opacity: 0.76,
  },
  genreChipImageActive: {
    opacity: 1,
  },
  genreChipText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '900',
    color: INK,
  },
  showAllGenresButton: {
    minHeight: 48,
    marginTop: -4,
    marginBottom: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: '#191512',
  },
  showAllGenresText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#ffffff',
  },
  filterGrid: {
    gap: 10,
  },
  genreSectionHeader: {
    marginTop: 16,
    marginBottom: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  genreSectionTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#7b7064',
  },
  smallField: {
    padding: 14,
    borderRadius: 20,
    backgroundColor: '#f8f3eb',
  },
  fieldHeaderRow: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  smallFieldLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: '#7b7064',
  },
  randomMiniButton: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    borderRadius: 999,
    backgroundColor: '#fff8f1',
    borderWidth: 1,
    borderColor: '#f2decc',
  },
  randomMiniButtonActive: {
    backgroundColor: ORANGE,
    borderColor: ORANGE,
    shadowColor: ORANGE,
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
  },
  randomMiniButtonText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '900',
    color: ORANGE,
  },
  randomMiniButtonTextActive: {
    color: '#ffffff',
  },
  smallFieldRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  randomHiddenInput: {
    minHeight: 28,
    justifyContent: 'center',
  },
  randomHiddenInputText: {
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '900',
    color: INK,
  },
  smallInput: {
    flex: 1,
    padding: 0,
    fontSize: 20,
    fontWeight: '900',
    color: INK,
  },
  smallSuffix: {
    fontSize: 13,
    fontWeight: '900',
    color: '#8b8175',
  },
  segmentWrap: {
    padding: 14,
    borderRadius: 20,
    backgroundColor: '#f8f3eb',
  },
  segmentGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 10,
  },
  segment: {
    minWidth: 58,
    minHeight: 38,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#ffffff',
  },
  segmentActive: {
    backgroundColor: INK,
  },
  segmentText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#7b7064',
  },
  segmentTextActive: {
    color: '#ffffff',
  },
  bigDecisionButton: {
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  bigDecisionButtonPrimary: {
    flex: 1,
    minHeight: 76,
    backgroundColor: ORANGE,
    shadowColor: ORANGE,
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  bigDecisionButtonRandom: {
    width: 116,
    minHeight: 76,
    gap: 5,
    backgroundColor: INK,
  },
  bigDecisionSmall: {
    fontSize: 12,
    fontWeight: '900',
    color: '#ffe7dc',
  },
  bigDecisionText: {
    marginTop: 4,
    fontSize: 22,
    fontWeight: '900',
    color: '#ffffff',
  },
  allRandomDecisionText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
    color: '#ffffff',
    textAlign: 'center',
  },
  decisionSummary: {
    marginTop: 16,
    flexDirection: 'row',
    gap: 7,
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#fbf6ef',
    borderWidth: 1,
    borderColor: LINE,
  },
  decisionSummaryChip: {
    flex: 1,
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 9,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#eee4d8',
  },
  decisionSummaryLabel: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '900',
    color: '#9a9084',
  },
  decisionSummaryValue: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '900',
    color: INK,
  },
  decisionActionRow: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 10,
  },
  notice: {
    marginTop: 16,
    flexDirection: 'row',
    gap: 8,
    padding: 15,
    borderRadius: 20,
    backgroundColor: '#fff7db',
    borderWidth: 1,
    borderColor: '#f5dfa5',
  },
  noticeDot: {
    color: ORANGE,
    fontSize: 10,
    marginTop: 4,
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '800',
    color: '#645b4b',
  },
  hotpepperCredit: {
    alignSelf: 'flex-end',
    marginTop: 14,
    marginBottom: 2,
    width: 100,
    height: 45,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    borderRadius: 7,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: LINE,
  },
  hotpepperCreditCompact: {
    marginTop: 14,
    marginBottom: 0,
    marginLeft: 'auto',
  },
  hotpepperCreditImage: {
    width: 88,
    height: 35,
  },
  currentLocationCard: {
    marginTop: 12,
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    borderRadius: 22,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: LINE,
  },
  currentLocationIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    textAlign: 'center',
    lineHeight: 38,
    color: ORANGE,
    backgroundColor: '#fff2e8',
    fontSize: 18,
    fontWeight: '900',
  },
  currentLocationBody: {
    flex: 1,
  },
  currentLocationTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: INK,
  },
  currentLocationText: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '700',
    color: '#81776b',
  },
  currentLocationAction: {
    fontSize: 12,
    fontWeight: '900',
    color: ORANGE,
  },
  sectionHeader: {
    marginTop: 28,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: INK,
  },
  sectionAction: {
    fontSize: 13,
    fontWeight: '900',
    color: '#8a8175',
  },
  horizontalList: {
    gap: 14,
    paddingRight: 18,
    paddingBottom: 4,
  },
  candidateCard: {
    width: 214,
    overflow: 'hidden',
    borderRadius: 26,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: '#eee5dc',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  candidateImageWrap: {
    height: 146,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#fff1e8',
  },
  candidateShade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 68,
    backgroundColor: 'rgba(0,0,0,0.20)',
  },
  candidateTopBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.94)',
  },
  candidateTopBadgeText: {
    fontSize: 12,
    fontWeight: '900',
    color: ORANGE,
  },
  candidateGenreBadge: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(23,20,17,0.78)',
  },
  candidateGenreText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#ffffff',
  },
  candidateBody: {
    padding: 12,
  },
  candidateName: {
    fontSize: 17,
    fontWeight: '900',
    color: INK,
  },
  candidateMeta: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '800',
    color: '#83796d',
  },
  candidateInfoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  candidateInfoPill: {
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#f8f3eb',
    fontSize: 11,
    fontWeight: '900',
    color: '#675f55',
  },
  pageIntro: {
    marginBottom: 16,
  },
  pageTitle: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '900',
    color: INK,
  },
  pageLead: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 23,
    fontWeight: '700',
    color: '#756b60',
  },
  apiCard: {
    marginBottom: 16,
    padding: 14,
    borderRadius: 20,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: LINE,
  },
  apiLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: '#8a8175',
  },
  apiInput: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '800',
    color: INK,
  },
  drawStage: {
    minHeight: 430,
    paddingTop: 18,
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderRadius: 26,
    overflow: 'hidden',
    backgroundColor: '#171411',
    borderWidth: 1,
    borderColor: '#2a241f',
    shadowColor: ORANGE,
    shadowOpacity: 0.2,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 16 },
  },
  drawStageLoading: {
    borderColor: ORANGE,
  },
  drawConditionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: LINE,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
  },
  conditionPill: {
    minHeight: 32,
    flexShrink: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 9,
    borderRadius: 999,
    backgroundColor: '#f4eee7',
  },
  conditionPillActive: {
    backgroundColor: ORANGE,
  },
  conditionPillText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '900',
    color: INK,
  },
  conditionPillTextActive: {
    color: '#ffffff',
  },
  rouletteButton: {
    minHeight: 354,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 28,
    position: 'relative',
  },
  rouletteStatusPill: {
    zIndex: 5,
    alignSelf: 'center',
    marginBottom: 10,
  },
  rouletteStatusText: {
    fontSize: 13,
    letterSpacing: 1.2,
    fontWeight: '900',
    color: ORANGE,
  },
  dart: {
    position: 'absolute',
    top: 0,
    zIndex: 4,
    alignItems: 'center',
  },
  dartNeedle: {
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderTopWidth: 32,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: ORANGE,
  },
  dartTail: {
    width: 25,
    height: 14,
    marginTop: -2,
    borderRadius: 7,
    backgroundColor: '#fff3e9',
    borderWidth: 3,
    borderColor: ORANGE,
  },
  rouletteHalo: {
    position: 'absolute',
    top: 28,
    width: 242,
    height: 242,
    borderRadius: 121,
    backgroundColor: 'rgba(240,90,40,0.12)',
    shadowColor: ORANGE,
    shadowOpacity: 0.45,
    shadowRadius: 36,
    shadowOffset: { width: 0, height: 0 },
  },
  rouletteWheel: {
    width: 226,
    height: 226,
    borderRadius: 113,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#f5efe3',
    borderWidth: 8,
    borderColor: '#fff7ea',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  rouletteMapTint: {
    position: 'absolute',
    width: 226,
    height: 226,
    borderRadius: 113,
    backgroundColor: '#f7f2e8',
  },
  rouletteDivider: {
    position: 'absolute',
    width: 2,
    height: 226,
    backgroundColor: 'rgba(255,255,255,0.86)',
    zIndex: 2,
  },
  rouletteDividerVertical: {
    transform: [{ rotate: '0deg' }],
  },
  rouletteDividerHorizontal: {
    transform: [{ rotate: '90deg' }],
  },
  rouletteDividerDiagonalOne: {
    transform: [{ rotate: '45deg' }],
  },
  rouletteDividerDiagonalTwo: {
    transform: [{ rotate: '-45deg' }],
  },
  rouletteGridLineVertical: {
    position: 'absolute',
    width: 2,
    height: 226,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  rouletteGridLineHorizontal: {
    position: 'absolute',
    width: 226,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  mapRoad: {
    position: 'absolute',
    height: 15,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    opacity: 0.92,
    borderWidth: 1,
    borderColor: '#ece5d9',
    zIndex: 3,
  },
  mapRoadOne: {
    width: 213,
    top: 73,
    left: -12,
    transform: [{ rotate: '23deg' }],
  },
  mapRoadTwo: {
    width: 184,
    top: 115,
    left: 25,
    backgroundColor: '#f8d47a',
    borderColor: '#ecc866',
    transform: [{ rotate: '-18deg' }],
  },
  mapRoadThree: {
    width: 173,
    top: 151,
    left: -18,
    transform: [{ rotate: '62deg' }],
  },
  mapPark: {
    position: 'absolute',
    borderRadius: 18,
    backgroundColor: '#dff1d8',
    opacity: 0.92,
    zIndex: 1,
  },
  mapParkOne: {
    width: 72,
    height: 49,
    top: 31,
    left: 31,
    transform: [{ rotate: '-18deg' }],
  },
  mapParkTwo: {
    width: 78,
    height: 52,
    right: 18,
    bottom: 28,
    transform: [{ rotate: '15deg' }],
  },
  mapPin: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: '#ffffff',
    zIndex: 6,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  roulettePocket: {
    position: 'absolute',
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ffffff',
    zIndex: 7,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  roulettePocketText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#ffffff',
  },
  rouletteLabelChip: {
    position: 'absolute',
    minWidth: 58,
    maxWidth: 78,
    height: 25,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: 1,
    borderColor: '#eadfca',
    zIndex: 8,
  },
  rouletteLabelTop: {
    top: 47,
    left: 84,
  },
  rouletteLabelRight: {
    top: 101,
    right: 20,
  },
  rouletteLabelBottom: {
    bottom: 42,
    left: 76,
  },
  rouletteLabelLeft: {
    top: 101,
    left: 20,
  },
  rouletteLabelText: {
    fontSize: 10,
    fontWeight: '900',
    color: INK,
  },
  wheelCore: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 5,
    borderColor: '#191512',
    zIndex: 9,
  },
  wheelLogo: {
    width: 28,
    height: 28,
    borderRadius: 8,
  },
  wheelCoreTitle: {
    marginTop: 2,
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '900',
    color: INK,
  },
  wheelCoreSub: {
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '900',
    color: '#8d8479',
  },
  lotteryMotionLayer: {
    position: 'absolute',
    top: 78,
    width: 226,
    height: 142,
    zIndex: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lotteryTicket: {
    position: 'absolute',
    width: 74,
    height: 112,
    borderRadius: 16,
    backgroundColor: '#fffaf3',
    borderWidth: 1,
    borderColor: '#eadfca',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
  },
  lotteryTicketBackLeft: {
    left: 50,
    top: 17,
    opacity: 0.84,
    transform: [{ rotate: '-13deg' }],
  },
  lotteryTicketBackRight: {
    right: 50,
    top: 17,
    opacity: 0.84,
    transform: [{ rotate: '13deg' }],
  },
  lotteryTicketFront: {
    width: 96,
    height: 128,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: ORANGE,
    shadowColor: ORANGE,
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
  },
  lotteryTicketLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    color: '#9b9184',
  },
  lotteryTicketTitle: {
    marginTop: 8,
    maxWidth: 64,
    textAlign: 'center',
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '900',
    color: INK,
  },
  shuffleMotionLayer: {
    position: 'absolute',
    top: 102,
    width: 252,
    height: 118,
    zIndex: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shuffleCard: {
    position: 'absolute',
    width: 104,
    height: 74,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#eadfca',
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
  },
  shuffleCardOne: {
    left: 18,
    top: 8,
  },
  shuffleCardTwo: {
    left: 74,
    top: 26,
    borderColor: '#ffd7c6',
  },
  shuffleCardThree: {
    right: 18,
    top: 8,
  },
  shuffleCardLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#9b9184',
  },
  shuffleCardValue: {
    marginTop: 5,
    fontSize: 17,
    fontWeight: '900',
    color: INK,
  },
  radarMotionLayer: {
    position: 'absolute',
    top: 34,
    width: 260,
    height: 260,
    zIndex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarRingOuter: {
    position: 'absolute',
    width: 252,
    height: 252,
    borderRadius: 126,
    borderWidth: 2,
    borderColor: '#ffb18f',
  },
  radarRingInner: {
    position: 'absolute',
    width: 178,
    height: 178,
    borderRadius: 89,
    borderWidth: 2,
    borderColor: '#fff0e8',
  },
  radarSweep: {
    position: 'absolute',
    top: 92,
    left: '50%',
    width: 4,
    height: 126,
    marginLeft: -2,
    zIndex: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(240,90,40,0.44)',
  },
  mapChoiceCard: {
    width: '92%',
    marginTop: 12,
    minHeight: 46,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 23,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#efe4d6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  rouletteHintRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 12,
  },
  rouletteHintText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#f7eee5',
  },
  rouletteHintAccent: {
    fontSize: 15,
    fontWeight: '900',
    color: ORANGE,
  },
  mapChoiceLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: '#9b9184',
  },
  mapChoiceValue: {
    maxWidth: 88,
    fontSize: 14,
    fontWeight: '900',
    color: INK,
  },
  mapChoiceDivider: {
    width: 1,
    height: 18,
    backgroundColor: '#eadfca',
    marginHorizontal: 2,
  },
  rouletteCardBack: {
    position: 'absolute',
    width: 214,
    height: 214,
    borderRadius: 36,
    backgroundColor: '#ffdfcf',
  },
  rouletteCard: {
    width: 226,
    minHeight: 226,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    borderRadius: 38,
    backgroundColor: '#ffffff',
  },
  rouletteLogo: {
    width: 96,
    height: 96,
    borderRadius: 25,
  },
  rouletteTitle: {
    marginTop: 22,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '900',
    color: '#fffaf3',
    textAlign: 'center',
  },
  rouletteCta: {
    width: '92%',
    minHeight: 52,
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderRadius: 26,
    backgroundColor: ORANGE,
    borderWidth: 2,
    borderColor: '#fff5ec',
    shadowColor: ORANGE,
    shadowOpacity: 0.38,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  rouletteCtaLocked: {
    backgroundColor: '#5f5a54',
    borderColor: '#d8cec3',
    shadowOpacity: 0.08,
  },
  rouletteCtaText: {
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: 0.4,
    fontWeight: '900',
    color: '#ffffff',
  },
  rouletteMessage: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
    color: '#d9cec2',
    textAlign: 'center',
  },
  resultWrap: {
    marginTop: 20,
  },
  resultKicker: {
    marginBottom: 10,
    fontSize: 12,
    fontWeight: '900',
    color: ORANGE,
  },
  resultCard: {
    overflow: 'hidden',
    borderRadius: 30,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: LINE,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  resultContent: {
    padding: 18,
  },
  resultName: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '900',
    color: INK,
  },
  resultDistanceBand: {
    minHeight: 112,
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: '#fffaf5',
    borderWidth: 1,
    borderColor: '#efe4d8',
  },
  resultDistanceList: {
    flex: 1,
    gap: 8,
  },
  resultDistanceItem: {
    minHeight: 42,
  },
  resultDistanceLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: '#8a8175',
  },
  resultDistanceValue: {
    marginTop: 2,
    fontSize: 21,
    lineHeight: 26,
    fontWeight: '900',
    color: INK,
  },
  resultDistanceValueMuted: {
    fontSize: 18,
    color: '#8a8175',
  },
  resultMapShortcut: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#ffd7c6',
  },
  resultMapShortcutText: {
    fontSize: 12,
    fontWeight: '900',
    color: ORANGE,
  },
  metaRow: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaPill: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#f8f3eb',
  },
  metaPillText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#675f55',
  },
  ratingRow: {
    marginTop: 12,
    gap: 4,
  },
  ratingText: {
    fontSize: 15,
    fontWeight: '900',
    color: ORANGE,
  },
  ratingTextPending: {
    color: '#8a8175',
  },
  openNowText: {
    alignSelf: 'flex-start',
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: '900',
  },
  openStatusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  openStatusDetail: {
    flexShrink: 1,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
    color: '#756b60',
  },
  openNowActiveText: {
    backgroundColor: '#e8f6ee',
    color: '#1f8a4c',
  },
  openNowInactiveText: {
    backgroundColor: '#f5eee8',
    color: '#8a6a55',
  },
  openNowUnknownText: {
    backgroundColor: '#f4eee7',
    color: '#756b60',
  },
  addressText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#756b60',
  },
  miniMapCard: {
    minHeight: 108,
    marginTop: 14,
    flexDirection: 'row',
    overflow: 'hidden',
    borderRadius: 22,
    backgroundColor: '#f8f3eb',
    borderWidth: 1,
    borderColor: '#eadfca',
  },
  miniMapCanvas: {
    width: 126,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#eef4ea',
  },
  miniMapRoad: {
    position: 'absolute',
    height: 13,
    borderRadius: 7,
    backgroundColor: '#ffffff',
  },
  miniMapRoadOne: {
    width: 152,
    top: 28,
    left: -18,
    transform: [{ rotate: '22deg' }],
  },
  miniMapRoadTwo: {
    width: 140,
    top: 66,
    left: 8,
    transform: [{ rotate: '-18deg' }],
  },
  miniMapRoadThree: {
    width: 118,
    top: 86,
    left: -20,
    transform: [{ rotate: '58deg' }],
  },
  miniMapPark: {
    position: 'absolute',
    width: 48,
    height: 34,
    right: 10,
    top: 12,
    borderRadius: 15,
    backgroundColor: '#d8edce',
  },
  miniMapPin: {
    position: 'absolute',
    top: 38,
    left: 52,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ORANGE,
    borderWidth: 4,
    borderColor: '#ffffff',
  },
  miniMapPinCore: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ffffff',
  },
  miniMapInfo: {
    flex: 1,
    padding: 14,
    justifyContent: 'center',
  },
  miniMapLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: '#7d7367',
  },
  miniMapDistance: {
    marginTop: 4,
    fontSize: 22,
    fontWeight: '900',
    color: INK,
  },
  miniMapAddress: {
    marginTop: 5,
    fontSize: 12,
    fontWeight: '700',
    color: '#81776b',
  },
  resultActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  primaryAction: {
    flex: 1,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: ORANGE,
  },
  primaryActionText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#ffffff',
  },
  secondaryAction: {
    flex: 1,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: LINE,
  },
  secondaryActionText: {
    fontSize: 15,
    fontWeight: '900',
    color: INK,
  },
  saveAction: {
    minHeight: 52,
    marginTop: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: '#191512',
  },
  saveActionText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#ffffff',
  },
  emptyPanel: {
    marginTop: 18,
    padding: 20,
    borderRadius: 24,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: LINE,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: INK,
  },
  emptyText: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '700',
    color: '#81776b',
  },
  analysisScreen: {
    paddingBottom: 8,
  },
  analysisHeader: {
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  analysisHeaderText: {
    flex: 1,
  },
  analysisBrand: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '900',
    letterSpacing: 1,
    color: ORANGE,
  },
  analysisAreaCopy: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
    color: '#666666',
  },
  analysisAreaPill: {
    height: 46,
    maxWidth: 124,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: LINE,
    backgroundColor: '#ffffff',
  },
  analysisAreaText: {
    marginLeft: 8,
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '900',
    color: INK,
  },
  analysisTitleBlock: {
    marginTop: 42,
  },
  analysisTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  analysisTitleBar: {
    width: 4,
    height: 34,
    borderRadius: 999,
    backgroundColor: ORANGE,
  },
  analysisTitle: {
    marginLeft: 14,
    fontSize: 38,
    lineHeight: 44,
    fontWeight: '900',
    color: INK,
  },
  analysisLead: {
    marginTop: 14,
    fontSize: 17,
    lineHeight: 25,
    fontWeight: '700',
    color: '#666666',
  },
  analysisFreeCard: {
    marginTop: 24,
    padding: 22,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: '#f0dfcf',
    backgroundColor: '#fffaf4',
  },
  analysisFreeTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  analysisFreeLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: ORANGE,
  },
  analysisFreeTitle: {
    marginTop: 8,
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '900',
    color: INK,
  },
  analysisFreeBadge: {
    minWidth: 58,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 17,
    backgroundColor: '#111111',
  },
  analysisFreeBadgeText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#ffffff',
  },
  analysisFreeAmount: {
    marginTop: 18,
    fontSize: 42,
    lineHeight: 50,
    fontWeight: '900',
    color: INK,
  },
  analysisFreeText: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '700',
    color: '#6d6258',
  },
  analysisSpendBars: {
    height: 138,
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  analysisSpendBarItem: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
  },
  analysisSpendBarAmount: {
    height: 20,
    fontSize: 10,
    fontWeight: '900',
    color: '#6d6258',
  },
  analysisSpendBarTrack: {
    width: '100%',
    flex: 1,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    borderRadius: 14,
    backgroundColor: '#efe5db',
  },
  analysisSpendBarFill: {
    width: '100%',
    minHeight: 0,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    backgroundColor: ORANGE,
  },
  analysisSpendBarLabel: {
    marginTop: 7,
    fontSize: 11,
    fontWeight: '900',
    color: '#6d6258',
  },
  analysisFreeMetaRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  analysisFreeMetaItem: {
    flex: 1,
    minHeight: 62,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: '#ffffff',
  },
  analysisFreeMetaLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#8f867d',
  },
  analysisFreeMetaValue: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '900',
    color: INK,
  },
  analysisPremiumHero: {
    marginTop: 24,
    minHeight: 210,
    overflow: 'hidden',
    padding: 24,
    borderRadius: 28,
    backgroundColor: '#111111',
    position: 'relative',
  },
  analysisPremiumLabel: {
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 1,
    color: '#ffc247',
  },
  analysisPremiumTitle: {
    marginTop: 22,
    fontSize: 34,
    lineHeight: 44,
    fontWeight: '900',
    color: '#ffffff',
  },
  analysisPremiumLead: {
    marginTop: 16,
    maxWidth: 300,
    fontSize: 15,
    lineHeight: 24,
    fontWeight: '700',
    color: '#eeeeee',
  },
  analysisBillingButton: {
    marginTop: 24,
    alignSelf: 'flex-start',
    height: 46,
    justifyContent: 'center',
    paddingHorizontal: 22,
    borderRadius: 23,
    backgroundColor: '#ffffff',
  },
  analysisBillingText: {
    fontSize: 15,
    fontWeight: '900',
    color: ORANGE,
  },
  analysisPremiumIcon: {
    position: 'absolute',
    right: 22,
    bottom: 22,
    opacity: 0.32,
  },
  analysisStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginTop: 22,
  },
  analysisStatCard: {
    width: '48%',
    minHeight: 132,
    padding: 18,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: LINE,
    backgroundColor: '#ffffff',
  },
  analysisStatLabel: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '800',
    color: '#555555',
  },
  analysisStatValue: {
    marginTop: 6,
    fontSize: 28,
    fontWeight: '900',
    color: INK,
  },
  analysisStatSub: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '700',
    color: '#888888',
  },
  analysisHistoryCard: {
    marginTop: 24,
    padding: 20,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: LINE,
    backgroundColor: '#ffffff',
  },
  analysisHistoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  analysisHistoryTitle: {
    flex: 1,
    fontSize: 23,
    lineHeight: 29,
    fontWeight: '900',
    color: INK,
  },
  analysisHistoryEmpty: {
    minHeight: 92,
    marginTop: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    borderRadius: 18,
    backgroundColor: '#f8f5f1',
  },
  analysisHistoryEmptyText: {
    marginTop: 8,
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '800',
    color: '#81776b',
  },
  analysisHistoryRow: {
    minHeight: 72,
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0e8de',
  },
  analysisHistoryDate: {
    width: 44,
    fontSize: 13,
    fontWeight: '900',
    color: ORANGE,
  },
  analysisHistoryBody: {
    flex: 1,
  },
  analysisHistoryName: {
    fontSize: 15,
    fontWeight: '900',
    color: INK,
  },
  analysisHistoryMeta: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '800',
    color: '#81776b',
  },
  analysisHistoryBudget: {
    width: 88,
    textAlign: 'right',
    fontSize: 14,
    fontWeight: '900',
    color: INK,
  },
  analysisGenreCard: {
    marginTop: 24,
    padding: 20,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: LINE,
    backgroundColor: '#ffffff',
  },
  analysisGenreHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  analysisGenreTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: INK,
  },
  analysisPremiumMark: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  analysisPremiumMarkText: {
    marginLeft: 6,
    fontSize: 14,
    fontWeight: '900',
    color: INK,
  },
  analysisGenreRail: {
    gap: 10,
    paddingTop: 18,
  },
  analysisGenrePill: {
    width: 72,
    height: 86,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: LINE,
    backgroundColor: '#ffffff',
  },
  analysisGenrePillActive: {
    borderColor: ORANGE,
    backgroundColor: ORANGE,
  },
  analysisGenreLabel: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: '900',
    color: INK,
  },
  analysisGenreLabelActive: {
    color: '#ffffff',
  },
  analysisInsightPanel: {
    marginTop: 22,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 22,
    borderRadius: 22,
    backgroundColor: '#faf6f2',
  },
  analysisInsightCopy: {
    flex: 1,
    marginLeft: 18,
  },
  analysisInsightTitle: {
    fontSize: 19,
    lineHeight: 25,
    fontWeight: '900',
    color: INK,
  },
  analysisInsightText: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '700',
    color: '#666666',
  },
  analysisInsightButton: {
    height: 42,
    marginTop: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
    backgroundColor: '#111111',
  },
  analysisInsightButtonText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#ffffff',
  },
  analyticsIntro: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    marginTop: 6,
    marginBottom: 22,
  },
  analyticsIntroBar: {
    width: 5,
    height: 44,
    borderRadius: 3,
    backgroundColor: ORANGE,
  },
  analyticsIntroTitle: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '900',
    color: INK,
  },
  analyticsIntroLead: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 23,
    fontWeight: '800',
    color: '#6f665c',
  },
  analyticsHero: {
    minHeight: 230,
    overflow: 'hidden',
    padding: 22,
    borderRadius: 24,
    backgroundColor: '#10100f',
    borderWidth: 1,
    borderColor: '#26231f',
    position: 'relative',
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
  },
  analyticsPlan: {
    fontSize: 13,
    fontWeight: '900',
    color: '#efb52d',
  },
  analyticsTitle: {
    marginTop: 22,
    maxWidth: 252,
    fontSize: 33,
    lineHeight: 41,
    fontWeight: '900',
    color: '#fffaf3',
  },
  analyticsLead: {
    marginTop: 18,
    maxWidth: 260,
    fontSize: 15,
    lineHeight: 26,
    fontWeight: '800',
    color: '#f1e7dc',
  },
  analyticsHeroArt: {
    position: 'absolute',
    right: 20,
    top: 42,
    width: 160,
    height: 150,
    opacity: 0.45,
  },
  analyticsLockBadge: {
    alignSelf: 'flex-start',
    marginTop: 18,
    paddingHorizontal: 21,
    paddingVertical: 13,
    borderRadius: 999,
    backgroundColor: '#ffffff',
  },
  analyticsLockText: {
    fontSize: 15,
    fontWeight: '900',
    color: ORANGE,
  },
  analyticsMiniBars: {
    position: 'absolute',
    right: 0,
    top: 0,
    width: 82,
    height: 58,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 7,
  },
  analyticsMiniBar: {
    width: 13,
    borderRadius: 3,
    backgroundColor: '#ffffff',
  },
  analyticsPie: {
    position: 'absolute',
    left: 30,
    top: 62,
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 30,
    borderWidth: 18,
    borderColor: '#ffffff',
  },
  analyticsPieHole: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#10100f',
  },
  analyticsLine: {
    position: 'absolute',
    right: 6,
    bottom: 0,
    width: 140,
    height: 70,
    borderBottomWidth: 4,
    borderLeftWidth: 0,
    borderColor: 'rgba(255,255,255,0.28)',
    transform: [{ rotate: '-8deg' }],
  },
  analyticsLineDot: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#ffffff',
  },
  analyticsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 14,
    marginTop: 18,
  },
  analyticsMetric: {
    width: '48.5%',
    minHeight: 126,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 22,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: '#eeeeee',
  },
  analyticsMetricIcon: {
    width: 48,
    textAlign: 'center',
    fontSize: 37,
    lineHeight: 44,
    fontWeight: '900',
    color: INK,
  },
  analyticsMetricBody: {
    flex: 1,
  },
  analyticsMetricLabel: {
    fontSize: 14,
    fontWeight: '900',
    color: INK,
  },
  analyticsMetricValue: {
    marginTop: 8,
    fontSize: 25,
    fontWeight: '900',
    color: INK,
  },
  analyticsMetricFoot: {
    marginTop: 9,
    fontSize: 12,
    fontWeight: '800',
    color: '#8a8175',
  },
  analyticsChartCard: {
    marginTop: 20,
    padding: 20,
    borderRadius: 24,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: '#eeeeee',
  },
  analyticsChartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  analyticsChartTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: INK,
  },
  analyticsChartMeta: {
    fontSize: 14,
    fontWeight: '900',
    color: INK,
  },
  analyticsGenreRail: {
    gap: 10,
    paddingTop: 18,
    paddingBottom: 2,
  },
  analyticsGenreCard: {
    width: 84,
    height: 92,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#eeeeee',
  },
  analyticsGenreIcon: {
    width: 45,
    height: 45,
  },
  analyticsGenreGridIcon: {
    fontSize: 35,
    fontWeight: '900',
    color: INK,
  },
  analyticsGenreLabel: {
    marginTop: 7,
    fontSize: 11,
    fontWeight: '900',
    color: INK,
  },
  analyticsPremiumPanel: {
    marginTop: 18,
    minHeight: 142,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#f7f7f6',
  },
  analyticsMagnifierArt: {
    width: 120,
    height: 96,
    position: 'relative',
  },
  analyticsMagnifierBars: {
    position: 'absolute',
    left: 0,
    bottom: 8,
    width: 86,
    height: 62,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  analyticsMagnifierBar: {
    width: 12,
    borderRadius: 3,
    backgroundColor: '#b8b8b8',
  },
  analyticsMagnifierCircle: {
    position: 'absolute',
    left: 43,
    top: 10,
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 5,
    borderColor: INK,
  },
  analyticsMagnifierHandle: {
    position: 'absolute',
    left: 88,
    top: 58,
    width: 38,
    height: 6,
    borderRadius: 3,
    backgroundColor: INK,
    transform: [{ rotate: '45deg' }],
  },
  analyticsPremiumCopy: {
    flex: 1,
  },
  analyticsPremiumTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '900',
    color: INK,
  },
  analyticsPremiumText: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '800',
    color: '#6f665c',
  },
  analyticsPremiumButton: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#000000',
  },
  analyticsPremiumButtonText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#ffffff',
  },
  analyticsBars: {
    height: 150,
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
  },
  analyticsBarTrack: {
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
    borderRadius: 14,
    backgroundColor: '#f8f3eb',
    overflow: 'hidden',
  },
  analyticsBarFill: {
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    backgroundColor: ORANGE,
  },
  premiumButton: {
    minHeight: 56,
    marginTop: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: ORANGE,
  },
  premiumButtonText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#ffffff',
  },
  mutedText: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '700',
    color: '#81776b',
  },
  restaurantCard: {
    flexDirection: 'row',
    gap: 13,
    padding: 12,
    marginBottom: 12,
    borderRadius: 26,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: '#eee5dc',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
  },
  restaurantThumbWrap: {
    overflow: 'hidden',
    borderRadius: 20,
    backgroundColor: '#fff1e8',
  },
  restaurantBody: {
    flex: 1,
    justifyContent: 'center',
  },
  restaurantTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  restaurantName: {
    flex: 1,
    fontSize: 17,
    fontWeight: '900',
    color: INK,
  },
  restaurantRating: {
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#fff1e8',
    fontSize: 11,
    fontWeight: '900',
    color: ORANGE,
  },
  restaurantRatingPending: {
    backgroundColor: '#f4eee7',
    color: '#756b60',
  },
  restaurantSub: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '800',
    color: '#756b60',
  },
  restaurantMeta: {
    marginTop: 5,
    fontSize: 12,
    fontWeight: '800',
    color: '#8b8175',
  },
  restaurantMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 9,
  },
  restaurantMetaPill: {
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#f8f3eb',
    fontSize: 11,
    fontWeight: '900',
    color: '#675f55',
  },
  restaurantNote: {
    marginTop: 12,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '700',
    color: '#6f665c',
  },
  restaurantVisual: {
    width: 76,
    height: 76,
    borderRadius: 20,
  },
  restaurantVisualLarge: {
    width: '100%',
    height: 184,
    borderRadius: 0,
  },
  restaurantVisualFrame: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#efe6d9',
  },
  restaurantVisualPhoto: {
    width: '100%',
    height: '100%',
  },
  genreVisualGlow: {
    position: 'absolute',
    top: -28,
    left: -34,
    width: 210,
    height: 210,
    borderRadius: 105,
    opacity: 0.9,
  },
  genreVisualImage: {
    zIndex: 1,
  },
  genreVisualImageLarge: {
    width: 142,
    height: 142,
  },
  genreVisualImageSmall: {
    width: 52,
    height: 52,
  },
  genreVisualLabel: {
    position: 'absolute',
    right: 14,
    top: 14,
    zIndex: 3,
    maxWidth: '58%',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.68)',
  },
  genreVisualLabelText: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '900',
  },
  hotpepperImageCredit: {
    position: 'absolute',
    left: 10,
    bottom: 8,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(23,20,17,0.72)',
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '800',
    color: '#ffffff',
  },
  footer: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 24,
    height: 74,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderRadius: 28,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: LINE,
    shadowColor: '#000',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
  },
  footerItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  footerIconWrap: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  footerIconWrapActive: {
    backgroundColor: 'transparent',
  },
  footerIcon: {
    width: 30,
    height: 30,
  },
  footerIconInactive: {
    opacity: 0.38,
  },
  footerLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: '#9a9187',
  },
  footerLabelActive: {
    color: ORANGE,
  },
});
