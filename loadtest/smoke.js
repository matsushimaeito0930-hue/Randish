import http from 'k6/http';
import { check, group } from 'k6';

/**
 * 外部APIへ行かない経路だけを、軽く撫でる。
 *
 * 負荷をかける前にこれを通しておく。サーバーが起動していない、DBに繋がっていない、
 * といった状態で本番の負荷テストを流すと、出てくるのは「全部失敗」という
 * 何も分からない結果になる。
 */

const BASE_URL = __ENV.RANDISH_BASE_URL || 'http://localhost:8080';

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    checks: ['rate==1.0'],
  },
};

export default function () {
  group('起動しているか', () => {
    const response = http.get(`${BASE_URL}/api/auth/ready`, { timeout: '120s' });
    check(response, { '認証まわりが応答する': (r) => r.status === 200 || r.status === 204 });
  });

  group('エリア名から中心を引ける', () => {
    const response = http.get(
      `${BASE_URL}/api/places/area-center?area=${encodeURIComponent('徳島県 阿波市')}`,
      { timeout: '120s' },
    );
    // 204 は「まだ解決できていない」で、異常ではない。
    check(response, { '200か204が返る': (r) => r.status === 200 || r.status === 204 });
  });

  group('検索が形として成立している', () => {
    const response = http.get(
      `${BASE_URL}/api/restaurants?latitude=35.3606&longitude=132.7550&range=4`,
      { timeout: '120s' },
    );
    check(response, {
      '200が返る': (r) => r.status === 200,
      '配列が返る': (r) => {
        try {
          return Array.isArray(r.json());
        } catch (error) {
          return false;
        }
      },
    });
    console.log(`[smoke] 検索: ${Math.round(response.timings.duration)}ms`);
  });
}
