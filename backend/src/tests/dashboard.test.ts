/**
 * Dashboard integration tests
 * Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7
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

// Fixed UUIDs for fixture data
const PRODUCT_ID_1 = '550e8400-e29b-41d4-a716-446655440001';
const PRODUCT_ID_2 = '550e8400-e29b-41d4-a716-446655440002';
const PRODUCT_ID_3 = '550e8400-e29b-41d4-a716-446655440003';
const ALERT_ID_1 = '550e8400-e29b-41d4-a716-446655440010';
const ALERT_ID_2 = '550e8400-e29b-41d4-a716-446655440011';

// Helper: build a date string N days from today
function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

// Helper: build a date string N days in the past
function daysAgo(n: number): string {
  return daysFromNow(-n);
}

describe('GET /dashboard', () => {
  beforeEach(() => mockQuery.mockReset());

  // The dashboard route makes 3 queries:
  //   1. SELECT near_expiry_window_days FROM settings WHERE user_id = $1
  //   2. SELECT quantity, minimum_threshold, expiry_date FROM products
  //   3. SELECT ... FROM alerts JOIN products ... WHERE acknowledged_at IS NULL

  it('returns correct totalProducts count', async () => {
    // 3 products, no expiry dates, all in-stock
    mockQuery
      .mockResolvedValueOnce({ rows: [{ near_expiry_window_days: 30 }] }) // settings
      .mockResolvedValueOnce({
        rows: [
          { quantity: 10, minimum_threshold: 5, expiry_date: null },
          { quantity: 20, minimum_threshold: 5, expiry_date: null },
          { quantity: 30, minimum_threshold: 5, expiry_date: null },
        ],
      }) // products
      .mockResolvedValueOnce({ rows: [] }); // alerts

    const res = await request(createTestApp()).get('/dashboard');

    expect(res.status).toBe(200);
    expect(res.body.totalProducts).toBe(3);
  });

  it('returns correct lowStockCount (products with 0 < qty <= threshold)', async () => {
    // 2 low-stock, 1 in-stock, 1 out-of-stock
    mockQuery
      .mockResolvedValueOnce({ rows: [{ near_expiry_window_days: 30 }] })
      .mockResolvedValueOnce({
        rows: [
          { quantity: 3, minimum_threshold: 5, expiry_date: null },  // low_stock
          { quantity: 5, minimum_threshold: 5, expiry_date: null },  // low_stock (qty == threshold)
          { quantity: 10, minimum_threshold: 5, expiry_date: null }, // in_stock
          { quantity: 0, minimum_threshold: 5, expiry_date: null },  // out_of_stock
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(createTestApp()).get('/dashboard');

    expect(res.status).toBe(200);
    expect(res.body.lowStockCount).toBe(2);
  });

  it('returns correct outOfStockCount (products with qty = 0)', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ near_expiry_window_days: 30 }] })
      .mockResolvedValueOnce({
        rows: [
          { quantity: 0, minimum_threshold: 5, expiry_date: null },  // out_of_stock
          { quantity: 0, minimum_threshold: 5, expiry_date: null },  // out_of_stock
          { quantity: 5, minimum_threshold: 5, expiry_date: null },  // low_stock
          { quantity: 10, minimum_threshold: 5, expiry_date: null }, // in_stock
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(createTestApp()).get('/dashboard');

    expect(res.status).toBe(200);
    expect(res.body.outOfStockCount).toBe(2);
  });

  it('returns correct nearExpiryCount (products with expiry within near_expiry_window)', async () => {
    const nearExpiry = daysFromNow(10);  // within 30-day window
    const farExpiry = daysFromNow(60);   // outside 30-day window

    mockQuery
      .mockResolvedValueOnce({ rows: [{ near_expiry_window_days: 30 }] })
      .mockResolvedValueOnce({
        rows: [
          { quantity: 10, minimum_threshold: 5, expiry_date: nearExpiry }, // near_expiry
          { quantity: 10, minimum_threshold: 5, expiry_date: nearExpiry }, // near_expiry
          { quantity: 10, minimum_threshold: 5, expiry_date: farExpiry },  // valid
          { quantity: 10, minimum_threshold: 5, expiry_date: null },       // no expiry
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(createTestApp()).get('/dashboard');

    expect(res.status).toBe(200);
    expect(res.body.nearExpiryCount).toBe(2);
  });

  it('returns correct expiredCount (products with expiry in the past)', async () => {
    const expired = daysAgo(5);
    const nearExpiry = daysFromNow(10);

    mockQuery
      .mockResolvedValueOnce({ rows: [{ near_expiry_window_days: 30 }] })
      .mockResolvedValueOnce({
        rows: [
          { quantity: 10, minimum_threshold: 5, expiry_date: expired },   // expired
          { quantity: 10, minimum_threshold: 5, expiry_date: expired },   // expired
          { quantity: 10, minimum_threshold: 5, expiry_date: nearExpiry }, // near_expiry
          { quantity: 10, minimum_threshold: 5, expiry_date: null },       // no expiry
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(createTestApp()).get('/dashboard');

    expect(res.status).toBe(200);
    expect(res.body.expiredCount).toBe(2);
  });

  it('returns activeAlerts list (only unacknowledged alerts)', async () => {
    const alertRow1 = {
      id: ALERT_ID_1,
      product_id: PRODUCT_ID_1,
      product_name: 'Milk',
      alert_type: 'low_stock',
      generated_at: '2024-01-01T00:00:00.000Z',
      acknowledged_at: null,
    };
    const alertRow2 = {
      id: ALERT_ID_2,
      product_id: PRODUCT_ID_2,
      product_name: 'Yogurt',
      alert_type: 'near_expiry',
      generated_at: '2024-01-02T00:00:00.000Z',
      acknowledged_at: null,
    };

    mockQuery
      .mockResolvedValueOnce({ rows: [{ near_expiry_window_days: 30 }] })
      .mockResolvedValueOnce({ rows: [] }) // no products
      .mockResolvedValueOnce({ rows: [alertRow1, alertRow2] });

    const res = await request(createTestApp()).get('/dashboard');

    expect(res.status).toBe(200);
    expect(res.body.activeAlerts).toHaveLength(2);
    expect(res.body.activeAlerts[0]).toMatchObject({
      id: ALERT_ID_1,
      productId: PRODUCT_ID_1,
      productName: 'Milk',
      alertType: 'low_stock',
      acknowledgedAt: null,
    });
    expect(res.body.activeAlerts[1]).toMatchObject({
      id: ALERT_ID_2,
      productId: PRODUCT_ID_2,
      productName: 'Yogurt',
      alertType: 'near_expiry',
      acknowledgedAt: null,
    });
  });

  it('returns empty activeAlerts when all alerts are acknowledged', async () => {
    // The SQL query filters acknowledged_at IS NULL, so DB returns empty rows
    mockQuery
      .mockResolvedValueOnce({ rows: [{ near_expiry_window_days: 30 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] }); // no unacknowledged alerts

    const res = await request(createTestApp()).get('/dashboard');

    expect(res.status).toBe(200);
    expect(res.body.activeAlerts).toEqual([]);
  });

  it('uses default near_expiry_window of 30 when no settings row exists', async () => {
    // Expiry date exactly 30 days from now — should be near_expiry with default window of 30
    const exactlyAtWindow = daysFromNow(30);

    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // no settings row → default 30
      .mockResolvedValueOnce({
        rows: [
          { quantity: 10, minimum_threshold: 5, expiry_date: exactlyAtWindow },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(createTestApp()).get('/dashboard');

    expect(res.status).toBe(200);
    expect(res.body.nearExpiryCount).toBe(1);
    expect(res.body.expiredCount).toBe(0);
  });

  it('returns all counts as zero for an empty product catalog', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ near_expiry_window_days: 30 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(createTestApp()).get('/dashboard');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      totalProducts: 0,
      lowStockCount: 0,
      outOfStockCount: 0,
      nearExpiryCount: 0,
      expiredCount: 0,
      activeAlerts: [],
    });
  });

  it('returns correct mixed counts across all status types', async () => {
    const expired = daysAgo(3);
    const nearExpiry = daysFromNow(7);

    mockQuery
      .mockResolvedValueOnce({ rows: [{ near_expiry_window_days: 30 }] })
      .mockResolvedValueOnce({
        rows: [
          { quantity: 0, minimum_threshold: 5, expiry_date: null },       // out_of_stock
          { quantity: 3, minimum_threshold: 5, expiry_date: null },       // low_stock
          { quantity: 10, minimum_threshold: 5, expiry_date: null },      // in_stock
          { quantity: 10, minimum_threshold: 5, expiry_date: nearExpiry }, // near_expiry
          { quantity: 10, minimum_threshold: 5, expiry_date: expired },   // expired
          { quantity: 10, minimum_threshold: 5, expiry_date: null },      // in_stock, no expiry
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(createTestApp()).get('/dashboard');

    expect(res.status).toBe(200);
    expect(res.body.totalProducts).toBe(6);
    expect(res.body.outOfStockCount).toBe(1);
    expect(res.body.lowStockCount).toBe(1);
    expect(res.body.nearExpiryCount).toBe(1);
    expect(res.body.expiredCount).toBe(1);
  });

  it('includes product_id and product_name in each active alert', async () => {
    const alertRow = {
      id: ALERT_ID_1,
      product_id: PRODUCT_ID_3,
      product_name: 'Cheese',
      alert_type: 'out_of_stock',
      generated_at: '2024-03-01T00:00:00.000Z',
      acknowledged_at: null,
    };

    mockQuery
      .mockResolvedValueOnce({ rows: [{ near_expiry_window_days: 30 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [alertRow] });

    const res = await request(createTestApp()).get('/dashboard');

    expect(res.status).toBe(200);
    expect(res.body.activeAlerts[0]).toMatchObject({
      productId: PRODUCT_ID_3,
      productName: 'Cheese',
      alertType: 'out_of_stock',
    });
  });
});
