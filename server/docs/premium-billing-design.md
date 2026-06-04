# Randish Premium Billing Design

RandishのPremiumは、Stripeだけに寄せず、App Store / Google Playのアプリ内課金にも対応できるように設計する。

## 基本方針

- Premium権限はメールアドレスではなく `user_id` に紐づける。
- client側の `premium` フラグは信用しない。
- Premium判定は必ずサーバー/DB側で行う。
- Stripe、App Store、Google Playの購入状態は `subscriptions` に正規化して保存する。
- 友達、家族、ベータユーザー向けの手動Premiumは `premium_grants` に分けて保存する。
- Webhook / App Store Server Notifications / Google Play RTDNは `payment_events` で重複処理を防ぐ。
- 解約済みでも `current_period_end` まではPremiumを使える。

## Tables

### `premium_products`

Premium商品マスタ。

| column | role |
| --- | --- |
| `id` | Randish内部の商品ID。例: `premium_monthly_jpy_300` |
| `entitlement_key` | 開放する権限。最初は `premium` |
| `provider` | `STRIPE`, `APP_STORE`, `GOOGLE_PLAY` |
| `provider_product_id` | Stripe product、App Store product id、Google Play product id |
| `provider_price_id` | Stripe price id。App Store / Google Playでは空文字でよい |
| `billing_period` | `MONTHLY`, `YEARLY`, `ONE_TIME` |
| `price_amount` | 税込み/表示用の金額。月額300円なら `300` |
| `currency` | `JPY` |
| `active` | 新規購入可能か |

### `billing_customers`

決済サービス側の顧客ID。主にStripeで使う。

| column | role |
| --- | --- |
| `user_id` | RandishのユーザーID |
| `provider` | 決済元 |
| `environment` | `SANDBOX` or `PRODUCTION` |
| `provider_customer_id` | Stripe customer idなど |
| `email_at_provider` | 決済サービス側に保存されたメール。権限判定には使わない |

### `subscriptions`

有料サブスクリプションの正規化テーブル。

| column | role |
| --- | --- |
| `user_id` | Premiumを開放するRandishユーザー |
| `provider` | `STRIPE`, `APP_STORE`, `GOOGLE_PLAY` |
| `environment` | sandboxとproductionの混同防止 |
| `provider_subscription_id` | provider内で一意な購読ID |
| `provider_customer_id` | Stripe customer idなど |
| `provider_product_id` | providerの商品ID |
| `provider_price_id` | Stripe price id |
| `status` | Randish側で正規化した状態 |
| `raw_status` | providerから来た元の状態 |
| `current_period_start` | 現在の課金期間開始 |
| `current_period_end` | 現在の課金期間終了 |
| `cancel_at_period_end` | 期間終了時に解約予定か |
| `canceled_at` | 解約操作日時 |
| `grace_period_end` | 支払い失敗時などの猶予終了 |
| `original_transaction_id` | App Storeで重要。購読の親ID |
| `latest_transaction_id` | 最新取引ID |
| `purchase_token_hash` | Google Play purchase tokenのハッシュ |

`provider_subscription_id` の入れ方:

| provider | recommended value |
| --- | --- |
| Stripe | `sub_...` |
| App Store | `originalTransactionId` |
| Google Play | purchase tokenをハッシュ化した値、または安全に管理した購読キー |

Google Playのpurchase tokenを保存する場合は、平文保存ではなく暗号化を検討する。少なくとも重複判定用には `purchase_token_hash` を使う。

### `premium_grants`

管理者による手動Premium付与。

| column | role |
| --- | --- |
| `user_id` | 付与対象 |
| `grant_type` | `ADMIN`, `BETA`, `FRIEND`, `FAMILY`, `PROMO`, `SUPPORT` |
| `status` | `active`, `revoked`, `expired` |
| `starts_at` | 開始日時 |
| `ends_at` | 終了日時。無期限ならNULL |
| `granted_by` | 付与した管理者ユーザー |
| `revoked_at` | 取り消し日時 |
| `note` | 理由メモ |

Stripe/App Store/Google Play課金とは別テーブルにすることで、「課金でPremium」と「運営が付与したPremium」を混ぜない。

### `payment_events`

Webhook/通知の冪等性テーブル。

| column | role |
| --- | --- |
| `provider_event_id` | Stripe event id、Apple notification UUID、Google message idなど |
| `event_type` | イベント種別 |
| `processing_status` | `received`, `processing`, `processed`, `ignored`, `failed` |
| `raw_payload` | 調査用の元payload |

`UNIQUE (provider, environment, provider_event_id)` により、同じWebhookが複数回来ても二重処理しない。

### `payment_records`

請求/支払い履歴。

| column | role |
| --- | --- |
| `provider_payment_id` | Stripe invoice/payment intent、Apple transaction id、Google order idなど |
| `subscription_id` | 関連する購読 |
| `amount_total` | 請求金額 |
| `amount_paid` | 実支払い金額 |
| `status` | `pending`, `paid`, `failed`, `refunded`, `partially_refunded`, `void` |
| `period_start` | 対象期間開始 |
| `period_end` | 対象期間終了 |
| `paid_at` | 支払い完了日時 |
| `refunded_at` | 返金日時 |

### `feature_usage_counters`

無料ユーザーの制限管理。

例:

- `ROULETTE_DRAW`
- `VISIT_LOG`
- `FAVORITE`

Premiumなら上限チェックをスキップし、無料ユーザーならこのテーブルで月単位などの利用数を管理する。

### `expense_memos`

Premium機能の支出メモ。

`visit_collection_id` と紐づけてもよいし、店だけ指定して単独メモとして保存してもよい。

## Premium判定

Premiumは次のどちらかで有効。

1. `subscriptions` に有効な有料購読がある。
2. `premium_grants` に有効な手動付与がある。

SQLイメージ:

```sql
SELECT EXISTS (
  SELECT 1
  FROM subscriptions
  WHERE user_id = :user_id
    AND entitlement_key = 'premium'
    AND (
      (
        status IN ('active', 'trialing', 'canceled')
        AND current_period_end > CURRENT_TIMESTAMP
      )
      OR (
        status = 'past_due'
        AND grace_period_end IS NOT NULL
        AND grace_period_end > CURRENT_TIMESTAMP
      )
    )
)
OR EXISTS (
  SELECT 1
  FROM premium_grants
  WHERE user_id = :user_id
    AND entitlement_key = 'premium'
    AND status = 'active'
    AND starts_at <= CURRENT_TIMESTAMP
    AND (ends_at IS NULL OR ends_at > CURRENT_TIMESTAMP)
);
```

## `past_due` の扱い

おすすめは「短い猶予を持たせる」設計。

- Stripe: 支払い失敗直後は `past_due` にし、`grace_period_end` までPremium継続。
- App Store / Google Play: ストア側のbilling retry/grace periodがある場合は、その終了日時を `grace_period_end` に入れる。
- 猶予を過ぎたらPremium停止。

最初の実装では、猶予は3日程度にしておくとユーザー体験と不正防止のバランスがよい。

## 解約・期限切れ・再課金

- 解約: `status = 'canceled'`, `cancel_at_period_end = true`, `current_period_end`まではPremium。
- 期限切れ: `current_period_end <= now()` ならPremium停止。
- 支払い失敗: `past_due`にして、猶予内ならPremium。
- 再課金: 同じ `provider_subscription_id` なら既存行を更新。新しい購読IDなら新規行を作る。
- 返金: `payment_records.status = 'refunded'` を残し、必要に応じて `subscriptions.status = 'refunded'` または `expired` にする。

## 実装時の注意

- mobileアプリから直接Supabase DBには接続しない。
- mobileは購入後にレシート/購入トークンをSpring Boot APIへ送る。
- Spring Boot APIがStripe/App Store/Google PlayのサーバーAPIで検証する。
- 検証済みの結果だけDBに保存する。
- Premium機能の開放可否は毎回サーバー側の `isPremium(userId)` で見る。
- App Store / Google Playのsandbox通知とproduction通知を混ぜないため、必ず `environment` を保存する。
- Webhookは必ず先に `payment_events` にINSERTする。同じ `provider_event_id` が既にあれば処理しない。
