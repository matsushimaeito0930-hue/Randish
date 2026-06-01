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
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

type AppStage = 'splash' | 'login' | 'main';
type TabKey = 'home' | 'search' | 'random' | 'save' | 'analytics';

type Restaurant = ApiRestaurant & {
  priceRange?: string;
  latitude?: number;
  longitude?: number;
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

type AreaPreset = {
  label: string;
  group: string;
  latitude: number;
  longitude: number;
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

const APP_USER_ID = 'guest';
const API_PORT = '8080';
const STATIC_FALLBACK_API_BASE_URL = 'http://10.230.36.60:8080';
const LOCAL_API_BASE_URLS = ['http://localhost:8080', 'http://127.0.0.1:8080', 'http://10.0.2.2:8080'];
const TETHER_HOST_PATTERN = /^http:\/\/10\.230\.36\.\d+(?::8080)?$/;
const RANDISH_LOGO = require('./assets/randish-logo-square1.png');

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
  ?? STATIC_FALLBACK_API_BASE_URL;

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
  uniqueApiBaseUrls([primaryBaseUrl, runtimeBaseUrl, ...LOCAL_API_BASE_URLS, STATIC_FALLBACK_API_BASE_URL]);

const shouldReplaceWithRuntimeApiBaseUrl = (currentBaseUrl: string, runtimeBaseUrl: string) => {
  const current = normalizeApiBaseUrl(currentBaseUrl);
  const runtime = normalizeApiBaseUrl(runtimeBaseUrl);
  return !current || (current !== runtime && (current === STATIC_FALLBACK_API_BASE_URL || TETHER_HOST_PATTERN.test(current)));
};

const ORANGE = '#f05a28';
const INK = '#171411';
const PAPER = '#ffffff';
const CARD = '#ffffff';
const LINE = '#ebe2d4';

const DISTANCE_OPTIONS = ['500m', '800m', '1km', '1.5km', '2km', '3km', '5km', '10km'];

const PREFECTURE_IMAGES: Record<string, ImageSourcePropType> = {
  北海道: require('./assets/prefecture/hokkaido.png'),
  青森県: require('./assets/prefecture/aomori.png'),
  岩手県: require('./assets/prefecture/iwate.png'),
  宮城県: require('./assets/prefecture/miyagi.png'),
  秋田県: require('./assets/prefecture/akita.png'),
  山形県: require('./assets/prefecture/yamagata.png'),
  福島県: require('./assets/prefecture/fukushima.png'),
  茨城県: require('./assets/prefecture/ibaraki.png'),
  栃木県: require('./assets/prefecture/tochigi.png'),
  群馬県: require('./assets/prefecture/gunma.png'),
  埼玉県: require('./assets/prefecture/saitama.png'),
  千葉県: require('./assets/prefecture/chiba.png'),
  東京都: require('./assets/prefecture/tokyo.png'),
  神奈川県: require('./assets/prefecture/kanagawa.png'),
  新潟県: require('./assets/prefecture/niigata.png'),
  富山県: require('./assets/prefecture/toyama.png'),
  石川県: require('./assets/prefecture/ishikawa.png'),
  福井県: require('./assets/prefecture/fukui.png'),
  山梨県: require('./assets/prefecture/yamanashi.png'),
  長野県: require('./assets/prefecture/nagano.png'),
  岐阜県: require('./assets/prefecture/gifu.png'),
  静岡県: require('./assets/prefecture/shizuoka.png'),
  愛知県: require('./assets/prefecture/aichi.png'),
  三重県: require('./assets/prefecture/mie.png'),
  滋賀県: require('./assets/prefecture/shiga.png'),
  京都府: require('./assets/prefecture/kyoto.png'),
  大阪府: require('./assets/prefecture/osaka.png'),
  兵庫県: require('./assets/prefecture/hyogo.png'),
  奈良県: require('./assets/prefecture/nara.png'),
  和歌山県: require('./assets/prefecture/wakayama.png'),
  鳥取県: require('./assets/prefecture/tottori.png'),
  島根県: require('./assets/prefecture/shimane.png'),
  岡山県: require('./assets/prefecture/okayama.png'),
  広島県: require('./assets/prefecture/hiroshima.png'),
  山口県: require('./assets/prefecture/yamaguchi.png'),
  徳島県: require('./assets/prefecture/tokushima.png'),
  香川県: require('./assets/prefecture/kagawa.png'),
  愛媛県: require('./assets/prefecture/ehime.png'),
  高知県: require('./assets/prefecture/kochi.png'),
  福岡県: require('./assets/prefecture/fukuoka.png'),
  佐賀県: require('./assets/prefecture/saga.png'),
  長崎県: require('./assets/prefecture/nagasaki.png'),
  熊本県: require('./assets/prefecture/kumamoto.png'),
  大分県: require('./assets/prefecture/oita.png'),
  宮崎県: require('./assets/prefecture/miyazaki.png'),
  鹿児島県: require('./assets/prefecture/kagoshima.png'),
  沖縄県: require('./assets/prefecture/okinawa.png'),
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

const normalizeRestaurant = (restaurant: ApiRestaurant): Restaurant => {
  const locationSource = restaurant as ApiRestaurant & {
    latitude?: number;
    longitude?: number;
    lat?: number;
    lng?: number;
  };

  return {
    ...restaurant,
    latitude: locationSource.latitude ?? locationSource.lat,
    longitude: locationSource.longitude ?? locationSource.lng,
    rating: restaurant.googleRating ?? restaurant.rating,
    priceRange: formatPrice(restaurant),
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
  return restaurant.minutes ? `徒歩約${restaurant.minutes}分` : '距離を計算中';
};

const getPresetPrefecture = (preset: AreaPreset) => preset.group.split('/')[0].trim();

const getAreaPresetKey = (preset: AreaPreset) => `${preset.group}-${preset.label}`;

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

const getAreaPreset = (area: string) => AREA_PRESETS.find((preset) => preset.label === area);

const getRestaurantAreaLabel = (restaurant: Restaurant) => {
  const source = `${restaurant.area} ${restaurant.address} ${restaurant.name}`;
  const matchedPreset = AREA_PRESETS.find((preset) => preset.label !== '現在地' && source.includes(preset.label));
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

  const preset = AREA_PRESETS.find((item) => item.label === cleanArea);
  if (!preset) {
    return cleanArea;
  }

  // API検索では都道府県と市区町村も添えて、同名エリアの誤爆を減らす。
  const group = preset.group.replace(/\s*\/\s*/g, ' ');
  return `${group} ${preset.label}`;
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
  const safeArea = area?.trim() && area !== '現在地' ? area.trim() : '現在地周辺';
  const selectedGenre = genre && genre !== 'すべて' ? genre : '和食';
  const latitude = preset && preset.latitude !== 0 ? preset.latitude : 34.7025;
  const longitude = preset && preset.longitude !== 0 ? preset.longitude : 135.4959;
  const addressPrefix = preset?.group ? `${preset.group.replace(' / ', '')}${safeArea}` : safeArea;

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
  const filtered = MOCK_RESTAURANTS.filter((restaurant) => {
    const genreMatch = genre === 'すべて' || restaurant.genre === genre;
    const areaMatch = !area.trim() || area === '現在地' || restaurant.area.includes(area.trim());
    const budgetMatch = restaurant.budgetMax >= min && restaurant.budgetMin <= max;
    return genreMatch && areaMatch && budgetMatch;
  });
  if (filtered.length) {
    return filtered;
  }
  return createAreaMockRestaurants(area, genre).filter((restaurant) => restaurant.budgetMax >= min && restaurant.budgetMin <= max);
};

export default function App() {
  const [stage, setStage] = useState<AppStage>('splash');
  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const runtimeApiBaseUrl = useMemo(getRuntimeApiBaseUrl, []);
  const [apiBaseUrl, setApiBaseUrl] = useState(runtimeApiBaseUrl);
  const [area, setArea] = useState('現在地');
  const [genre, setGenre] = useState('ラーメン');
  const [budgetMin, setBudgetMin] = useState('1000');
  const [budgetMax, setBudgetMax] = useState('3000');
  const [distance, setDistance] = useState('1.5km');
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);
  const [randomHistory, setRandomHistory] = useState<Restaurant[]>([]);
  const [savedRestaurants, setSavedRestaurants] = useState<Restaurant[]>([]);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [locationStatus, setLocationStatus] = useState('現在地を確認できます');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('条件を選んで、今日の一店を決めましょう。');

  const logoScale = useRef(new Animated.Value(0.88)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const spinValue = useRef(new Animated.Value(0)).current;
  const resultRevealValue = useRef(new Animated.Value(0)).current;
  const didAskLocation = useRef(false);

  useEffect(() => {
    setApiBaseUrl((current) => shouldReplaceWithRuntimeApiBaseUrl(current, runtimeApiBaseUrl) ? runtimeApiBaseUrl : current);
  }, [runtimeApiBaseUrl]);

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
      const coordinateSource =
        selectedPreset && selectedPreset.label !== '現在地'
          ? { latitude: selectedPreset.latitude, longitude: selectedPreset.longitude }
          : userLocation;

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

  const visibleRestaurants = restaurants;

  const loadRestaurants = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await randishApi.getRestaurants(apiBaseUrlCandidates, apiParams);
      syncWorkingApiBaseUrl();
      const normalized = data.map(normalizeRestaurant);
      setRestaurants(normalized);
      setMessage(normalized.length ? `${normalized.length}件から候補を整えました。` : 'この条件で見つかるお店がありませんでした。エリアやジャンルを変えてみてください。');
    } catch (error) {
      setRestaurants([]);
      const reason = error instanceof Error ? error.message : '通信エラー';
      setMessage(`APIに接続できませんでした。接続先: ${apiBaseUrlCandidates.join(' / ')} / ${reason}`);
    } finally {
      setIsLoading(false);
    }
  }, [apiBaseUrlCandidates, apiParams, area, budgetMax, budgetMin, genre, syncWorkingApiBaseUrl]);

  useEffect(() => {
    loadRestaurants();
  }, [loadRestaurants]);

  const requestCurrentLocation = useCallback(async () => {
    const Location = getOptionalLocationModule();
    if (!Location) {
      setLocationStatus('現在地取得には expo-location が必要です');
      return;
    }

    try {
      setLocationStatus('現在地を取得中...');
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setLocationStatus('位置情報の許可がオフです');
        return;
      }

      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const coords = {
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
      };
      let label = area;
      let prefecture: string | undefined;

      try {
        const places = await Location.reverseGeocodeAsync(coords);
        const place = places[0];
        label = place?.district || place?.city || place?.subregion || place?.name || area;
        prefecture =
          getPrefectureFromText(place?.region) ||
          getPrefectureFromText(`${place?.city ?? ''} ${place?.district ?? ''} ${place?.subregion ?? ''} ${place?.name ?? ''}`);
      } catch {
        label = area;
      }

      setUserLocation({ ...coords, label });
      setArea(label);
      setLocationStatus(formatLocationStatus(prefecture, label));
    } catch {
      setLocationStatus('現在地を取得できませんでした');
    }
  }, [area]);

  useEffect(() => {
    if (stage !== 'main' || didAskLocation.current) {
      return;
    }
    didAskLocation.current = true;
    requestCurrentLocation();
  }, [requestCurrentLocation, stage]);

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

  const revealSelectedRestaurant = useCallback(() => {
    resultRevealValue.setValue(0);
    Animated.spring(resultRevealValue, {
      toValue: 1,
      friction: 6,
      tension: 95,
      useNativeDriver: true,
    }).start();
  }, [resultRevealValue]);

  const chooseRandomRestaurant = useCallback(async () => {
    setActiveTab('random');
    setIsLoading(true);
    setMessage('候補カードをシャッフルしています。');
    runRandomAnimation();

    try {
      const data = await randishApi.chooseRandom(apiBaseUrlCandidates, {
        userId: APP_USER_ID,
        ...apiParams,
      });
      syncWorkingApiBaseUrl();
      const normalized = normalizeRestaurant(data);
      setSelectedRestaurant(normalized);
      setRandomHistory((current) => [normalized, ...current.filter((item) => item.id !== normalized.id)].slice(0, 8));
      setMessage('今日の一店が決まりました。');
      setTimeout(revealSelectedRestaurant, 180);
    } catch (error) {
      setSelectedRestaurant(null);
      const reason = error instanceof Error ? error.message : '通信エラー';
      setMessage(`APIから抽選できませんでした。接続先: ${apiBaseUrlCandidates.join(' / ')} / ${reason}`);
    } finally {
      setIsLoading(false);
    }
  }, [apiBaseUrlCandidates, apiParams, revealSelectedRestaurant, runRandomAnimation, syncWorkingApiBaseUrl, visibleRestaurants]);

  const chooseEverythingRandom = useCallback(async () => {
    setActiveTab('random');
    setIsLoading(true);
    setMessage('エリアもジャンルもおまかせでシャッフルしています。');
    runRandomAnimation();

    try {
      const data = await randishApi.chooseRandom(apiBaseUrlCandidates, {
        userId: APP_USER_ID,
      });
      syncWorkingApiBaseUrl();
      const normalized = normalizeRestaurant(data);
      setSelectedRestaurant(normalized);
      setRandomHistory((current) => [normalized, ...current.filter((item) => item.id !== normalized.id)].slice(0, 8));
      setMessage('ぜんぶおまかせで今日の一店が決まりました。');
      setTimeout(revealSelectedRestaurant, 180);
    } catch (error) {
      setSelectedRestaurant(null);
      const reason = error instanceof Error ? error.message : '通信エラー';
      setMessage(`全部ランダム抽選に失敗しました。接続先: ${apiBaseUrlCandidates.join(' / ')} / ${reason}`);
    } finally {
      setIsLoading(false);
    }
  }, [apiBaseUrlCandidates, revealSelectedRestaurant, runRandomAnimation, syncWorkingApiBaseUrl]);

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
      await randishApi.addFavorite(apiBaseUrlCandidates, APP_USER_ID, selectedRestaurant.id);
      syncWorkingApiBaseUrl();
      setMessage('保存しました。');
    } catch {
      setMessage('端末内に保存しました。API接続後はサーバー保存もできます。');
    }
  }, [apiBaseUrlCandidates, selectedRestaurant, syncWorkingApiBaseUrl]);

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
    setSelectedRestaurant(null);
  };

  const updateArea = (value: string) => {
    const preset = AREA_PRESETS.find((item) => item.label === value && item.label !== '現在地');
    if (preset) {
      setUserLocation({ latitude: preset.latitude, longitude: preset.longitude, label: preset.label });
      setLocationStatus(`${preset.group} / ${preset.label} 周辺から探します`);
    } else if (isPrefectureName(value)) {
      setLocationStatus(formatLocationStatus(value, '全域'));
    }
    setArea(value);
    setSelectedRestaurant(null);
  };

  const updateBudgetMin = (value: string) => {
    setBudgetMin(value);
    setSelectedRestaurant(null);
  };

  const updateBudgetMax = (value: string) => {
    setBudgetMax(value);
    setSelectedRestaurant(null);
  };

  const openRandomTab = () => {
    setActiveTab('random');
  };

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
    return <LoginScreen onStart={() => setStage('main')} />;
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="dark-content" />
      {activeTab !== 'home' && <AppHeader area={area} locationStatus={locationStatus} onLocationPress={requestCurrentLocation} />}
      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner} showsVerticalScrollIndicator={false}>
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
            onAreaChange={updateArea}
            onGenreChange={updateGenre}
            onBudgetMinChange={updateBudgetMin}
            onBudgetMaxChange={updateBudgetMax}
            onDistanceChange={setDistance}
            onLoadRestaurants={loadRestaurants}
            onOpenFilters={() => setActiveTab('search')}
            onOpenRandom={openRandomTab}
            onRandomPress={chooseRandomRestaurant}
            onAllRandomPress={chooseEverythingRandom}
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
            restaurants={visibleRestaurants}
            isLoading={isLoading}
            onApiBaseUrlChange={setApiBaseUrl}
            onAreaChange={updateArea}
            onGenreChange={updateGenre}
            onBudgetMinChange={updateBudgetMin}
            onBudgetMaxChange={updateBudgetMax}
            onDistanceChange={setDistance}
            onSearch={loadRestaurants}
            onRandomPress={chooseRandomRestaurant}
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
            userLocation={userLocation}
            history={randomHistory}
            spinValue={spinValue}
            resultRevealValue={resultRevealValue}
            onRandomPress={chooseRandomRestaurant}
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
            savedRestaurants={savedRestaurants}
            onAreaPress={() => setActiveTab('home')}
          />
        )}
      </ScrollView>
      <AppFooter activeTab={activeTab} onPress={setActiveTab} />
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

function LoginScreen({ onStart }: { onStart: () => void }) {
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [authNotice, setAuthNotice] = useState('');

  const handleRegister = () => {
    if (!acceptedTerms) {
      setAuthNotice('利用規約とプライバシーポリシーへの同意が必要です。');
      return;
    }
    onStart();
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
          />

          <RegisterLabel text="パスワード" />
          <TextInput
            style={styles.registerInput}
            placeholder="8文字以上の半角英数字"
            placeholderTextColor="#aaa"
            secureTextEntry
            textContentType="newPassword"
          />

          <RegisterLabel text="パスワード（確認）" />
          <TextInput
            style={styles.registerInput}
            placeholder="もう一度入力してください"
            placeholderTextColor="#aaa"
            secureTextEntry
            textContentType="newPassword"
          />

          <RegisterLabel text="ニックネーム" />
          <TextInput
            style={styles.registerInput}
            placeholder="例）ランディッシュ太郎"
            placeholderTextColor="#aaa"
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

          <Pressable style={styles.registerMainButton} onPress={handleRegister}>
            <Text style={styles.registerMainButtonText}>登録する</Text>
          </Pressable>
        </View>

        <Text style={styles.registerOr}>または</Text>

        <RegisterSocialButton text="Googleで登録" onPress={() => handleSocialPress('Google')} />
        <RegisterSocialButton text="Appleで登録" onPress={() => handleSocialPress('Apple')} />
        <RegisterSocialButton text="LINEで登録" onPress={() => handleSocialPress('LINE')} />

        <Pressable style={styles.registerLoginBox} onPress={onStart}>
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
            presets={AREA_PRESETS}
            history={history}
            locationStatus={locationStatus}
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
  onAreaChange: (value: string) => void;
  onOpenFilters: () => void;
  onLocationPress: () => void;
  onAllRandomPress: () => void;
  onConditionRandomPress: () => void;
  onSubmit: () => void;
}) {
  const [query, setQuery] = useState('');
  const [showAllFavorites, setShowAllFavorites] = useState(false);
  const selectedPreset = presets.find((preset) => preset.label === area);
  const selectedPrefecture = getPrefectureFromText(area) ?? (selectedPreset ? getPresetPrefecture(selectedPreset) : undefined) ?? getPrefectureFromText(locationStatus) ?? '北海道';
  const selectedRegion = getRegionGroupForPrefecture(selectedPrefecture) ?? AREA_REGION_GROUPS[0].label;
  const [expandedRegion, setExpandedRegion] = useState<string | null>(selectedRegion);
  const prefecturePresets = uniqueAreaPresets(presets.filter((preset) => getPresetPrefecture(preset) === selectedPrefecture && preset.label !== '現在地'));
  const prefecturePool = prefecturePresets.map((preset) => preset.label);
  const historyAreas = history
    .map(getRestaurantAreaLabel)
    .filter((label): label is string => Boolean(label))
    .filter((label) => {
      const preset = presets.find((item) => item.label === label);
      return preset ? getPresetPrefecture(preset) === selectedPrefecture : false;
    });
  const currentAreaLabel = selectedPreset && getPresetPrefecture(selectedPreset) === selectedPrefecture ? area : undefined;
  const favoriteAreas = Array.from(new Set([...(currentAreaLabel ? [currentAreaLabel] : []), ...historyAreas, ...prefecturePool, selectedPrefecture]))
    .filter((label) => label !== '現在地')
    .slice(0, showAllFavorites ? 24 : 8);
  const favoriteAreaTitle = `${selectedPrefecture}のエリア`;
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
    setExpandedRegion(selectedRegion);
  }, [selectedRegion]);

  const searchResults = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return [];
    }
    return uniqueAreaPresets(presets.filter((preset) => `${preset.group} ${preset.label}`.toLowerCase().includes(normalized))).slice(0, 6);
  }, [presets, query]);

  const pickArea = (value: string) => {
    onAreaChange(value);
    setQuery('');
  };

  const pickPrefecture = (value: string) => {
    pickArea(value);
    onOpenFilters();
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
      <Text style={styles.homeLocationTitle}>場所を選択</Text>
      <Text style={styles.homeLocationLead}>食べたいエリアを選んでください</Text>

      <View style={styles.homeSearchBox}>
        <Ionicons name="search" size={28} color={INK} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          style={styles.homeSearchInput}
          placeholder="駅名・エリア名で検索"
          placeholderTextColor="#a29b94"
        />
        <Pressable style={styles.homeSearchFilterButton} onPress={onOpenFilters}>
          <Ionicons name="options-outline" size={26} color={INK} />
        </Pressable>
      </View>

      {query.trim() ? (
        <View style={styles.homeSearchResults}>
          {searchResults.map((item, index) => (
            <Pressable key={`${getAreaPresetKey(item)}-${index}`} style={styles.homeAreaRow} onPress={() => pickArea(item.label)}>
              <View style={styles.homeAreaRowDot} />
              <View style={styles.homeAreaRowBody}>
                <Text style={styles.homeAreaRowName}>{item.label}</Text>
                <Text style={styles.homeAreaRowMeta}>{item.group}</Text>
              </View>
              <Text style={styles.homeAreaChevron}>›</Text>
            </Pressable>
          ))}
          {searchResults.length === 0 && <Text style={styles.areaNoResult}>該当エリアがありません</Text>}
        </View>
      ) : (
        <>
          <View style={styles.homeLocationCards}>
            <Pressable style={styles.homeCurrentCard} onPress={onLocationPress}>
              <View style={styles.homeCurrentBadge}>
                <Ionicons name="navigate" size={13} color="#ffffff" />
                <Text style={styles.homeCurrentBadgeText}>現在地</Text>
              </View>
              <View style={styles.homeCurrentBottom}>
                <View style={styles.homeCurrentTextWrap}>
                  <Text style={styles.homeCurrentTitle}>現在地を使う</Text>
                  <Text style={styles.homeCurrentText}>{locationStatus}</Text>
                </View>
              </View>
            </Pressable>
            <Pressable style={styles.homeMapPreview} onPress={onOpenFilters}>
              <Ionicons name="location-sharp" size={44} color={INK} />
              <View style={styles.homeMapBottom}>
                <Text style={styles.homeMapTitle}>地図から選ぶ</Text>
                <Text style={styles.homeMapLead}>地図を見ながら{'\n'}エリアを選択</Text>
              </View>
            </Pressable>
          </View>

          <View style={styles.homeSubsection}>
            <View style={styles.homeSubsectionHeader}>
              <Ionicons name="star-outline" size={28} color={INK} />
              <Text style={styles.homeSubsectionTitle}>{favoriteAreaTitle}</Text>
              <Pressable onPress={() => setShowAllFavorites((current) => !current)}>
                <Text style={styles.homeSectionSeeAll}>{showAllFavorites ? '閉じる' : 'すべて見る ＞'}</Text>
              </Pressable>
            </View>
            <View style={styles.homeFavoriteWrap}>
              {favoriteAreas.map((item, index) => (
                <Pressable key={`${item}-${index}`} style={[styles.homeFavoriteChip, area === item && styles.homeFavoriteChipActive]} onPress={() => pickArea(item)}>
                  {area === item && <Ionicons name="checkmark" size={20} color={ORANGE} />}
                  <Text style={[styles.homeFavoriteText, area === item && styles.homeFavoriteTextActive]}>{item}</Text>
                </Pressable>
              ))}
            </View>
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
                        <Text style={styles.homeRegionMeta}>{group.prefectures.length}都道府県から選択</Text>
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
  compact = false,
  showAreaPicker = true,
  onAreaChange,
  onGenreChange,
  onBudgetMinChange,
  onBudgetMaxChange,
  onDistanceChange,
  onSubmit,
}: {
  area: string;
  genre: string;
  budgetMin: string;
  budgetMax: string;
  distance: string;
  genres: GenreItem[];
  areaPresets: AreaPreset[];
  compact?: boolean;
  showAreaPicker?: boolean;
  onAreaChange: (value: string) => void;
  onGenreChange: (value: string) => void;
  onBudgetMinChange: (value: string) => void;
  onBudgetMaxChange: (value: string) => void;
  onDistanceChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const [showAllGenres, setShowAllGenres] = useState(!compact);
  const selectableGenres = compact ? genres.slice(1) : genres;
  const visibleGenres = showAllGenres ? selectableGenres : selectableGenres.slice(0, 12);

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
      <View style={styles.genreGridTwo}>
        {visibleGenres.map((item) => {
          const selected = genre === item.label;
          return (
            <Pressable
              key={item.label}
              style={[styles.genreChip, selected && { borderColor: item.color, backgroundColor: '#fff7ed' }]}
              onPress={() => onGenreChange(item.label)}
            >
              <Image source={item.image} style={styles.genreChipImage} resizeMode="contain" />
              <Text style={[styles.genreChipText, selected && { color: item.color }]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {selectableGenres.length > 12 && (
        <Pressable style={styles.showAllGenresButton} onPress={() => setShowAllGenres((current) => !current)}>
          <Text style={styles.showAllGenresText}>{showAllGenres ? 'ジャンルを少なく表示' : `すべてを表示（${selectableGenres.length}件）`}</Text>
        </Pressable>
      )}
      <View style={styles.filterGrid}>
        <SmallField label="最低予算" value={budgetMin} suffix="円" onChangeText={onBudgetMinChange} />
        <SmallField label="最高予算" value={budgetMax} suffix="円" onChangeText={onBudgetMaxChange} />
        <SegmentedValue label="距離" value={distance} values={DISTANCE_OPTIONS} onChange={onDistanceChange} />
      </View>
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
  const selectedPreset = presets.find((preset) => preset.label === selectedArea);
  const [areaQuery, setAreaQuery] = useState('');
  const [selectedPrefecture, setSelectedPrefecture] = useState(
    selectedPreset ? getPresetPrefecture(selectedPreset) : prefectures[0] ?? '現在地',
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
    return uniqueAreaPresets(presets.filter((preset) => `${preset.group} ${preset.label}`.toLowerCase().includes(query))).slice(0, 24);
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
          placeholder="例: 大阪 / 北区 / 梅田 / 渋谷"
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
              const selected = selectedArea === item.label;
              return (
                <Pressable
                  key={`${getAreaPresetKey(item)}-${index}`}
                  style={[styles.areaResultCard, selected && styles.areaChipActive]}
                  onPress={() => {
                    onSelect(item.label);
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
                const selected = selectedArea === item.label;
                return (
                  <Pressable key={`${getAreaPresetKey(item)}-${index}`} style={[styles.areaChip, selected && styles.areaChipActive]} onPress={() => onSelect(item.label)}>
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

function SmallField({ label, value, suffix, onChangeText }: { label: string; value: string; suffix: string; onChangeText: (value: string) => void }) {
  return (
    <View style={styles.smallField}>
      <Text style={styles.smallFieldLabel}>{label}</Text>
      <View style={styles.smallFieldRow}>
        <TextInput value={value} onChangeText={onChangeText} style={styles.smallInput} keyboardType="number-pad" />
        <Text style={styles.smallSuffix}>{suffix}</Text>
      </View>
    </View>
  );
}

function SegmentedValue({
  label,
  value,
  values,
  onChange,
}: {
  label: string;
  value: string;
  values: string[];
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.segmentWrap}>
      <Text style={styles.smallFieldLabel}>{label}</Text>
      <View style={styles.segmentGroup}>
        {values.map((item) => (
          <Pressable key={item} style={[styles.segment, value === item && styles.segmentActive]} onPress={() => onChange(item)}>
            <Text style={[styles.segmentText, value === item && styles.segmentTextActive]}>{item}</Text>
          </Pressable>
        ))}
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
  restaurants,
  isLoading,
  onApiBaseUrlChange,
  onAreaChange,
  onGenreChange,
  onBudgetMinChange,
  onBudgetMaxChange,
  onDistanceChange,
  onSearch,
  onRandomPress,
}: {
  apiBaseUrl: string;
  area: string;
  genre: string;
  budgetMin: string;
  budgetMax: string;
  distance: string;
  restaurants: Restaurant[];
  isLoading: boolean;
  onApiBaseUrlChange: (value: string) => void;
  onAreaChange: (value: string) => void;
  onGenreChange: (value: string) => void;
  onBudgetMinChange: (value: string) => void;
  onBudgetMaxChange: (value: string) => void;
  onDistanceChange: (value: string) => void;
  onSearch: () => void;
  onRandomPress: () => void;
}) {
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
        areaPresets={AREA_PRESETS}
        onAreaChange={onAreaChange}
        onGenreChange={onGenreChange}
        onBudgetMinChange={onBudgetMinChange}
        onBudgetMaxChange={onBudgetMaxChange}
        onDistanceChange={onDistanceChange}
        onSubmit={onSearch}
      />
      <Pressable style={styles.bigDecisionButton} onPress={onRandomPress}>
        <Text style={styles.bigDecisionSmall}>{isLoading ? '候補を確認中...' : `${restaurants.length}件から抽選`}</Text>
        <Text style={styles.bigDecisionText}>この条件で決める</Text>
      </Pressable>
      <SectionHeader title="候補一覧" action={`${restaurants.length}件`} />
      {restaurants.map((restaurant) => (
        <RestaurantCard key={restaurant.id} restaurant={restaurant} />
      ))}
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
  userLocation,
  history,
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
  userLocation: UserLocation | null;
  history: Restaurant[];
  spinValue: Animated.Value;
  resultRevealValue: Animated.Value;
  onRandomPress: () => void;
  onSavePress: () => void;
  onGoPress: () => void;
}) {
  const rotate = spinValue.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '1460deg'] });
  const dartDrop = spinValue.interpolate({ inputRange: [0, 0.72, 1], outputRange: [-18, -18, 0] });
  const dartWiggle = spinValue.interpolate({ inputRange: [0, 0.78, 0.9, 1], outputRange: ['-10deg', '-10deg', '8deg', '0deg'] });
  const resultScale = resultRevealValue.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.92, 1.03, 1] });
  const resultTranslateY = resultRevealValue.interpolate({ inputRange: [0, 1], outputRange: [28, 0] });
  const mapPins = [
    { top: 30, left: 122, color: '#ea4335' },
    { top: 68, left: 204, color: '#fbbc04' },
    { top: 162, left: 222, color: '#34a853' },
    { top: 214, left: 96, color: '#4285f4' },
    { top: 120, left: 36, color: '#f05a28' },
    { top: 48, left: 66, color: '#7c5cff' },
    { top: 204, left: 176, color: '#00a884' },
  ];

  return (
    <View>
      <View style={styles.drawConditionRow}>
          <ConditionPill label={area} active />
          <ConditionPill label={genre} />
          <ConditionPill label={`${budgetMin}〜${budgetMax}円`} />
          <ConditionPill label={distance} />
      </View>
      <Pressable style={styles.drawStage} onPress={onRandomPress}>
        <View style={styles.rouletteStatusPill}>
          <Text style={styles.rouletteStatusText}>{isLoading ? 'SEARCHING NEARBY...' : 'RANDISH ROULETTE'}</Text>
        </View>
        <View style={styles.rouletteButton}>
          <Animated.View style={[styles.dart, { transform: [{ translateY: dartDrop }, { rotate: dartWiggle }] }]}>
            <View style={styles.dartNeedle} />
            <View style={styles.dartTail} />
          </Animated.View>
          <View style={styles.rouletteHalo} />
          <Animated.View style={[styles.rouletteWheel, { transform: [{ rotate }] }]}>
            <View style={styles.rouletteGridLineVertical} />
            <View style={styles.rouletteGridLineHorizontal} />
            <View style={[styles.mapRoad, styles.mapRoadOne]} />
            <View style={[styles.mapRoad, styles.mapRoadTwo]} />
            <View style={[styles.mapRoad, styles.mapRoadThree]} />
            <View style={[styles.mapPark, styles.mapParkOne]} />
            <View style={[styles.mapPark, styles.mapParkTwo]} />
            {mapPins.map((pin, index) => (
              <View key={`${pin.color}-${index}`} style={[styles.mapPin, { top: pin.top, left: pin.left, backgroundColor: pin.color }]} />
            ))}
            <View style={styles.wheelCore}>
              <Image source={RANDISH_LOGO} style={styles.wheelLogo} resizeMode="contain" />
            </View>
          </Animated.View>
          <View style={styles.rouletteHintRow}>
            <Text style={styles.rouletteHintText}>候補を回して</Text>
            <Text style={styles.rouletteHintAccent}>一店に決定</Text>
          </View>
          <View style={styles.mapChoiceCard}>
            <Text style={styles.mapChoiceLabel}>GENRE</Text>
            <Text style={styles.mapChoiceValue}>{genre}</Text>
            <View style={styles.mapChoiceDivider} />
            <Text style={styles.mapChoiceLabel}>AREA</Text>
            <Text style={styles.mapChoiceValue}>{area}</Text>
          </View>
          <View style={styles.rouletteCta}>
            {isLoading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <>
                <Ionicons name="refresh" size={32} color="#ffffff" />
                <Text style={styles.rouletteCtaText}>タップして回す</Text>
              </>
            )}
          </View>
          <Text style={styles.rouletteMessage}>{message}</Text>
        </View>
      </Pressable>
      {selectedRestaurant ? (
        <Animated.View style={[styles.resultWrap, { opacity: resultRevealValue, transform: [{ translateY: resultTranslateY }, { scale: resultScale }] }]}>
          <Text style={styles.resultKicker}>TODAY'S PICK</Text>
          <ResultCard restaurant={selectedRestaurant} userLocation={userLocation} onMapPress={onGoPress} />
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
          <Text style={styles.emptyText}>大きなカードをタップして抽選してください。</Text>
        </View>
      )}
      <HistorySection history={history} />
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
    </View>
  );
}

function AnalyticsTab({
  area,
  locationStatus,
  restaurants,
  history,
  savedRestaurants,
  onAreaPress,
}: {
  area: string;
  locationStatus: string;
  restaurants: Restaurant[];
  history: Restaurant[];
  savedRestaurants: Restaurant[];
  onAreaPress: () => void;
}) {
  const topGenre = useMemo(() => {
    const counts = history.reduce<Record<string, number>>((current, restaurant) => {
      current[restaurant.genre] = (current[restaurant.genre] ?? 0) + 1;
      return current;
    }, {});
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'まだなし';
  }, [history]);

  const averageBudget = useMemo(() => {
    const source = history.length ? history : restaurants;
    if (!source.length) return '未計測';
    const average = source.reduce((total, restaurant) => total + (restaurant.budgetMin + restaurant.budgetMax) / 2, 0) / source.length;
    return `${Math.round(average).toLocaleString()}円`;
  }, [history, restaurants]);

  const stats: Array<{
    label: string;
    value: string;
    sub: string;
    icon: keyof typeof MaterialCommunityIcons.glyphMap;
  }> = [
    { label: '抽選回数', value: `${history.length}回`, sub: '過去30日間', icon: 'dice-5-outline' },
    { label: '保存した店', value: `${savedRestaurants.length}件`, sub: '過去30日間', icon: 'bookmark-outline' },
    { label: 'よく出るジャンル', value: topGenre, sub: '過去30日間', icon: 'silverware-fork-knife' },
    { label: '平均予算', value: averageBudget, sub: '過去30日間', icon: 'currency-jpy' },
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

      <View style={styles.analysisPremiumHero}>
        <Text style={styles.analysisPremiumLabel}>RANDISH PREMIUM</Text>
        <Text style={styles.analysisPremiumTitle}>迷い方まで、{'\n'}分析する。</Text>
        <Text style={styles.analysisPremiumLead}>
          よく引くジャンル、保存率、予算傾向を可視化して、{'\n'}次の一店をもっと決めやすくします。
        </Text>
        <Pressable style={styles.analysisBillingButton}>
          <Text style={styles.analysisBillingText}>課金予定</Text>
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
  userLocation,
  onMapPress,
}: {
  restaurant: Restaurant;
  userLocation: UserLocation | null;
  onMapPress: () => void;
}) {
  const distanceLabel = getDistanceLabel(userLocation, restaurant);

  return (
    <View style={styles.resultCard}>
      <RestaurantVisual restaurant={restaurant} large />
      <View style={styles.resultContent}>
        <Text style={styles.resultName}>{restaurant.name}</Text>
        <View style={styles.resultDistanceBand}>
          <View>
            <Text style={styles.resultDistanceLabel}>現在地から</Text>
            <Text style={styles.resultDistanceValue}>{distanceLabel}</Text>
          </View>
          <Pressable style={styles.resultMapShortcut} onPress={onMapPress}>
            <Text style={styles.resultMapShortcutText}>Google Map</Text>
          </Pressable>
        </View>
        <View style={styles.metaRow}>
          <MetaPill label={restaurant.genre} />
          <MetaPill label={restaurant.priceRange ?? formatPrice(restaurant)} />
          <MetaPill label={`${restaurant.minutes ?? 10}分`} />
        </View>
        <View style={styles.ratingRow}>
          <Text style={styles.ratingText}>★ {Number(restaurant.rating ?? 4.2).toFixed(1)}</Text>
          {restaurant.openNow != null && (
            <Text style={[styles.openNowText, restaurant.openNow ? styles.openNowActiveText : styles.openNowInactiveText]}>
              {restaurant.openNow ? '営業中' : '営業時間外'}
            </Text>
          )}
          <Text style={styles.addressText} numberOfLines={1}>{restaurant.area} / {restaurant.address}</Text>
        </View>
        <MiniGoogleMap restaurant={restaurant} distanceLabel={distanceLabel} onPress={onMapPress} />
        {!!restaurant.note && <Text style={styles.restaurantNote}>{restaurant.note}</Text>}
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
          <Text style={styles.restaurantRating}>★ {Number(restaurant.rating ?? 4.2).toFixed(1)}</Text>
        </View>
        <Text style={styles.restaurantSub} numberOfLines={1}>{restaurant.area} / {restaurant.genre}</Text>
        <View style={styles.restaurantMetaRow}>
          <Text style={styles.restaurantMetaPill}>{restaurant.minutes ?? 10}分</Text>
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
          <Text style={styles.candidateTopBadgeText}>★ {Number(restaurant.rating ?? 4.2).toFixed(1)}</Text>
        </View>
        <View style={styles.candidateGenreBadge}>
          <Text style={styles.candidateGenreText}>{restaurant.genre}</Text>
        </View>
      </View>
      <View style={styles.candidateBody}>
        <Text style={styles.candidateName} numberOfLines={1}>{restaurant.name}</Text>
        <Text style={styles.candidateMeta} numberOfLines={1}>{restaurant.area}</Text>
        <View style={styles.candidateInfoRow}>
          <Text style={styles.candidateInfoPill}>{restaurant.minutes ?? 10}分</Text>
          <Text style={styles.candidateInfoPill}>{restaurant.priceRange ?? formatPrice(restaurant)}</Text>
        </View>
      </View>
    </View>
  );
}

function RestaurantVisual({ restaurant, large = false }: { restaurant: Restaurant; large?: boolean }) {
  if (restaurant.photoUrl) {
    return <Image source={{ uri: restaurant.photoUrl }} style={large ? styles.restaurantVisualLarge : styles.restaurantVisual} resizeMode="cover" />;
  }

  return (
    <View style={[large ? styles.restaurantVisualLarge : styles.restaurantVisual, styles.visualFallback]}>
      <Text style={styles.visualInitial}>{restaurant.name.slice(0, 1)}</Text>
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
  registerMainButtonText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '900',
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
    marginBottom: 18,
    paddingTop: 18,
  },
  homeLogoButton: {
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#efe4d8',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
  },
  homeLogoImage: {
    width: 42,
    height: 42,
  },
  homeAccountButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#efe4d8',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
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
  homeLocationTitle: {
    textAlign: 'center',
    fontSize: 42,
    lineHeight: 50,
    fontWeight: '900',
    color: INK,
  },
  homeLocationLead: {
    marginTop: 8,
    marginBottom: 34,
    textAlign: 'center',
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '700',
    color: '#6f665c',
  },
  homeSearchBox: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    borderRadius: 32,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: LINE,
    shadowColor: '#000',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
  },
  homeSearchInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    color: INK,
  },
  homeMicIcon: {
    fontSize: 24,
    fontWeight: '900',
    color: ORANGE,
  },
  homeSearchFilterButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
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
    marginTop: 26,
    flexDirection: 'row',
    gap: 12,
  },
  homeCurrentCard: {
    flex: 1,
    height: 178,
    justifyContent: 'space-between',
    padding: 18,
    borderRadius: 22,
    backgroundColor: '#fff5ef',
    borderWidth: 1,
    borderColor: '#ffd7ca',
    shadowColor: '#000',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
  },
  homeCurrentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: ORANGE,
  },
  homeCurrentBadgeText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#ffffff',
  },
  homeTargetMark: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 76,
  },
  homeTargetOuter: {
    width: 66,
    height: 66,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 33,
    backgroundColor: '#ffffff',
    shadowColor: ORANGE,
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  homeTargetInner: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 8,
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
    fontSize: 21,
    fontWeight: '900',
    color: ORANGE,
  },
  homeCurrentText: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 21,
    fontWeight: '700',
    color: INK,
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
    height: 178,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    padding: 18,
    borderRadius: 22,
    backgroundColor: '#fafafa',
    borderWidth: 1,
    borderColor: LINE,
    position: 'relative',
    shadowColor: '#000',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
  },
  homeMapRoad: {
    position: 'absolute',
    height: 14,
    borderRadius: 7,
    backgroundColor: '#ffffff',
    opacity: 0.88,
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
    backgroundColor: '#cfe9c7',
  },
  homeMapPin: {
    position: 'absolute',
    top: 54,
    left: '50%',
    width: 38,
    height: 38,
    marginLeft: -19,
    borderRadius: 19,
    backgroundColor: INK,
    borderWidth: 8,
    borderColor: '#ffffff',
  },
  homeMapBottom: {
    marginTop: 18,
  },
  homeMapTitle: {
    fontSize: 21,
    fontWeight: '900',
    color: INK,
  },
  homeMapLead: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 21,
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
    marginTop: 30,
  },
  homeSubsectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 14,
  },
  homeSubsectionIcon: {
    fontSize: 29,
    color: INK,
    fontWeight: '900',
  },
  homeSubsectionTitle: {
    flex: 1,
    fontSize: 20,
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
    marginTop: 2,
  },
  homeFavoriteChip: {
    height: 42,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 17,
    borderRadius: 999,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: LINE,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
  },
  homeFavoriteChipActive: {
    backgroundColor: '#fff5ef',
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
    fontSize: 15,
    fontWeight: '900',
    color: INK,
  },
  homeFavoriteTextActive: {
    color: INK,
  },
  homeFavoriteChipIcon: {
    fontSize: 17,
    fontWeight: '900',
    color: '#54504b',
  },
  homeRegionList: {
    overflow: 'hidden',
    borderRadius: 22,
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
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  homeRegionRowActive: {
    backgroundColor: '#fff8f3',
  },
  homeRegionIconFrame: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderRadius: 18,
    backgroundColor: '#fbfaf8',
    borderWidth: 1,
    borderColor: '#eee6dd',
  },
  homeRegionIconFrameActive: {
    backgroundColor: '#fff0e9',
    borderColor: '#ffd3c2',
  },
  homeRegionName: {
    fontSize: 17,
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
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 7,
    paddingRight: 13,
    borderRadius: 999,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: LINE,
  },
  homePrefecturePillActive: {
    backgroundColor: '#fff5ef',
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
    overflow: 'visible',
    borderRadius: 20,
    backgroundColor: '#fbfaf8',
    borderWidth: 1,
    borderColor: '#eee6dd',
    marginRight: 12,
  },
  homePrefectureIconFrameActive: {
    backgroundColor: '#fff0e9',
    borderColor: '#ffd3c2',
  },
  homePrefectureAssetIcon: {
    width: 24,
    height: 24,
  },
  homePrefectureIcon: {
    width: 24,
    height: 24,
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
    rowGap: 10,
    paddingTop: 14,
    paddingBottom: 16,
  },
  genreChip: {
    width: '48.5%',
    minHeight: 86,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
    paddingHorizontal: 12,
    borderRadius: 22,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#eee5d8',
  },
  genreChipImage: {
    width: 54,
    height: 54,
  },
  genreChipText: {
    flex: 1,
    fontSize: 14,
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
  smallField: {
    padding: 14,
    borderRadius: 20,
    backgroundColor: '#f8f3eb',
  },
  smallFieldLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: '#7b7064',
  },
  smallFieldRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
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
    minHeight: 78,
    marginTop: 18,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    backgroundColor: ORANGE,
    shadowColor: ORANGE,
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
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
    minHeight: 584,
    paddingTop: 28,
    paddingHorizontal: 16,
    paddingBottom: 18,
    borderRadius: 32,
    overflow: 'hidden',
    backgroundColor: '#171411',
    borderWidth: 1,
    borderColor: '#2a241f',
    shadowColor: ORANGE,
    shadowOpacity: 0.2,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 16 },
  },
  drawConditionRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 8,
    marginBottom: 16,
    padding: 10,
    borderRadius: 24,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: LINE,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
  },
  conditionPill: {
    minHeight: 44,
    flexShrink: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: '#f4eee7',
  },
  conditionPillActive: {
    backgroundColor: ORANGE,
  },
  conditionPillText: {
    fontSize: 14,
    fontWeight: '900',
    color: INK,
  },
  conditionPillTextActive: {
    color: '#ffffff',
  },
  rouletteButton: {
    minHeight: 528,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  rouletteStatusPill: {
    zIndex: 5,
    alignSelf: 'center',
    marginBottom: 14,
  },
  rouletteStatusText: {
    fontSize: 16,
    letterSpacing: 1.2,
    fontWeight: '900',
    color: ORANGE,
  },
  dart: {
    position: 'absolute',
    top: 24,
    zIndex: 4,
    alignItems: 'center',
  },
  dartNeedle: {
    width: 0,
    height: 0,
    borderLeftWidth: 14,
    borderRightWidth: 14,
    borderTopWidth: 44,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: ORANGE,
  },
  dartTail: {
    width: 32,
    height: 18,
    marginTop: -2,
    borderRadius: 9,
    backgroundColor: '#fff3e9',
    borderWidth: 3,
    borderColor: ORANGE,
  },
  rouletteHalo: {
    position: 'absolute',
    top: 24,
    width: 326,
    height: 326,
    borderRadius: 163,
    backgroundColor: 'rgba(240,90,40,0.12)',
    shadowColor: ORANGE,
    shadowOpacity: 0.45,
    shadowRadius: 36,
    shadowOffset: { width: 0, height: 0 },
  },
  rouletteWheel: {
    width: 304,
    height: 304,
    borderRadius: 152,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#f5efe3',
    borderWidth: 10,
    borderColor: '#fff7ea',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 16 },
  },
  rouletteGridLineVertical: {
    position: 'absolute',
    width: 3,
    height: 304,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  rouletteGridLineHorizontal: {
    position: 'absolute',
    width: 304,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  mapRoad: {
    position: 'absolute',
    height: 20,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    opacity: 0.92,
  },
  mapRoadOne: {
    width: 286,
    top: 98,
    left: -16,
    transform: [{ rotate: '23deg' }],
  },
  mapRoadTwo: {
    width: 248,
    top: 154,
    left: 34,
    transform: [{ rotate: '-18deg' }],
  },
  mapRoadThree: {
    width: 232,
    top: 202,
    left: -24,
    transform: [{ rotate: '62deg' }],
  },
  mapPark: {
    position: 'absolute',
    borderRadius: 24,
    backgroundColor: '#dff1d8',
    opacity: 0.92,
  },
  mapParkOne: {
    width: 96,
    height: 66,
    top: 42,
    left: 42,
    transform: [{ rotate: '-18deg' }],
  },
  mapParkTwo: {
    width: 104,
    height: 70,
    right: 24,
    bottom: 38,
    transform: [{ rotate: '15deg' }],
  },
  mapPin: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 4,
    borderColor: '#ffffff',
  },
  wheelCore: {
    width: 112,
    height: 112,
    borderRadius: 56,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 7,
    borderColor: '#191512',
  },
  wheelLogo: {
    width: 62,
    height: 62,
    borderRadius: 16,
  },
  mapChoiceCard: {
    width: '94%',
    marginTop: 18,
    minHeight: 58,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 29,
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
    marginTop: 20,
  },
  rouletteHintText: {
    fontSize: 17,
    fontWeight: '900',
    color: '#f7eee5',
  },
  rouletteHintAccent: {
    fontSize: 17,
    fontWeight: '900',
    color: ORANGE,
  },
  mapChoiceLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: '#9b9184',
  },
  mapChoiceValue: {
    maxWidth: 96,
    fontSize: 16,
    fontWeight: '900',
    color: INK,
  },
  mapChoiceDivider: {
    width: 1,
    height: 22,
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
    width: '94%',
    minHeight: 64,
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderRadius: 32,
    backgroundColor: ORANGE,
    borderWidth: 2,
    borderColor: '#fff5ec',
    shadowColor: ORANGE,
    shadowOpacity: 0.38,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  rouletteCtaText: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '900',
    color: '#ffffff',
  },
  rouletteMessage: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 19,
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
    minHeight: 78,
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 22,
    backgroundColor: '#171411',
  },
  resultDistanceLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: '#d9cfc7',
  },
  resultDistanceValue: {
    marginTop: 2,
    fontSize: 27,
    fontWeight: '900',
    color: '#ffffff',
  },
  resultMapShortcut: {
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 15,
    backgroundColor: ORANGE,
  },
  resultMapShortcutText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#ffffff',
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
  openNowText: {
    alignSelf: 'flex-start',
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: '900',
  },
  openNowActiveText: {
    backgroundColor: '#e8f6ee',
    color: '#1f8a4c',
  },
  openNowInactiveText: {
    backgroundColor: '#f5eee8',
    color: '#8a6a55',
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
  visualFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff1e8',
  },
  visualInitial: {
    fontSize: 36,
    fontWeight: '900',
    color: ORANGE,
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
