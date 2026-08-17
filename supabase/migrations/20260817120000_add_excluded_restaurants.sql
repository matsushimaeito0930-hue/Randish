-- 出したくない店。
--
-- Premium の売り文句に「除外店舗」と書いてあるのに、実装が無かった。
--
-- お気に入りと違って、店の情報そのものは持たない。目的は「候補から外す」だけなので、
-- どの店かを指す識別子と、外した理由（本人向けの覚え書き）で足りる。
-- 店の情報まで持つと、お気に入りと二重に持つことになり、片方だけ古くなる。
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
