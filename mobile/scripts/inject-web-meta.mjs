/**
 * Expo の web ビルドが出す dist/index.html に、検索エンジン向けの情報を差し込む。
 *
 * これが無いと <title>RANDISH</title> と JS だけの HTML になり、
 * Google は JS を実行した結果たまたま最初に見えた画面（ログイン画面）を
 * 説明文として拾ってしまう。実際「初めての方はそのまま登録され…」が
 * 検索結果の説明文になっていた。
 *
 * Expo のテンプレートを差し替える方法もあるが、テンプレートの仕様変更で
 * ビルドごと壊れる危険があるため、生成物に後から足す方式にしている。
 * 何度実行しても結果が変わらない（冪等）。
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SITE_URL = 'https://randish.jp/';
const TITLE = 'RANDISH｜今日の飲食店をルーレットで決める';
const DESCRIPTION =
  '「今日どこで食べる？」をルーレットで決めるアプリ。エリア・ジャンル・予算を選ぶだけで、'
  + '全国の飲食店から今日の一店が決まります。店選びに悩む時間をなくします。';
const SHORT_DESCRIPTION =
  'エリア・ジャンル・予算を選ぶだけ。全国の飲食店から今日の一店をルーレットで決めます。';

const MARKER = 'randish-seo-meta';

const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'RANDISH',
  url: SITE_URL,
  applicationCategory: 'LifestyleApplication',
  operatingSystem: 'Web, iOS, Android',
  inLanguage: 'ja',
  description: DESCRIPTION,
  featureList: [
    'エリア・ジャンル・予算を指定した飲食店のランダム抽選',
    '地図上で候補から一店を選ぶルーレット演出',
    '行き先の街もおまかせにする旅行モード',
    '抽選した外食の記録とアルバム',
    '月次の食生活AIレポート',
  ],
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'JPY',
    description: '基本機能は無料。RANDISH Premiumは月額400円。',
  },
};

const metaBlock = `    <!-- ${MARKER}: scripts/inject-web-meta.mjs が生成。直接編集しないこと -->
    <meta name="description" content="${DESCRIPTION}" />
    <link rel="canonical" href="${SITE_URL}" />
    <meta name="theme-color" content="#ef552e" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="RANDISH" />
    <meta property="og:locale" content="ja_JP" />
    <meta property="og:url" content="${SITE_URL}" />
    <meta property="og:title" content="${TITLE}" />
    <meta property="og:description" content="${SHORT_DESCRIPTION}" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${TITLE}" />
    <meta name="twitter:description" content="${SHORT_DESCRIPTION}" />
    <script type="application/ld+json">${JSON.stringify(structuredData)}</script>
`;

const noscriptBlock = `<noscript>
      <h1>${TITLE}</h1>
      <p>${DESCRIPTION}</p>
      <p>ご利用にはJavaScriptを有効にしてください。</p>
    </noscript>`;

const indexPath = process.argv[2]
  ?? path.join(process.cwd(), 'dist', 'index.html');

let html = await readFile(indexPath, 'utf8');

if (html.includes(MARKER)) {
  console.log(`[randish-seo] already injected: ${indexPath}`);
  process.exit(0);
}

const before = html;

// 日本語のアプリなので lang を直す。en のままだと日本語検索で不利になる。
html = html.replace(/<html\s+lang="[^"]*"/i, '<html lang="ja"');

// 説明が無いと検索結果に画面の文言が使われてしまうため、必ず title を具体的にする。
html = html.replace(/<title>[^<]*<\/title>/i, `<title>${TITLE}</title>`);

// title の直後にメタ情報をまとめて入れる。
html = html.replace(/(<title>[^<]*<\/title>\s*\n?)/i, `$1${metaBlock}`);

// JSを実行しないクローラー向けの説明に差し替える。
html = html.replace(/<noscript>[\s\S]*?<\/noscript>/i, noscriptBlock);

if (html === before) {
  console.error('[randish-seo] failed: index.html の形が想定と違うため何も差し込めませんでした');
  process.exit(1);
}

const checks = [
  ['lang="ja"', html.includes('lang="ja"')],
  ['title', html.includes(TITLE)],
  ['description', html.includes('name="description"')],
  ['og:title', html.includes('property="og:title"')],
  ['ld+json', html.includes('application/ld+json')],
  ['noscript', html.includes('ご利用にはJavaScriptを有効に')],
  ['root要素が残っている', html.includes('id="root"')],
  ['スクリプトが残っている', /<script[^>]+src=/.test(html)],
];
const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length) {
  console.error(`[randish-seo] failed: ${failed.join(', ')}`);
  process.exit(1);
}

await writeFile(indexPath, html, 'utf8');
console.log(`[randish-seo] injected: ${indexPath}`);
