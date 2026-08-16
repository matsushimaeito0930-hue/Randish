import MapView, { Circle, Marker, PROVIDER_GOOGLE } from 'react-native-maps';

export const getNativeMapModule = () => ({
  default: MapView,
  Marker,
  // 距離の範囲を描く円。Web版は自前で重ねているが、こちらは地図が
  // 実際の縮尺で描いてくれるので、そちらに任せる。
  Circle,
  PROVIDER_GOOGLE,
});
