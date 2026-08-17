-- 未適用のマイグレーションをまとめたもの。Supabase の SQL Editor に貼って一度に実行する。
--
-- 中身は supabase/migrations/ の3本と同じで、まとめただけ。
--   20260814120000_add_search_cache.sql
--   20260817090000_add_actual_spend_to_random_histories.sql
--   20260817120000_add_excluded_restaurants.sql
--
-- すべて IF NOT EXISTS で書いてあるので、すでに当たっているものがあっても失敗しない。
-- 何度実行しても結果は同じになる。既存のデータには触れない。
--
-- これを実行してから push すること。逆にすると、サーバーが起動して
-- actual_spend や excluded_restaurants を読もうとし、履歴と除外のAPIが 500 を返す。

BEGIN;

-- ===========================================================================
-- 1. 検索結果のキャッシュ
--
-- 同じ場所から繰り返し引くのが普通の使い方なので、そのたびに外部APIへ行くと
-- 待たされるうえ、従量課金の Google Places が積み上がる。
--
-- メモリ上のキャッシュは Render の無料プランがスリープするたびに消える。
-- 起動直後（＝一番遅い瞬間）に空になるのでは意味が薄いため、DBに置いて再起動をまたがせる。
-- ===========================================================================
CREATE TABLE IF NOT EXISTS search_cache (
  -- 検索条件をまとめた1本の文字列。エリア・ジャンル・予算・距離・丸めた座標から作る。
  cache_key VARCHAR(300) PRIMARY KEY,
  -- 表示に必要な店舗情報をそのまま持つ。IDだけだと結局APIを引き直すことになる。
  payload JSONB NOT NULL,
  result_count INTEGER NOT NULL DEFAULT 0,
  -- 何回再利用されたか。人気エリアの把握と、キャッシュが効いているかの確認に使う。
  hit_count INTEGER NOT NULL DEFAULT 0,
  fetched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 期限切れの掃除で使う。
CREATE INDEX IF NOT EXISTS idx_search_cache_fetched_at ON search_cache(fetched_at);

-- 利用者のデータではないので、アプリからの直接参照は不要。
-- サーバー（service_role）からのみ触る。
ALTER TABLE search_cache ENABLE ROW LEVEL SECURITY;

-- ===========================================================================
-- 2. 実際に払った金額
--
-- これまで分析に出していたのは budget_min / budget_max から作った推定値だけだった。
-- 価格を持たない提供元（OpenStreetMap など）の店は推定すらできず、外食32回のうち
-- 18回ぶんしか集計に入らない、という状態になっていた。
--
-- 推定の列を書き換えるのではなく、別の列として持つ。上書きしてしまうと
-- 「本人が入れた額」と「店の価格帯から推した額」の区別がつかなくなり、
-- どちらを信じてよいか分からない数字になる。
-- ===========================================================================
ALTER TABLE random_histories
  ADD COLUMN IF NOT EXISTS actual_spend INTEGER;

COMMENT ON COLUMN random_histories.actual_spend IS
  '本人が入力した実際の支払額（円）。NULL は未入力で、その場合は予算帯からの推定を使う。';

-- ===========================================================================
-- 3. 出したくない店
--
-- Premium の売り文句に「除外店舗」と書いてあるのに、実装が無かった。
--
-- お気に入りと違って、店の情報そのものは持たない。目的は「候補から外す」だけなので、
-- どの店かを指す識別子と、外した理由（本人向けの覚え書き）で足りる。
-- 店の情報まで持つと、お気に入りと二重に持つことになり、片方だけ古くなる。
-- ===========================================================================
CREATE TABLE IF NOT EXISTS excluded_restaurants (
  id VARCHAR(120) PRIMARY KEY,
  user_id VARCHAR(120) NOT NULL,
  -- 提供元ごとの識別子。restaurants テーブルに無い店（外部APIのみの店）も外せるようにする。
  provider VARCHAR(80) NOT NULL DEFAULT 'RANDISH_SEED',
  provider_place_id VARCHAR(255) NOT NULL DEFAULT '',
  -- 一覧に出すための最小限。名前が無いと、何を外したのか本人にも分からない。
  restaurant_name VARCHAR(255),
  reason VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- 同じ店を二度外しても増えないようにする。
  CONSTRAINT uq_excluded_restaurants UNIQUE (user_id, provider, provider_place_id)
);

CREATE INDEX IF NOT EXISTS idx_excluded_restaurants_user
  ON excluded_restaurants(user_id);

-- 本人のデータなので、アプリからの直接参照はさせない。サーバー経由のみ。
ALTER TABLE excluded_restaurants ENABLE ROW LEVEL SECURITY;

COMMIT;

-- ===========================================================================
-- 確認用。実行後にこれを流すと、3つとも入ったかが1行で分かる。
-- 3行とも true になっていれば完了。
-- ===========================================================================
SELECT
  EXISTS (SELECT 1 FROM information_schema.tables
          WHERE table_name = 'search_cache') AS "search_cache がある",
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_name = 'random_histories' AND column_name = 'actual_spend') AS "actual_spend がある",
  EXISTS (SELECT 1 FROM information_schema.tables
          WHERE table_name = 'excluded_restaurants') AS "excluded_restaurants がある";
