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

## Environment Variables

Create `.env.local` from `.env.example` when API keys or database credentials are needed.

Never commit `.env.local`, database passwords, API keys, keystores, or production secrets.

For Supabase Postgres, put the Supabase connection URI in `.env.local`:

```env
RANDISH_DATABASE_URI=postgresql://postgres.project-ref:YOUR_PASSWORD@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres
```

The Spring Boot server converts this URI into JDBC settings at startup.

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
