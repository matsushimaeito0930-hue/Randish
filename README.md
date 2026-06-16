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

The API binds to `127.0.0.1` by default. For physical-phone LAN testing, set this in `.env.local` before starting the server:

```env
RANDISH_SERVER_ADDRESS=0.0.0.0
```

## Environment Variables

Create `.env.local` from `.env.example` when API keys or database credentials are needed.

Never commit `.env.local`, database passwords, API keys, keystores, or production secrets.

Security-related defaults:

- H2 console and `/api/debug/**` are disabled unless explicitly enabled.
- Browser CORS is limited to local development origins unless `RANDISH_CORS_ALLOWED_ORIGINS` is set.
- API requests are rate-limited by default; tune the `RANDISH_RATE_LIMIT_*` values for production traffic.
- Mobile native clients do not need CORS; Expo Web does.

RANDISH uses Hot Pepper Gourmet as the primary restaurant source. Google Places is a paid fallback only:

- Hot Pepper is queried first and owns the main candidate pool.
- Google Places is disabled by default.
- Google Places is used only when explicitly enabled and Hot Pepper does not fill the target candidate count.
- Google fallback is capped per request and by a per-server-session request limit.

To intentionally test Google fallback, set both values locally:

```env
RANDISH_GOOGLE_PLACES_ENABLED=true
RANDISH_GOOGLE_PLACES_SESSION_LIMIT=30
GOOGLE_PLACES_API_KEY=YOUR_LOCAL_KEY
```

For Supabase Postgres, put the Supabase connection URI in `.env.local`:

```env
RANDISH_DATABASE_URI=postgresql://postgres.project-ref:YOUR_PASSWORD@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres
```

The Spring Boot server converts this URI into JDBC settings at startup.

For Supabase Auth, add the project URL and anon public key to the same `.env.local`:

```env
SUPABASE_URL=https://project-ref.supabase.co
SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_PUBLIC_KEY
```

When these are present, registration and login go through Supabase Auth first, then the authenticated user is synced into `app_users`.

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
