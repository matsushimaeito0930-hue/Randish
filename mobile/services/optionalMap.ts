export type NativeMapModule = {
  default: any;
  Marker: any;
  PROVIDER_GOOGLE?: string;
};

export const getNativeMapModule = (): NativeMapModule | null => null;
