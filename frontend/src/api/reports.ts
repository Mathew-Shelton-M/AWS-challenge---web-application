import { authFetch } from './client';

export interface StockUsageRow {
  productId: string;
  productName: string;
  totalAdded: number;
  totalRemoved: number;
  netChange: number;
}

export interface ExpiryWastageRow {
  productId: string;
  productName: string;
  expiryDate: string;
  quantityWasted: number;
}

export interface TopRestockedRow {
  productId: string;
  productName: string;
  restockCount: number;
  totalAdded: number;
}

export type ReportType = 'stock-usage' | 'expiry-wastage' | 'top-restocked';

export async function fetchStockUsage(startDate: string, endDate: string): Promise<StockUsageRow[]> {
  const res = await authFetch(`/api/reports/stock-usage?startDate=${startDate}&endDate=${endDate}`);
  if (!res.ok) throw new Error('Failed to fetch stock usage report');
  return res.json();
}

export async function fetchExpiryWastage(startDate: string, endDate: string): Promise<ExpiryWastageRow[]> {
  const res = await authFetch(`/api/reports/expiry-wastage?startDate=${startDate}&endDate=${endDate}`);
  if (!res.ok) throw new Error('Failed to fetch expiry wastage report');
  return res.json();
}

export async function fetchTopRestocked(startDate: string, endDate: string): Promise<TopRestockedRow[]> {
  const res = await authFetch(`/api/reports/top-restocked?startDate=${startDate}&endDate=${endDate}`);
  if (!res.ok) throw new Error('Failed to fetch top restocked report');
  return res.json();
}

export async function downloadReportCsv(
  type: ReportType,
  startDate: string,
  endDate: string,
): Promise<void> {
  const res = await authFetch(`/api/reports/${type}/csv?startDate=${startDate}&endDate=${endDate}`);
  if (!res.ok) throw new Error('Failed to download CSV');
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${type}-${startDate}-${endDate}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}
