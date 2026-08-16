export type NativeMapModule = {
  default: any;
  Marker: any;
  /** 距離の範囲を描く円。react-native-maps が実際の縮尺で描いてくれる。 */
  Circle?: any;
  PROVIDER_GOOGLE?: string;
};

export const getNativeMapModule = (): NativeMapModule | null => null;
