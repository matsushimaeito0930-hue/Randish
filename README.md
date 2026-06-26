# Randish

Randish is a mobile app that helps users pick a restaurant when they cannot decide what to eat. It combines an Expo / React Native app with a Spring Boot API.

## Project Structure

- `mobile/`: Expo / React Native app.
- `server/`: Spring Boot API and database schema.
- `server/docs/database-design.md`: database design notes and ER diagram.

## Local Development

### API Server

```powershell
cd server
mvn spring-boot:run
```

The API starts on port `8080`.

Useful endpoints:

- `GET http://localhost:8080/api/restaurants`
- `GET http://localhost:8080/api/restaurants/random`
- `POST http://localhost:8080/api/places/nearby`
- `POST http://localhost:8080/api/auth/register`
- `POST http://localhost:8080/api/auth/login`
- `GET http://localhost:8080/api/favorites/user/{userId}`
- `GET http://localhost:8080/api/visits/user/{userId}`
- `GET http://localhost:8080/api/statistics/user/{userId}`

### Mobile App

```powershell
cd mobile
npm install
npm run start
```

When using Expo Go on a physical phone, set the API URL in the app to the PC's LAN address, for example:

```text
http://192.168.1.23:8080
```

The API binds to `0.0.0.0` in development by default so a physical phone can reach it over the same Wi-Fi. If you want to allow only local PC access, set this in `.env.local` before starting the server:

```env
RANDISH_SERVER_ADDRESS=127.0.0.1
```

## Environment Variables

Create `.env.local` from `.env.example` when API keys or database credentials are needed.

Never commit `.env.local`, database passwords, API keys, keystores, or production secrets.

Security-related defaults:

- H2 console and `/api/debug/**` are disabled unless explicitly enabled.
- Browser CORS is limited to local development origins unless `RANDISH_CORS_ALLOWED_ORIGINS` is set.
- API requests are rate-limited by default; tune the `RANDISH_RATE_LIMIT_*` values for production traffic.
- Mobile native clients do not need CORS; Expo Web does.

RANDISH uses Hot Pepper Gourmet as the first restaurant source and Geoapify Places as a temporary supplemental source. Google Places is a paid fallback only:

- Hot Pepper is queried first and owns the main candidate pool.
- Geoapify is queried by the Spring Boot API after Hot Pepper when latitude/longitude are available, with a 500m default radius and a short server-side cache.
- Google Places is disabled by default.
- Google Places is used only when explicitly enabled and Hot Pepper plus Geoapify do not fill the target candidate count.
- Google fallback is capped per request and by a per-server-session request limit.

Keep the Geoapify secret on the backend only:

```env
GEOAPIFY_API_KEY=YOUR_LOCAL_KEY
GEOAPIFY_CACHE_TTL_SECONDS=600
```

To intentionally test Google fallback, set both values locally:

```env
RANDISH_GOOGLE_PLACES_ENABLED=true
RANDISH_GOOGLE_PLACES_SESSION_LIMIT=30
GOOGLE_PLACES_API_KEY=YOUR_LOCAL_KEY
```

## Google Map Roulette

The current-location map roulette uses two Google capabilities:

- Google Maps SDK for Android / iOS, used by `react-native-maps` to render the map in the Expo native app.
- Google Places API, called only by the Spring Boot API through `POST /api/places/nearby`.

Do not put the Places secret key in the mobile bundle. Use `.env.local` at the repo root or `server/.env.local`:

```env
GOOGLE_PLACES_API_KEY=YOUR_SERVER_SIDE_PLACES_KEY
RANDISH_GOOGLE_PLACES_ENABLED=true
PLACES_CACHE_TTL_SECONDS=600
PLACES_CACHE_DISTANCE_METERS=300
RANDISH_PLACES_MAX_RESULTS=20
```

For native map rendering, provide a Maps SDK key. It is a client-side Maps key, separate from the Places secret:

```env
GOOGLE_MAPS_API_KEY=YOUR_MAPS_SDK_KEY
# Optional when you need Expo public env access too.
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=YOUR_MAPS_SDK_KEY
```

Start both apps for local development:

```powershell
cd server
mvn spring-boot:run
```

```powershell
cd mobile
npm install
npm run start
```

Location permission is requested only after login or guest start, from the Randish location explanation screen. To retest the first-run flow, clear app storage for Expo Go / the development build, or clear browser site data on Expo Web.

Development mock mode is available only when explicitly enabled and not in production:

```env
RANDISH_PLACES_MOCK_ENABLED=true
```

Mock places are used only when Google Places is unavailable. Keep `RANDISH_PLACES_MOCK_ENABLED=false` and set `RANDISH_ENV=production` for production environments.

Places API call suppression works in two layers:

- The mobile app keeps the current candidate pool in memory for 10 minutes by default and reuses it for "もう一回". It invalidates the pool when conditions change or the center moves more than about 300m.
- The server keeps a short in-memory nearby response cache with the same default TTL and distance threshold. Server logs include new searches, cache hits, cache reuse, and invalidation reasons with the `[RANDISH_PLACES]` prefix.

For Supabase Postgres, put the Supabase connection URI in `.env.local`:

```env
RANDISH_DATABASE_URI=postgresql://postgres.project-ref:YOUR_PASSWORD@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres
```

The Spring Boot server converts this URI into JDBC settings at startup.

For Supabase Auth, add the project URL and anon public key to the same `.env.local`:

```env
SUPABASE_URL=https://project-ref.supabase.co
SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_PUBLIC_KEY
RANDISH_OAUTH_REDIRECT_URI=randish://auth/callback
```

When these are present, registration and login go through Supabase Auth first, then the authenticated user is synced into `app_users`.

For Google / Apple sign-in, enable each provider in Supabase Authentication settings and add this redirect URL:

```text
randish://auth/callback
```

During local development, the app chooses the callback for the current runtime:

```text
Expo Go: exp://YOUR_METRO_HOST:YOUR_METRO_PORT/--/auth/callback
Expo Web: http://localhost:YOUR_WEB_PORT/auth/callback
```

Add the exact local callback shown by your running app to Supabase Auth redirect URLs. You can force one with `EXPO_PUBLIC_RANDISH_OAUTH_REDIRECT_URI` when the host or port must stay fixed.

The mobile app opens Supabase OAuth, receives the callback token, and asks the Spring Boot API to verify that token before syncing the user.

## Database

Local development currently uses H2:

```properties
spring.datasource.url=jdbc:h2:file:./data/randish;MODE=PostgreSQL;DATABASE_TO_UPPER=false
```

The schema is in `server/src/main/resources/schema.sql`.

For production, the intended path is Supabase Postgres behind the Spring Boot API:

```text
Expo app -> Spring Boot API -> Supabase Postgres
```

Mobile clients should not connect directly to the database.
