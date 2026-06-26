import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';

export const getNativeMapModule = () => ({
  default: MapView,
  Marker,
  PROVIDER_GOOGLE,
});
