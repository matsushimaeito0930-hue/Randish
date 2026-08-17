// 全市区町村を1件ずつ引いて、返ってきた店が本当にその都道府県にあるかを確かめる。
//
// 見たいのは「島根を選んだのに大阪の店が出る」類の取り違え。以前これが実際に起きていて、
// 原因は座標なしで引いたときにホットペッパーへ「梅田」を補っていたことだった。
//
// Google Places は必ず外して引く（excludeGoogle=1）。確かめたいのは田舎で、そこは
// ホットペッパーが0件になりやすい。つまり救済経路のGoogleが一番呼ばれる場所であり、
// 従量課金なので、確かめるたびに金がかかることになる。
//
//   node scripts/verify-areas.mjs                     ローカルの8080へ
//   node scripts/verify-areas.mjs --base https://randish.jp
//   node scripts/verify-areas.mjs --limit 200         先頭200件だけ
//   node scripts/verify-areas.mjs --prefecture 広島県
//
// 途中で止めても、それまでの結果は out/area-verification.json に残る。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const BASE_URL = argValue('--base', 'http://localhost:8080').replace(/\/$/, '');
const LIMIT = Number(argValue('--limit', '0')) || 0;
const PREFECTURE = argValue('--prefecture', '');
// サーバーを詰まらせない程度に間を空ける。Renderの無料プランは1インスタンスしかない。
const DELAY_MS = Number(argValue('--delay', '250'));
const OUT_PATH = path.join(repoRoot, 'out', 'area-verification.json');

/** japanMunicipalities.ts から "県名 市区町村名" を取り出す。 */
const readAreas = () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'mobile', 'src', 'data', 'japanMunicipalities.ts'),
    'utf-8',
  );
  const found = [...source.matchAll(/"searchValue":\s*"([^"]+)"/g)].map((match) => match[1]);
  return [...new Set(found)];
};

/**
 * 住所から都道府県を取り出す。
 *
 * 郵便番号が先に来る住所がある（「〒725-0301 広島県豊田郡…」）。頭から読む正規表現だと
 * そこで外れて、正しい住所を「他県」と誤判定する。実際に一度これで誤報を出した。
 * 位置を問わず、47都道府県のどれが含まれるかで見る。
 */
const PREFECTURES = [
  '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
  '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
  '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県',
  '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県',
  '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県',
  '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県',
  '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県',
];

const prefectureOf = (address) => {
  if (!address) {
    return null;
  }
  return PREFECTURES.find((prefecture) => address.includes(prefecture)) ?? null;
};

/** 地図の中心がここより遠いなら、誰もいない場所を指している疑いがある。 */
const CENTER_WARN_METERS = 30_000;

const fetchAreaCenter = async (area) => {
  try {
    const response = await fetch(`${BASE_URL}/api/places/area-center?area=${encodeURIComponent(area)}`);
    if (response.status !== 200) {
      return null;
    }
    const body = await response.json();
    return typeof body?.latitude === 'number' ? body : null;
  } catch {
    return null;
  }
};

const distanceMeters = (fromLat, fromLng, toLat, toLng) => {
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(toLat - fromLat);
  const dLng = toRad(toLng - fromLng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(fromLat)) * Math.cos(toRad(toLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const main = async () => {
  let areas = readAreas();
  if (PREFECTURE) {
    areas = areas.filter((area) => area.startsWith(PREFECTURE));
  }
  if (LIMIT) {
    areas = areas.slice(0, LIMIT);
  }

  console.log(`対象 ${areas.length} 件 / 宛先 ${BASE_URL} / Google は使わない`);
  const results = [];
  let mismatched = 0;
  let empty = 0;
  let failed = 0;
  let strandedCenters = 0;

  for (const [index, area] of areas.entries()) {
    const wanted = area.split(/\s+/)[0];
    const url = `${BASE_URL}/api/restaurants?excludeGoogle=1&area=${encodeURIComponent(area)}`;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        failed += 1;
        results.push({ area, status: response.status, error: 'HTTPエラー' });
        continue;
      }
      const shops = await response.json();
      // 住所から読めた都道府県だけを見る。読めないものは判定に使わない。
      const wrong = shops.filter((shop) => {
        const found = prefectureOf(shop.address);
        return found != null && found !== wanted;
      });
      const providers = {};
      shops.forEach((shop) => {
        providers[shop.externalProvider] = (providers[shop.externalProvider] ?? 0) + 1;
      });

      // 地図の中心が、返ってきた店から離れていないか。
      // 中心は「見つかった店の平均」で出しているので、遠い店が1軒混ざると
      // 誰もいない場所へ落ちる。実際に瀬戸内海の真ん中に円が描かれたことがある。
      let centerIssue = null;
      const center = await fetchAreaCenter(area);
      if (center) {
        const located = shops.filter((shop) => shop.latitude != null && shop.longitude != null);
        if (located.length) {
          const nearest = Math.min(...located.map((shop) =>
            distanceMeters(center.latitude, center.longitude, shop.latitude, shop.longitude)));
          if (nearest > CENTER_WARN_METERS) {
            centerIssue = { nearestShopMeters: Math.round(nearest), center };
            strandedCenters += 1;
            console.log(`  ✗ ${area}: 地図の中心が最寄りの店から ${(nearest / 1000).toFixed(1)}km`);
          }
        }
      }
      if (!shops.length) {
        empty += 1;
      }
      if (wrong.length) {
        mismatched += 1;
        console.log(`  ✗ ${area}: ${wrong.length}/${shops.length} 件が他県`);
        wrong.slice(0, 3).forEach((shop) => console.log(`      ${shop.name} / ${shop.address}`));
      }
      results.push({
        area,
        count: shops.length,
        wrongCount: wrong.length,
        providers,
        centerIssue,
        wrongSamples: wrong.slice(0, 3).map((shop) => ({ name: shop.name, address: shop.address })),
      });
    } catch (error) {
      failed += 1;
      results.push({ area, error: String(error).slice(0, 120) });
    }

    if ((index + 1) % 50 === 0) {
      console.log(`  ${index + 1}/${areas.length} 件 … 他県混入 ${mismatched} / 中心ずれ ${strandedCenters} / 0件 ${empty} / 失敗 ${failed}`);
      writeOut(results, { mismatched, empty, failed, strandedCenters });
    }
    await sleep(DELAY_MS);
  }

  writeOut(results, { mismatched, empty, failed, strandedCenters });

  const withResults = results.filter((item) => (item.count ?? 0) > 0);
  console.log('\n================ 結果 ================');
  console.log(`検証した市区町村      ${results.length}`);
  console.log(`他県の店が混ざった数  ${mismatched}`);
  console.log(`中心が店から離れた数  ${strandedCenters}`);
  console.log(`0件だった市区町村     ${empty}`);
  console.log(`リクエスト失敗        ${failed}`);
  if (withResults.length) {
    const counts = withResults.map((item) => item.count).sort((a, b) => a - b);
    const median = counts[Math.floor(counts.length / 2)];
    console.log(`件数の中央値          ${median}（最小 ${counts[0]} / 最大 ${counts[counts.length - 1]}）`);
  }
  console.log(`詳細                  ${path.relative(repoRoot, OUT_PATH)}`);
  process.exitCode = mismatched > 0 || strandedCenters > 0 ? 1 : 0;
};

const writeOut = (results, summary) => {
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify({ summary, results }, null, 2), 'utf-8');
};

await main();
