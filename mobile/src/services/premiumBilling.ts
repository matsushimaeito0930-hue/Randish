import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';

type RuntimeEnv = {
  process?: {
    env?: Record<string, string | undefined>;
  };
};

type CustomerInfoLike = {
  entitlements?: {
    active?: Record<string, unknown>;
  };
};

export type PremiumPurchaseResult = {
  isPro: boolean;
  completed: boolean;
  message: string;
};

const runtimeGlobal = globalThis as RuntimeEnv;

const getEnvValue = (key: string) => runtimeGlobal.process?.env?.[key]?.trim() || '';

export const PREMIUM_ENTITLEMENT_ID = getEnvValue('EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID') || 'premium';

// Keep native RevenueCat status as an explicit sandbox/dev opt-in. Server-side status should
// be the source of truth once RevenueCat webhooks are connected.
export const TRUST_NATIVE_REVENUECAT_STATUS =
  getEnvValue('EXPO_PUBLIC_TRUST_NATIVE_REVENUECAT_STATUS').toLowerCase() === 'true';

const getRevenueCatApiKey = () => {
  if (Platform.OS === 'ios') {
    return getEnvValue('EXPO_PUBLIC_REVENUECAT_IOS_API_KEY');
  }
  if (Platform.OS === 'android') {
    return getEnvValue('EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY');
  }
  return getEnvValue('EXPO_PUBLIC_REVENUECAT_WEB_API_KEY');
};

let configuredUserId: string | null = null;

const hasActivePremiumEntitlement = (customerInfo: CustomerInfoLike | null | undefined) =>
  Boolean(customerInfo?.entitlements?.active?.[PREMIUM_ENTITLEMENT_ID]);

const ensureRevenueCatConfigured = async (userId: string) => {
  const apiKey = getRevenueCatApiKey();
  if (!apiKey) {
    throw new Error('RevenueCat API key is not configured.');
  }
  if (Platform.OS === 'web') {
    throw new Error('Web billing is not enabled in this app yet.');
  }
  if (configuredUserId === userId) {
    return;
  }

  await Purchases.setLogLevel(LOG_LEVEL.INFO);
  Purchases.configure({ apiKey, appUserID: userId });
  configuredUserId = userId;
};

export const getNativeBillingSetupMessage = () => {
  if (Platform.OS === 'web') {
    return 'Webではアプリ内課金を実行できません。iOS/Androidの開発ビルドで確認してください。';
  }
  if (!getRevenueCatApiKey()) {
    return 'RevenueCatの公開APIキーが未設定です。';
  }
  return null;
};

export const refreshNativePremiumStatus = async (userId: string): Promise<boolean> => {
  await ensureRevenueCatConfigured(userId);
  const customerInfo = await Purchases.getCustomerInfo();
  return hasActivePremiumEntitlement(customerInfo);
};

export const presentPremiumPaywall = async (userId: string): Promise<PremiumPurchaseResult> => {
  await ensureRevenueCatConfigured(userId);
  const result = await RevenueCatUI.presentPaywallIfNeeded({
    requiredEntitlementIdentifier: PREMIUM_ENTITLEMENT_ID,
    displayCloseButton: true,
  });
  const customerInfo = await Purchases.getCustomerInfo();
  const isPro = hasActivePremiumEntitlement(customerInfo);

  if (result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED || result === PAYWALL_RESULT.NOT_PRESENTED) {
    return {
      isPro,
      completed: isPro,
      message: isPro ? 'RANDISH Premiumが有効になりました。' : '購入状態を確認しました。',
    };
  }
  if (result === PAYWALL_RESULT.CANCELLED) {
    return {
      isPro,
      completed: false,
      message: '購入はキャンセルされました。',
    };
  }
  return {
    isPro,
    completed: false,
    message: '購入処理を完了できませんでした。',
  };
};

export const restorePremiumPurchases = async (userId: string): Promise<PremiumPurchaseResult> => {
  await ensureRevenueCatConfigured(userId);
  const customerInfo = await Purchases.restorePurchases();
  const isPro = hasActivePremiumEntitlement(customerInfo);
  return {
    isPro,
    completed: isPro,
    message: isPro ? '購入履歴を復元しました。' : '復元できるRANDISH Premium購入は見つかりませんでした。',
  };
};
