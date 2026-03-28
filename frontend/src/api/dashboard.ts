import { authFetch } from './client';

export interface Alert {
  id: string;
  productId: string;
  productName: string;
  alertType: 'low_stock' | 'out_of_stock' | 'near_expiry' | 'expired';
  generatedAt: string;
  acknowledgedAt: string | null;
}

export interface DashboardResponse {
  totalProducts: number;
  lowStockCount: number;
  outOfStockCount: number;
  nearExpiryCount: number;
  expiredCount: number;
  activeAlerts: Alert[];
}

export async function fetchDashboard(): Promise<DashboardResponse> {
  const response = await authFetch('/api/dashboard');

  if (response.status === 401) {
    throw new Error('UNAUTHORIZED');
  }

  if (!response.ok) {
    throw new Error('NETWORK_ERROR');
  }

  return response.json();
}

export async function acknowledgeAlert(id: string): Promise<void> {
  const response = await authFetch(`/api/alerts/${id}/acknowledge`, {
    method: 'PUT',
  });

  if (response.status === 401) {
    throw new Error('UNAUTHORIZED');
  }

  if (!response.ok) {
    throw new Error('NETWORK_ERROR');
  }
}
