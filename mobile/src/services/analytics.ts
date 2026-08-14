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
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
};

const isWeb = Platform.OS === 'web';

/**
 * GA4 の測定ID。Vercel の環境変数 EXPO_PUBLIC_GA_MEASUREMENT_ID から取る。
 * 未設定なら GA へは何も送らない（Vercel Analytics だけが動く）。
 * コードに直接書かないのは、値の差し替えでビルドし直さずに済ませるため。
 */
const GA_MEASUREMENT_ID = process.env.EXPO_PUBLIC_GA_MEASUREMENT_ID?.trim() || '';

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

/**
 * GA4 を読み込む。
 *
 * 公式の埋め込みコードはインラインスクリプトだが、CSP が script-src 'self' のため
 * インラインは実行できない。dataLayer と gtag の定義はこのバンドル内（＝self）で行い、
 * 外部スクリプトはタグを動的に足す形にしている。
 *
 * なお GA は Cookie を使い、データが Google に渡る。日本の外部送信規律の対象になるため、
 * プライバシーポリシーへの記載が必要。
 */
let googleAnalyticsReady = false;

const setupGoogleAnalytics = () => {
  if (!isWeb || !GA_MEASUREMENT_ID || googleAnalyticsReady) {
    return;
  }
  const runtime = globalThis as AnalyticsGlobal;
  const runtimeDocument = (runtime as { document?: Document }).document;
  if (!runtimeDocument?.head) {
    return;
  }
  googleAnalyticsReady = true;

  runtime.dataLayer = runtime.dataLayer ?? [];
  runtime.gtag = function gtag(...args: unknown[]) {
    runtime.dataLayer?.push(args);
  };
  runtime.gtag('js', new Date());
  runtime.gtag('config', GA_MEASUREMENT_ID);

  const script = runtimeDocument.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_MEASUREMENT_ID)}`;
  runtimeDocument.head.appendChild(script);
};

/**
 * GA4 のイベント名は英数字とアンダースコアのみ。
 * 送っているイベント名はもともとその形だが、将来足したものが黙って捨てられないよう均す。
 */
const toGaEventName = (name: string) => name.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 40);

export const trackEvent = (name: string, data?: EventData) => {
  try {
    const track = getTracker();
    if (track) {
      track('event', data ? { name, data } : { name });
    }
  } catch {
    // 計測の失敗でアプリを止めない
  }

  try {
    setupGoogleAnalytics();
    const runtime = globalThis as AnalyticsGlobal;
    runtime.gtag?.('event', toGaEventName(name), data ?? {});
  } catch {
    // 同上
  }
};

/**
 * 起動時に一度呼ぶ。
 * これが無いと、利用者が何か操作するまでGAが読み込まれず、
 * 「見に来ただけで帰った人」が計測から漏れてしまう。
 */
export const initAnalytics = () => {
  try {
    setupGoogleAnalytics();
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
