-- 実際に払った金額。
--
-- これまで分析に出していたのは budget_min / budget_max から作った推定値だけだった。
-- 価格を持たない提供元（OpenStreetMap など）の店は推定すらできず、外食32回のうち
-- 18回ぶんしか集計に入らない、という状態になっていた。
--
-- 推定の列を書き換えるのではなく、別の列として持つ。上書きしてしまうと
-- 「本人が入れた額」と「店の価格帯から推した額」の区別がつかなくなり、
-- どちらを信じてよいか分からない数字になる。
ALTER TABLE random_histories
  ADD COLUMN IF NOT EXISTS actual_spend INTEGER;

COMMENT ON COLUMN random_histories.actual_spend IS
  '本人が入力した実際の支払額（円）。NULL は未入力で、その場合は予算帯からの推定を使う。';
