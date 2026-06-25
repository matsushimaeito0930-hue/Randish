# Randish Mobile

Expo / React Native app for Randish.

```powershell
npm install
npm run start
```

See the root `README.md` for the API server and environment setup.

The map roulette renders Google Maps through `react-native-maps` on native Expo targets. Expo Web uses the same roulette flow with a lightweight fallback map layer; Places search still goes through the Spring Boot API.
