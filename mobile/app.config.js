const appJson = require('./app.json');

const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';

module.exports = {
  ...appJson.expo,
  ios: {
    ...appJson.expo.ios,
    config: {
      ...(appJson.expo.ios?.config ?? {}),
      ...(googleMapsApiKey ? { googleMapsApiKey } : {}),
    },
  },
  android: {
    ...appJson.expo.android,
    config: {
      ...(appJson.expo.android?.config ?? {}),
      googleMaps: {
        ...(appJson.expo.android?.config?.googleMaps ?? {}),
        ...(googleMapsApiKey ? { apiKey: googleMapsApiKey } : {}),
      },
    },
  },
};
