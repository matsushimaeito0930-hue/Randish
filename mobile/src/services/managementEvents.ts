import { Platform } from 'react-native';

type DrawEventInput = {
  eventId: string;
  userId?: string | null;
};

const getEnvValue = (key: string) => {
  const runtime = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };
  return runtime.process?.env?.[key]?.trim() || '';
};

const getManagementBaseUrl = () => {
  const configured = getEnvValue('EXPO_PUBLIC_RANDISH_MANAGEMENT_URL');
  if (configured) {
    return configured.replace(/\/$/, '');
  }
  return Platform.OS === 'web' ? 'http://localhost:8787' : '';
};

export const sendManagementDrawEvent = async ({ eventId, userId }: DrawEventInput) => {
  const baseUrl = getManagementBaseUrl();
  if (!baseUrl) {
    return;
  }

  const response = await fetch(`${baseUrl}/api/webhooks/draw`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-webhook-secret': getEnvValue('EXPO_PUBLIC_RANDISH_MANAGEMENT_SECRET') || 'randish-local-secret',
    },
    body: JSON.stringify({
      eventId,
      platform: Platform.OS === 'web' ? 'web' : Platform.OS,
      count: 1,
      userId: userId || undefined,
    }),
  });

  if (!response.ok) {
    throw new Error(`Management webhook failed: ${response.status}`);
  }
};
