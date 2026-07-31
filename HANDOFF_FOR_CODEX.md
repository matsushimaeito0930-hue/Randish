# RANDISH 引き継ぎプロンプト（Codex向け）

あなたは RANDISH（飲食店ルーレットアプリ）の開発を引き継ぎます。以下は現状・構成・実施済みの変更・残課題です。これを踏まえて作業してください。

---

## 1. プロジェクト概要
- RANDISH は「何を食べるか迷ったときに飲食店をルーレットで一店に決める」アプリ。
- **Expo / React Native** で **iOS・Android・Web** の3プラットフォーム展開。
- 元は2フォルダに分かれていた:
  - `demostage_summer`（Web用・Vercelサーバーレス関数がバックエンドの旧構成／モノリシック `mobile/App.tsx`）→ **引退・アーカイブ予定。ここでは作業しない/コミットしない。**
  - `expo-go`（**現行の唯一のプロジェクト**。`mobile/src/AppRoot.tsx` にリファクタ済み、Spring Bootバックエンド前提）
- **今後の作業は `expo-go` フォルダのみ**で行う。

## 2. 構成（アーキテクチャ）と主要情報
- **フロント**: `expo-go/mobile/`（Expo, react-native-web）。エントリ `src/AppRoot.tsx`（約13,000行の単一ファイル）。
- **Web**: `randish.jp`（Vercel。プロジェクト名 `randish-demo-stage-summer`、GitHub連携でmainへpush→自動デプロイ）。ビルド: `npm --prefix mobile run build:web` → `mobile/dist`。
- **バックエンド**: `expo-go/server/`（Spring Boot 3.5 / Java 21 / Maven）を **Render** にデプロイ済み。
  - URL: `https://randish-api.onrender.com`（Render無料プラン, service id `srv-d9jmiaid0e5s73922qr0`, Blueprint `render.yaml` 管理）
  - DB: **Supabase Postgres**（`RANDISH_DATABASE_URI` で接続。デプロイログでHikari→PgConnection接続を確認済み）
  - 認証: **Supabase Auth**（マジックリンク/OTP は Supabase `/auth/v1/otp` を叩く）
- **Web→バックエンド接続**: `expo-go/vercel.json` の rewrite で **`/api/* → https://randish-api.onrender.com/api/*` にプロキシ**（同一オリジン扱いでCORS不要）。SPAは `/((?!api/).*) → /index.html`。
- **ネイティブ→バックエンド**: `EXPO_PUBLIC_RANDISH_API_BASE_URL` に Render URL を設定してビルドする想定（未実施）。
- **GitHub**: `matsushimaeito0930-hue/Randish`（branch `main`）。
- フロントのAPIパス契約は RESTful（例: `api/users/me`, `api/premium/status`, `api/premium/ai-report`, `api/auth/*`, `api/favorites`, `api/visits`, `api/random-histories`）で、**`server/` の Spring Boot が全て実装済み**（`@RequestMapping("/api/users")`+`/me` 等）。demostageのVercel関数（`api/auth?action=...` 方式）とは契約が異なるため、Web用に移植していたVercel関数は撤去し、プロキシに一本化した。

## 3. これまでに実施した主な変更（すべて `expo-go`、mainにコミット済み/一部push済み）
1. **Premiumの撤去（デモ用）** … `mobile/src/AppRoot.tsx`
   - フラグ `const HIDE_PREMIUM = true;`（`false`に戻すとPremium復活）
   - `const FEATURE_MEAL_TICKETS_ENABLED = false;`（`true`で食券システム＝抽選回数制限を復活）
   - `isPro` は実値のまま（＝誰にもPremiumを付与しない）。ペイウォール/「Premium Plan(月額400円/9機能)」カード/MEMBERSHIPヘッダー/「先月はPremium」ロック/年間レポートのPremiumアップセルを非表示。`openPaywall` はHIDE_PREMIUM時no-op。
   - **AIレポート開放**: `const aiReportMonthEndUnlocked = HIDE_PREMIUM ? true : isMonthEndReportDay(now);` にして月末ゲートを解除（これをしないと開封しても即クローズ＆生成されない）。`openAiReport` の `!isPro` ゲートもHIDE_PREMIUMでバイパス。年間レポートの詳しい分析も全員に開放。
   - 抽選履歴が貯まる → 分析/AIレポートに反映。
2. **WebのGoogle Map（APIキー不要）** … `HomeCurrentMapBackground` と `RouletteMapView`
   - `react-native-maps` はWeb不可のため、**iframe埋め込み**（`https://maps.google.com/maps?q=lat,lng&z=16&t=m&output=embed`）を `createElement('iframe', {...})` で描画。ネイティブは従来通り `react-native-maps`。
   - ホームの地図iframeは **`pointerEvents:'none'`（非操作の背景）**に変更（操作可能だと埋め込み地図内リンクへ誤遷移し、戻ると `about:blank` になる不具合があったため）。抽選側も `pointerEvents:'none'`。
3. **位置情報**: サイトアクセス時に許可済みなら現在地を取り直し、古いキャッシュより優先（起動時 `requestCurrentLocation('background')` の `locationIntroState` 条件を撤廃）。
4. **ビルド修正**: `.gitignore` の `**/data/` 除外例外が旧パス `mobile/data/` のままで、リファクタ後の `mobile/src/data/japanMunicipalities.ts` が未追跡→Webビルドが `Unable to resolve module ./data/japanMunicipalities` で失敗していた。`!mobile/src/data/` と `!mobile/src/data/*.ts` を追加し当該ファイルをコミット。
5. **バックエンドのデプロイ構成**: `server/Dockerfile`（maven→temurin21-jre）と `render.yaml`（Blueprint, `randish-api`）を追加。`vercel.json` を Render へのプロキシに変更し、暫定移植していた `api/`（Vercel関数）とルート `package.json` を削除。
6. **cold start対策**: `.github/workflows/keep-render-warm.yml`（5分おきに `/api/premium/status` をping）。

## 4. 現在の未解決課題（優先度順）
### ★① マジックリンク認証が失敗（最優先・現在のブロッカー）
- 症状: randish.jp で「会員登録用コードを送信できませんでした」。Renderがwarm（63秒以上待った状態）でも失敗。
- **原因の最有力**: **RenderのEnvironmentにSupabase認証キーが未設定/不正**。
  - Spring Boot の `SupabaseAuthService` は `SUPABASE_URL` + `SUPABASE_ANON_KEY` を使って `/auth/v1/otp?redirect_to=...` を叩く。`RANDISH_OAUTH_REDIRECT_URI` も必要。
  - `RANDISH_DATABASE_URI`（Postgres）は入っている（DB接続OK）が、**Supabase Auth用のキー（`SUPABASE_URL`, `SUPABASE_ANON_KEY`）が抜けている**可能性が高い。
- **対応**:
  1. Render → Environment に `SUPABASE_URL`（例: `https://gnebbffhvxtoquwwoowk.supabase.co`）, `SUPABASE_ANON_KEY`（`.env.local` の anon public key）, `RANDISH_OAUTH_REDIRECT_URI=https://randish.jp/auth/callback` を設定して保存（自動再デプロイ）。
  2. Supabase → Authentication → URL Configuration → Redirect URLs に `https://randish.jp/auth/callback`（と `https://www.randish.jp/auth/callback`）を追加。
  3. **Render の Logs でマジックリンク要求時のエラー行を確認**して断定（`Supabase magic link request failed` / `not configured` / `redirect_to ... not allowed` 等）。
- 注意: 「Vercelだけの旧構成なら動いていた」のは、同じSupabaseキーがVercel側に設定されていたため。**Vercelに戻す必要はない**（戻すとセッション保持・users/me・favorites・visits 等が再び壊れる）。Renderにenvを揃えるのが正しい。

### ② Render無料プランの cold start（約63秒）
- 無操作15分でスリープ→次アクセスに約63秒。warmなら `/api/*` は200で正常応答することをブラウザNetworkで確認済み。
- 対策: keep-warm ping（追加済みGitHub Action / UptimeRobotで `https://randish-api.onrender.com` を5分間隔監視）、またはRender有料(Starter)でスリープ無効化。デモ直前に一度温める運用でも可。

### ③ Web版が起動時に少しズームする
- ビューポート系。Expoが生成する `index.html` の viewport 設定が絡む。未修正。要調査（実機の viewport meta / initial-scale を確認して調整）。

### ④ ネイティブ（iOS/Android）残タスク
- `EXPO_PUBLIC_RANDISH_API_BASE_URL=https://randish-api.onrender.com` を設定してビルド → 同じバックエンドを向く。
- ネイティブのGoogle Mapは `react-native-maps`。`.env.local` の `GOOGLE_MAPS_API_KEY`/`EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` が空だと地図が出ない。Maps SDK(Android/iOS)有効なキーを設定し、`npx expo prebuild --clean` → dev build/EAS で再ビルド（キーはネイティブ設定に焼き込まれるためMetroリロードでは反映されない）。
- 過去、Expo Go内では地図が「キー無し」で出ていたが、それはExpo Go内蔵キーのため。自前ビルドでは自分のキーが必須。

## 5. Spring Boot（server/）が読む環境変数（Renderに設定）
- DB: `RANDISH_DATABASE_URI`（Supabase Postgres URI）
- Auth: `SUPABASE_URL`, `SUPABASE_ANON_KEY`（`EXPO_PUBLIC_` 版も可）, `RANDISH_OAUTH_REDIRECT_URI`
- 店舗: `HOTPEPPER_API_KEY`, `GEOAPIFY_API_KEY`, `GOOGLE_PLACES_API_KEY`, `RANDISH_GOOGLE_PLACES_ENABLED`
- AIレポート: `GEMINI_API_KEY`, `GEMINI_MODEL`（or `AI_REPORT_ENDPOINT`/`AI_REPORT_REQUEST_TOKEN`）
- メール: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_CONTACT_FROM_EMAIL`, `RANDISH_EMAIL_VERIFICATION_BASE_URL`
- 管理/課金: `RANDISH_ADMIN_PASSWORD`, `REVENUECAT_WEBHOOK_AUTHORIZATION`
- CORS/レート: `RANDISH_CORS_ALLOWED_ORIGINS`（`https://randish.jp,https://www.randish.jp`）, `RANDISH_RATE_LIMIT_*`

## 6. 運用メモ / 制約
- **Renderの再デプロイは `server/` 変更時のみ**必要。フロント（`mobile/`）や `vercel.json` の変更はVercel側の再デプロイ（=mainへpush）で反映され、Renderは触らなくてよい。
- Web(randish.jp)はmainへ **`git push` で自動デプロイ**。
- `demostage_summer` フォルダは撤去対象。**そこではコミットしない**（同じGitHubリポジトリと衝突する）。
- Premiumを戻す時: `HIDE_PREMIUM=false` かつ `FEATURE_MEAL_TICKETS_ENABLED=true`。
- `mobile/src/AppRoot.tsx` は巨大な単一ファイル。編集は該当関数（`HomeCurrentMapBackground`, `RouletteMapView`, `AnalyticsTab`, `AiMonthlyReportEntryCard`, `useSubscription` 等）をピンポイントで。

## 7. 直近にやってほしいこと（このプロンプトの主タスク）
1. **①マジックリンク認証を通す**: RenderのenvにSupabase認証キー（`SUPABASE_URL`/`SUPABASE_ANON_KEY`/`RANDISH_OAUTH_REDIRECT_URI`）を設定し、Supabaseのredirect allowlistを整え、Render Logsでエラーを潰す。ログイン→リロードでセッション保持まで確認。
2. 余力があれば ③ズーム、④ネイティブのAPI基点URL/地図キー設定。
