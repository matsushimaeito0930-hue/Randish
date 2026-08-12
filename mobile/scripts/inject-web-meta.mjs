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
    <!--
      Vercel Web Analytics。同一オリジンから配信・送信されるため、
      CSP の script-src 'self' / connect-src 'self' のままで動く。
      Cookie を使わないので同意バナーも不要。
    -->
    <script defer src="/_vercel/insights/script.js"></script>
`;

/**
 * JSを読み込み終えるまでの間、真っ白な画面を見せないための起動画面。
 *
 * バンドルは gzip で約700KB あり、回線によっては読み込みと解析に数秒かかる。
 * その間まったく何も出ないため、実際の時間以上に遅く感じていた。
 *
 * 消し方に JavaScript を使っていない点が重要で、CSP が script-src 'self' のため
 * インラインスクリプトは実行できない。#root が空でなくなった（＝Reactが描画した）
 * ことを CSS の :empty と兄弟セレクタだけで判定して消している。
 */
const bootStyle = `    <style id="randish-boot-style">
      #randish-boot {
        position: fixed;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 18px;
        background: #fff8f2;
        font-family: -apple-system, BlinkMacSystemFont, 'Hiragino Sans', 'Noto Sans JP', sans-serif;
        opacity: 1;
        transition: opacity 220ms ease;
        z-index: 9999;
      }
      /* Reactが #root に描画した瞬間に消える。JSを一切使わない。 */
      #root:not(:empty) ~ #randish-boot {
        opacity: 0;
        visibility: hidden;
      }
      #randish-boot-mark {
        font-size: 26px;
        font-weight: 900;
        letter-spacing: 0.16em;
        color: #ef552e;
      }
      #randish-boot-lead {
        font-size: 13px;
        color: #9a9187;
      }
      #randish-boot-bar {
        width: 132px;
        height: 3px;
        border-radius: 999px;
        background: #f2e3d7;
        overflow: hidden;
      }
      #randish-boot-bar::after {
        content: '';
        display: block;
        width: 40%;
        height: 100%;
        border-radius: 999px;
        background: #ef552e;
        animation: randish-boot-slide 1.1s ease-in-out infinite;
      }
      @keyframes randish-boot-slide {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(330%); }
      }
      @media (prefers-reduced-motion: reduce) {
        #randish-boot-bar::after { animation: none; }
      }
    </style>
`;

const bootMarkup = `    <div id="randish-boot" aria-hidden="true">
      <div id="randish-boot-mark">RANDISH</div>
      <div id="randish-boot-bar"></div>
      <div id="randish-boot-lead">今日の一店を準備しています</div>
    </div>
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

// 起動画面のスタイルを head の最後に置く。
html = html.replace(/<\/head>/i, `${bootStyle}  </head>`);

// 起動画面は #root の「あと」に置く。兄弟セレクタで消すため順序が意味を持つ。
html = html.replace(/(<div id="root"><\/div>\s*\n?)/i, `$1${bootMarkup}`);

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
  ['起動画面', html.includes('id="randish-boot"')],
  ['起動画面を消すCSS', html.includes('#root:not(:empty) ~ #randish-boot')],
  // 起動画面は #root より後ろに無いと兄弟セレクタで消せず、画面を覆ったままになる
  ['起動画面がrootの後ろにある', html.indexOf('id="randish-boot"') > html.indexOf('id="root"')],
  ['計測スクリプト', html.includes('/_vercel/insights/script.js')],
];
const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length) {
  console.error(`[randish-seo] failed: ${failed.join(', ')}`);
  process.exit(1);
}

await writeFile(indexPath, html, 'utf8');
console.log(`[randish-seo] injected: ${indexPath}`);
