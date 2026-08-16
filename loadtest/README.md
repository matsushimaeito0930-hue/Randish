# 負荷テスト

k6 で API サーバーに負荷をかける。

## 先に読むこと

**本番（randish.jp / Render）に向けて撃たないこと。**

- Render の無料プランは1インスタンスしかない。テスト中は他の人がアプリを使えなくなる。
- `/api/restaurants` は HotPepper・Geoapify・Google Places を呼ぶ。条件を散らして撃つと、
  そのぶん枠と課金を実際に消費する。Google Places は1ユーザーあたり原価の約7割を占める。

このテストはローカルに立てたサーバーへ向けて撃つ前提で書いてある。

## 準備

k6 を入れる。

```powershell
winget install k6.k6
```

サーバーを起動する。

```powershell
cd server
mvn spring-boot:run
```

## 走らせる

先に軽いほうで、サーバーが生きているかだけ確かめる。

```powershell
k6 run loadtest/smoke.js
```

通ったら本体。

```powershell
k6 run loadtest/search-cache.js
```

別の場所へ向けたいときは環境変数で切り替える。

```powershell
$env:RANDISH_BASE_URL = "http://192.168.1.10:8080"
k6 run loadtest/search-cache.js
```

## 何を測っているか

検索条件をわざと4通りに固定してある。実際の使われ方が「家や職場から同じ条件で繰り返し引く」
なので、条件を毎回変えて撃つのは負荷の形として正しくない。加えて、条件を散らすと1リクエスト
ごとに外部APIへ出ていくため、測りたいものが外部APIの応答時間になってしまう。

この形なら外部APIへ行くのは各条件の初回（`setup` で済ませる）だけで、以降は
`search_cache` テーブルに当たる。つまり見ているのは **2回目以降がちゃんと速いか** である。

| 指標 | 意味 |
| --- | --- |
| `randish_search_warm` | キャッシュに当たった検索。DBを1回引くだけの時間 |
| `randish_search_cold` | 3秒を超えた検索。外部APIへ出ていったとみなす |
| `randish_external_api_calls` | 上の回数。テスト中に増え続けるならキャッシュが効いていない |
| `randish_search_empty` | 候補0件の割合。0件はキャッシュしない仕様なので、高いと外部APIへ行き続ける |

## 落ちたときの読み方

- **`randish_search_warm` が閾値を超える** — キャッシュに当たっていない。
  `search_cache` のマイグレーションが当たっているか、ログに `[RANDISH_CACHE] write failed`
  が出ていないかを見る。
- **`randish_external_api_calls` が増え続ける** — 同上。キャッシュキーが毎回変わっている疑い。
  座標は小数第3位で丸めているので、丸めが効いていない可能性がある。
- **`http_req_failed` が上がる** — DBの接続数が足りていないことが多い。Supabase の無料枠は
  同時接続数に上限がある。
- **`randish_search_empty` が高い** — 撃っている座標の周りに店が無い。条件のほうを見直す。

## 増やすときに気をつけること

シナリオを足すのは構わないが、**条件をランダムに散らすものを足さないこと**。
毎回キャッシュを外すテストは、サーバーの限界ではなく外部APIの応答時間を測ることになり、
走らせるたびに枠と金を消費する。
