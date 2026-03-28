/**
 * Reports integration tests
 * Validates: Requirements 10.1, 10.2, 10.3, 10.5
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

// Mock auth middleware to always authenticate
jest.mock('../middleware/auth', () => ({
  authenticate: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import pool from '../db/pool';

const mockQuery = pool.query as jest.Mock;

const PRODUCT_ID_1 = '550e8400-e29b-41d4-a716-446655440001';
const PRODUCT_ID_2 = '550e8400-e29b-41d4-a716-446655440002';

describe('GET /reports/stock-usage', () => {
  beforeEach(() => mockQuery.mockReset());

  it('returns 400 when startDate is missing', async () => {
    const res = await request(createTestApp()).get('/reports/stock-usage?endDate=2024-01-31');
    expect(res.status).toBe(400);
  });

  it('returns 400 when endDate is missing', async () => {
    const res = await request(createTestApp()).get('/reports/stock-usage?startDate=2024-01-01');
    expect(res.status).toBe(400);
  });

  it('returns 400 when date format is invalid', async () => {
    const res = await request(createTestApp()).get('/reports/stock-usage?startDate=01-01-2024&endDate=31-01-2024');
    expect(res.status).toBe(400);
  });

  it('returns grouped stock usage data for valid date range', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          productId: PRODUCT_ID_1,
          productName: 'Milk',
          totalAdded: 50,
          totalRemoved: 20,
          netChange: 30,
          movements: [
            { id: 'mov-1', delta: 50, quantityAfter: 50, recordedAt: '2024-01-05T10:00:00Z' },
            { id: 'mov-2', delta: -20, quantityAfter: 30, recordedAt: '2024-01-10T10:00:00Z' },
          ],
        },
      ],
    });

    const res = await request(createTestApp()).get('/reports/stock-usage?startDate=2024-01-01&endDate=2024-01-31');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      productId: PRODUCT_ID_1,
      productName: 'Milk',
      totalAdded: 50,
      totalRemoved: 20,
      netChange: 30,
    });
    expect(res.body[0].movements).toHaveLength(2);
  });

  it('returns empty array when no movements in date range', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(createTestApp()).get('/reports/stock-usage?startDate=2024-01-01&endDate=2024-01-31');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns multiple products grouped correctly', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { productId: PRODUCT_ID_1, productName: 'Milk', totalAdded: 100, totalRemoved: 40, netChange: 60, movements: [] },
        { productId: PRODUCT_ID_2, productName: 'Yogurt', totalAdded: 30, totalRemoved: 10, netChange: 20, movements: [] },
      ],
    });

    const res = await request(createTestApp()).get('/reports/stock-usage?startDate=2024-01-01&endDate=2024-01-31');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].productName).toBe('Milk');
    expect(res.body[1].productName).toBe('Yogurt');
  });
});

describe('GET /reports/expiry-wastage', () => {
  beforeEach(() => mockQuery.mockReset());

  it('returns 400 when date range is missing', async () => {
    const res = await request(createTestApp()).get('/reports/expiry-wastage');
    expect(res.status).toBe(400);
  });

  it('returns products with expiry dates in range', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { productId: PRODUCT_ID_1, productName: 'Cheese', expiryDate: '2024-01-15', quantityWasted: 5 },
        { productId: PRODUCT_ID_2, productName: 'Butter', expiryDate: '2024-01-20', quantityWasted: 3 },
      ],
    });

    const res = await request(createTestApp()).get('/reports/expiry-wastage?startDate=2024-01-01&endDate=2024-01-31');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toMatchObject({
      productId: PRODUCT_ID_1,
      productName: 'Cheese',
      expiryDate: '2024-01-15',
      quantityWasted: 5,
    });
  });

  it('returns empty array when no products expired in range', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(createTestApp()).get('/reports/expiry-wastage?startDate=2024-01-01&endDate=2024-01-31');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('GET /reports/top-restocked', () => {
  beforeEach(() => mockQuery.mockReset());

  it('returns 400 when date range is missing', async () => {
    const res = await request(createTestApp()).get('/reports/top-restocked');
    expect(res.status).toBe(400);
  });

  it('returns top restocked products in descending order', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { productId: PRODUCT_ID_1, productName: 'Milk', restockCount: 10, totalAdded: 500 },
        { productId: PRODUCT_ID_2, productName: 'Yogurt', restockCount: 5, totalAdded: 200 },
      ],
    });

    const res = await request(createTestApp()).get('/reports/top-restocked?startDate=2024-01-01&endDate=2024-01-31');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].restockCount).toBeGreaterThanOrEqual(res.body[1].restockCount);
    expect(res.body[0]).toMatchObject({
      productId: PRODUCT_ID_1,
      productName: 'Milk',
      restockCount: 10,
      totalAdded: 500,
    });
  });

  it('returns at most 10 entries', async () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      productId: `product-${i}`,
      productName: `Product ${i}`,
      restockCount: 10 - i,
      totalAdded: (10 - i) * 50,
    }));
    mockQuery.mockResolvedValueOnce({ rows });

    const res = await request(createTestApp()).get('/reports/top-restocked?startDate=2024-01-01&endDate=2024-01-31');

    expect(res.status).toBe(200);
    expect(res.body.length).toBeLessThanOrEqual(10);
  });

  it('returns empty array when no restock movements in range', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(createTestApp()).get('/reports/top-restocked?startDate=2024-01-01&endDate=2024-01-31');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('GET /reports/:type/csv', () => {
  beforeEach(() => mockQuery.mockReset());

  it('returns 400 for invalid report type', async () => {
    const res = await request(createTestApp()).get('/reports/invalid-type/csv?startDate=2024-01-01&endDate=2024-01-31');
    expect(res.status).toBe(400);
  });

  it('returns 400 when date range is missing', async () => {
    const res = await request(createTestApp()).get('/reports/stock-usage/csv');
    expect(res.status).toBe(400);
  });

  it('returns CSV with correct Content-Type and Content-Disposition for stock-usage', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { productId: PRODUCT_ID_1, productName: 'Milk', totalAdded: 50, totalRemoved: 20, netChange: 30 },
      ],
    });

    const res = await request(createTestApp()).get('/reports/stock-usage/csv?startDate=2024-01-01&endDate=2024-01-31');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toBe('attachment; filename="stock-usage-report.csv"');
    expect(res.text).toContain('productId');
    expect(res.text).toContain('productName');
    expect(res.text).toContain('Milk');
  });

  it('returns CSV with correct headers for expiry-wastage', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { productId: PRODUCT_ID_1, productName: 'Cheese', expiryDate: '2024-01-15', quantityWasted: 5 },
      ],
    });

    const res = await request(createTestApp()).get('/reports/expiry-wastage/csv?startDate=2024-01-01&endDate=2024-01-31');

    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toBe('attachment; filename="expiry-wastage-report.csv"');
    expect(res.text).toContain('expiryDate');
    expect(res.text).toContain('quantityWasted');
    expect(res.text).toContain('Cheese');
  });

  it('returns CSV with correct headers for top-restocked', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { productId: PRODUCT_ID_1, productName: 'Milk', restockCount: 10, totalAdded: 500 },
      ],
    });

    const res = await request(createTestApp()).get('/reports/top-restocked/csv?startDate=2024-01-01&endDate=2024-01-31');

    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toBe('attachment; filename="top-restocked-report.csv"');
    expect(res.text).toContain('restockCount');
    expect(res.text).toContain('totalAdded');
    expect(res.text).toContain('Milk');
  });

  it('returns CSV with empty data (header only) when no rows', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(createTestApp()).get('/reports/stock-usage/csv?startDate=2024-01-01&endDate=2024-01-31');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    // Should still have headers even with no data
    expect(res.text).toContain('productId');
  });
});
