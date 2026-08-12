import { Platform } from 'react-native';

/**
 * Vercel Web Analytics への計測。
 *
 * 公式パッケージ(@vercel/analytics)は使わず、同じ仕組みを直接呼んでいる。
 * 計測スクリプトは /_vercel/insights/script.js、送信先も同一オリジンなので、
 * vercel.json の CSP（script-src 'self' / connect-src 'self'）を緩めずに動く。
 * 外部ドメインを許可すると、その分だけ攻撃面が広がるため避けたい。
 *
 * Cookie を使わないので同意バナーも要らない。
 * 個人が特定できる値（店名・座標・メールアドレス・ユーザーID）は送らない。
 */

type EventData = Record<string, string | number | boolean | null>;

type AnalyticsGlobal = typeof globalThis & {
  va?: (event: 'beforeSend' | 'event' | 'pageview', properties?: unknown) => void;
  vaq?: unknown[][];
};

const isWeb = Platform.OS === 'web';

/**
 * スクリプト読み込み前に呼ばれてもイベントを落とさないよう、
 * 公式実装と同じキュー(vaq)に積む。
 */
const getTracker = () => {
  if (!isWeb) {
    return null;
  }
  const runtime = globalThis as AnalyticsGlobal;
  if (typeof runtime.va === 'function') {
    return runtime.va;
  }
  if (!runtime.vaq) {
    runtime.vaq = [];
  }
  return (event: string, properties?: unknown) => {
    runtime.vaq?.push([event, properties]);
  };
};

export const trackEvent = (name: string, data?: EventData) => {
  try {
    const track = getTracker();
    if (!track) {
      return;
    }
    track('event', data ? { name, data } : { name });
  } catch {
    // 計測の失敗でアプリを止めない
  }
};

/**
 * 件数はそのまま送らず幅にまとめる。
 * 生の数値は分析の役に立たないうえ、条件と組み合わさると個人の行動が細かく見えすぎる。
 */
export const toCountBucket = (count: number) => {
  if (count <= 0) {
    return '0';
  }
  if (count <= 5) {
    return '1-5';
  }
  if (count <= 20) {
    return '6-20';
  }
  if (count <= 60) {
    return '21-60';
  }
  return '60+';
};
