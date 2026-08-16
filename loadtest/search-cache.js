import http from 'k6/http';
import { check } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// 検索の応答時間。外部APIへ行った回とキャッシュに当たった回を分けて記録する。
// 混ぜて平均を取ると、外部APIの数秒がキャッシュの数ミリ秒に薄まって、
// どちらが遅いのか分からなくなる。
const coldSearch = new Trend('randish_search_cold', true);
const warmSearch = new Trend('randish_search_warm', true);
const emptyResult = new Rate('randish_search_empty');
const externalCalls = new Counter('randish_external_api_calls');

const BASE_URL = __ENV.RANDISH_BASE_URL || 'http://localhost:8080';

/**
 * 撃つ条件。わざと少数に固定してある。
 *
 * 実際の使われ方は「家や職場から、同じ条件で繰り返し引く」なので、
 * 条件を毎回変えて撃つのは負荷の形として正しくない。そのうえ条件を散らすと
 * 1リクエストごとに HotPepper と Geoapify、場合によっては Google Places へ
 * 出ていくので、テストのたびに枠と課金を食う。
 *
 * この形なら外部APIへ行くのは各条件の初回だけで、あとは DB のキャッシュに当たる。
 * 測りたいのは「2回目以降がちゃんと速いか」なので、これで足りる。
 */
const SEARCH_CONDITIONS = [
  { label: '出雲市駅前', latitude: 35.3606, longitude: 132.7550, range: 4, distanceMeters: 1500 },
  { label: '梅田', latitude: 34.7025, longitude: 135.4959, range: 3, distanceMeters: 1000 },
  { label: '阿波市', latitude: 34.1001, longitude: 134.3357, range: 5, distanceMeters: 3000 },
  { label: '出雲市駅前(居酒屋)', latitude: 35.3606, longitude: 132.7550, range: 4, genre: '居酒屋' },
];

export const options = {
  scenarios: {
    // 一気に高負荷をかけても「どこから壊れたか」が分からない。
    // 段階的に上げて、応答時間が崩れ始める人数を見る。
    ramp: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '30s', target: 5 },
        { duration: '1m', target: 20 },
        { duration: '1m', target: 50 },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    // 落ちるのは論外。1%でも失敗したら赤にする。
    http_req_failed: ['rate<0.01'],
    // キャッシュに当たった検索。DBを1回引くだけなので、これ以上かかるなら
    // キャッシュが効いていないか、DBへの接続が詰まっている。
    randish_search_warm: ['p(95)<500'],
    // 候補0件はキャッシュされない仕様なので、多いとそのぶん外部APIへ行き続ける。
    randish_search_empty: ['rate<0.1'],
  },
};

/** 最初の1周で全条件を temperature 済みにする。ここは計測に含めない。 */
export function setup() {
  const warmed = [];
  for (const condition of SEARCH_CONDITIONS) {
    const response = http.get(buildSearchUrl(condition), { timeout: '120s' });
    warmed.push({
      label: condition.label,
      status: response.status,
      seconds: Math.round(response.timings.duration) / 1000,
      count: safeLength(response),
    });
  }
  // 温める時間そのものが、利用者から見た「初回の待ち時間」。ログに残す。
  console.log('[warmup] ' + JSON.stringify(warmed));
  return { warmed };
}

export default function () {
  const condition = SEARCH_CONDITIONS[__ITER % SEARCH_CONDITIONS.length];
  const response = http.get(buildSearchUrl(condition), {
    tags: { name: 'GET /api/restaurants', condition: condition.label },
    timeout: '120s',
  });

  const ok = check(response, {
    '200が返る': (r) => r.status === 200,
    'JSONの配列が返る': (r) => safeLength(r) !== null,
  });

  if (!ok) {
    return;
  }

  const count = safeLength(response);
  emptyResult.add(count === 0);

  // setup で温めてあるので、ここに来るものは基本キャッシュに当たっているはず。
  // 極端に遅い回は外部APIへ出ていったとみなして分けて数える。
  if (response.timings.duration > 3000) {
    coldSearch.add(response.timings.duration);
    externalCalls.add(1);
  } else {
    warmSearch.add(response.timings.duration);
  }
}

function buildSearchUrl(condition) {
  const params = [
    `latitude=${condition.latitude}`,
    `longitude=${condition.longitude}`,
    `range=${condition.range}`,
  ];
  if (condition.genre) {
    params.push(`genre=${encodeURIComponent(condition.genre)}`);
  }
  if (condition.distanceMeters) {
    params.push(`distanceMeters=${condition.distanceMeters}`);
  }
  return `${BASE_URL}/api/restaurants?${params.join('&')}`;
}

function safeLength(response) {
  try {
    const body = response.json();
    return Array.isArray(body) ? body.length : null;
  } catch (error) {
    return null;
  }
}
