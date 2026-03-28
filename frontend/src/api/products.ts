import { authFetch } from './client';

export interface Product {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  quantity: number;
  minimumThreshold: number | null;
  expiryDate: string | null;
  rack: string | null;
  shelf: string | null;
  section: string | null;
  stockStatus: 'In Stock' | 'Low Stock' | 'Out of Stock';
  expiryStatus: 'Valid' | 'Near Expiry' | 'Expired' | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductFormData {
  name: string;
  categoryId: string;
  quantity: number;
  minimumThreshold?: number;
  expiryDate?: string;
  rack?: string;
  shelf?: string;
  section?: string;
}

export interface ProductFilters {
  q?: string;
  category?: string;
  stockStatus?: string;
  expiryStatus?: string;
}

export async function fetchProducts(params: ProductFilters = {}): Promise<Product[]> {
  const query = new URLSearchParams();
  if (params.q) query.set('q', params.q);
  if (params.category) query.set('category', params.category);
  if (params.stockStatus) query.set('stockStatus', params.stockStatus);
  if (params.expiryStatus) query.set('expiryStatus', params.expiryStatus);

  const qs = query.toString();
  const res = await authFetch(`/api/products${qs ? `?${qs}` : ''}`);
  if (res.status === 401) throw new Error('UNAUTHORIZED');
  if (!res.ok) throw new Error('Failed to fetch products');
  return res.json();
}

export async function fetchProduct(id: string): Promise<Product> {
  const res = await authFetch(`/api/products/${id}`);
  if (res.status === 401) throw new Error('UNAUTHORIZED');
  if (!res.ok) throw new Error('Failed to fetch product');
  return res.json();
}

export async function createProduct(data: ProductFormData): Promise<Product> {
  const res = await authFetch('/api/products', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (res.status === 401) throw new Error('UNAUTHORIZED');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error(body.error || 'Failed to create product'), { status: res.status, body });
  }
  return res.json();
}

export async function updateProduct(id: string, data: ProductFormData): Promise<Product> {
  const res = await authFetch(`/api/products/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  if (res.status === 401) throw new Error('UNAUTHORIZED');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error(body.error || 'Failed to update product'), { status: res.status, body });
  }
  return res.json();
}

export async function deleteProduct(id: string): Promise<void> {
  const res = await authFetch(`/api/products/${id}`, { method: 'DELETE' });
  if (res.status === 401) throw new Error('UNAUTHORIZED');
  if (!res.ok) throw new Error('Failed to delete product');
}
