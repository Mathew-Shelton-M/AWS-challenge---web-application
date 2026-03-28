import { authFetch } from './client';

export interface Category {
  id: string;
  name: string;
  createdAt?: string;
}

export async function fetchCategories(): Promise<Category[]> {
  const res = await authFetch('/api/categories');
  if (res.status === 401) throw new Error('UNAUTHORIZED');
  if (!res.ok) throw new Error('Failed to fetch categories');
  return res.json();
}

export async function createCategory(name: string): Promise<Category> {
  const res = await authFetch('/api/categories', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  if (res.status === 401) throw new Error('UNAUTHORIZED');
  if (!res.ok) throw new Error('Failed to create category');
  return res.json();
}

export async function renameCategory(id: string, name: string): Promise<Category> {
  const res = await authFetch(`/api/categories/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name }),
  });
  if (res.status === 401) throw new Error('UNAUTHORIZED');
  if (!res.ok) throw new Error('Failed to rename category');
  return res.json();
}

export async function deleteCategory(id: string): Promise<void> {
  const res = await authFetch(`/api/categories/${id}`, { method: 'DELETE' });
  if (res.status === 401) throw new Error('UNAUTHORIZED');
  if (res.status === 409) throw new Error('CONFLICT');
  if (!res.ok) throw new Error('Failed to delete category');
}
