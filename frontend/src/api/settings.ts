import { authFetch } from './client';

export interface Settings {
  nearExpiryWindowDays: number;
  emailNotificationsEnabled: boolean;
  smsNotificationsEnabled: boolean;
}

export async function fetchSettings(): Promise<Settings> {
  const res = await authFetch('/api/settings');
  if (res.status === 401) throw new Error('UNAUTHORIZED');
  if (!res.ok) throw new Error('Failed to fetch settings');
  return res.json();
}

export async function updateSettings(data: Settings): Promise<Settings> {
  const res = await authFetch('/api/settings', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  if (res.status === 401) throw new Error('UNAUTHORIZED');
  if (!res.ok) throw new Error('Failed to update settings');
  return res.json();
}
