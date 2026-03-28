/**
 * Categories integration tests
 * Validates: Requirement 3.1 (create, rename, delete categories)
 */

import request from 'supertest';
import { createTestApp } from './helpers';

// Mock the DB pool
jest.mock('../db/pool', () => {
  const mockQuery = jest.fn();
  return {
    __esModule: true,
    default: {
      query: mockQuery,
      end: jest.fn().mockResolvedValue(undefined),
    },
  };
});

// Mock the auth middleware to always authenticate as a test user
jest.mock('../middleware/auth', () => ({
  authenticate: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import pool from '../db/pool';

const mockQuery = pool.query as jest.Mock;

const CATEGORY_ROW = {
  id: 'cat-uuid-1234',
  name: 'Dairy',
  createdAt: '2024-01-01T00:00:00.000Z',
};

describe('POST /categories', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('returns 201 with id, name, createdAt on valid name', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [CATEGORY_ROW] });

    const res = await request(createTestApp())
      .post('/categories')
      .send({ name: 'Dairy' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(CATEGORY_ROW);
  });

  it('returns 422 when name is missing', async () => {
    const res = await request(createTestApp())
      .post('/categories')
      .send({});

    expect(res.status).toBe(422);
    expect(res.body).toHaveProperty('errors');
  });

  it('returns 422 when name is empty string', async () => {
    const res = await request(createTestApp())
      .post('/categories')
      .send({ name: '' });

    expect(res.status).toBe(422);
    expect(res.body).toHaveProperty('errors');
  });

  it('returns 409 when category name already exists', async () => {
    const uniqueViolation = Object.assign(new Error('duplicate key'), { code: '23505' });
    mockQuery.mockRejectedValueOnce(uniqueViolation);

    const res = await request(createTestApp())
      .post('/categories')
      .send({ name: 'Dairy' });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Category already exists' });
  });
});

describe('PUT /categories/:id', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('returns 200 with updated category on valid rename', async () => {
    const updated = { ...CATEGORY_ROW, name: 'Beverages' };
    mockQuery.mockResolvedValueOnce({ rows: [updated] });

    const res = await request(createTestApp())
      .put('/categories/cat-uuid-1234')
      .send({ name: 'Beverages' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(updated);
  });

  it('returns 404 when category does not exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(createTestApp())
      .put('/categories/nonexistent-id')
      .send({ name: 'Beverages' });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Category not found' });
  });

  it('returns 409 when new name already exists', async () => {
    const uniqueViolation = Object.assign(new Error('duplicate key'), { code: '23505' });
    mockQuery.mockRejectedValueOnce(uniqueViolation);

    const res = await request(createTestApp())
      .put('/categories/cat-uuid-1234')
      .send({ name: 'Dairy' });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Category already exists' });
  });

  it('returns 422 when name is missing', async () => {
    const res = await request(createTestApp())
      .put('/categories/cat-uuid-1234')
      .send({});

    expect(res.status).toBe(422);
    expect(res.body).toHaveProperty('errors');
  });

  it('returns 422 when name is empty string', async () => {
    const res = await request(createTestApp())
      .put('/categories/cat-uuid-1234')
      .send({ name: '' });

    expect(res.status).toBe(422);
    expect(res.body).toHaveProperty('errors');
  });
});

describe('DELETE /categories/:id', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('returns 204 when category exists and has no products', async () => {
    // First query: product check returns empty
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // Second query: delete returns the deleted row
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'cat-uuid-1234' }] });

    const res = await request(createTestApp())
      .delete('/categories/cat-uuid-1234');

    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
  });

  it('returns 409 when category has existing products', async () => {
    // Product check returns a row (products exist)
    mockQuery.mockResolvedValueOnce({ rows: [{ 1: 1 }] });

    const res = await request(createTestApp())
      .delete('/categories/cat-uuid-1234');

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Cannot delete category with existing products' });
  });

  it('returns 404 when category does not exist', async () => {
    // Product check returns empty
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // Delete returns no rows (category not found)
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(createTestApp())
      .delete('/categories/nonexistent-id');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Category not found' });
  });
});
