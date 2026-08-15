-- 検索結果のキャッシュ。
--
-- 同じ場所から繰り返し引くのが普通の使い方なので、そのたびに外部APIへ行くと
-- 待たされるうえ、従量課金のGoogle Placesが積み上がる。
--
-- メモリ上のキャッシュは Render の無料プランがスリープするたびに消える。
-- 起動直後（＝一番遅い瞬間）に空になるのでは意味が薄いため、DBに置いて再起動をまたがせる。
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
