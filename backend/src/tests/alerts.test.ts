/**
 * Alerts integration tests
 * Validates: Requirements 5 (Alert Management)
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

const PRODUCT_ID = '550e8400-e29b-41d4-a716-446655440001';
const ALERT_ID = '550e8400-e29b-41d4-a716-446655440010';

const LOW_STOCK_ALERT_ROW = {
  id: ALERT_ID,
  product_id: PRODUCT_ID,
  product_name: 'Milk',
  alert_type: 'low_stock',
  generated_at: '2024-01-01T00:00:00.000Z',
  acknowledged_at: null,
};

const OUT_OF_STOCK_ALERT_ROW = {
  id: ALERT_ID,
  product_id: PRODUCT_ID,
  product_name: 'Milk',
  alert_type: 'out_of_stock',
  generated_at: '2024-01-01T00:00:00.000Z',
  acknowledged_at: null,
};

const NEAR_EXPIRY_ALERT_ROW = {
  id: ALERT_ID,
  product_id: PRODUCT_ID,
  product_name: 'Yogurt',
  alert_type: 'near_expiry',
  generated_at: '2024-01-01T00:00:00.000Z',
  acknowledged_at: null,
};

const EXPIRED_ALERT_ROW = {
  id: ALERT_ID,
  product_id: PRODUCT_ID,
  product_name: 'Yogurt',
  alert_type: 'expired',
  generated_at: '2024-01-01T00:00:00.000Z',
  acknowledged_at: null,
};

describe('GET /alerts', () => {
  beforeEach(() => mockQuery.mockReset());

  it('returns only unacknowledged alerts', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [LOW_STOCK_ALERT_ROW] });

    const res = await request(createTestApp()).get('/alerts');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].acknowledgedAt).toBeNull();
  });

  it('returns empty array when no active alerts', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(createTestApp()).get('/alerts');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns alert generated on low_stock transition', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [LOW_STOCK_ALERT_ROW] });

    const res = await request(createTestApp()).get('/alerts');

    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({
      productId: PRODUCT_ID,
      productName: 'Milk',
      alertType: 'low_stock',
      acknowledgedAt: null,
    });
  });

  it('returns alert generated on out_of_stock transition', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [OUT_OF_STOCK_ALERT_ROW] });

    const res = await request(createTestApp()).get('/alerts');

    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({
      productId: PRODUCT_ID,
      productName: 'Milk',
      alertType: 'out_of_stock',
      acknowledgedAt: null,
    });
  });

  it('returns alert generated for near_expiry product', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [NEAR_EXPIRY_ALERT_ROW] });

    const res = await request(createTestApp()).get('/alerts');

    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({
      productId: PRODUCT_ID,
      productName: 'Yogurt',
      alertType: 'near_expiry',
      acknowledgedAt: null,
    });
  });

  it('returns alert generated for expired product', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [EXPIRED_ALERT_ROW] });

    const res = await request(createTestApp()).get('/alerts');

    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({
      productId: PRODUCT_ID,
      productName: 'Yogurt',
      alertType: 'expired',
      acknowledgedAt: null,
    });
  });

  it('does not return acknowledged alerts', async () => {
    // The query filters acknowledged_at IS NULL, so DB returns empty
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(createTestApp()).get('/alerts');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('PUT /alerts/:id/acknowledge', () => {
  beforeEach(() => mockQuery.mockReset());

  it('acknowledges an alert and removes it from active list', async () => {
    const acknowledgedAt = '2024-01-02T00:00:00.000Z';

    // First: acknowledge the alert
    mockQuery
      .mockResolvedValueOnce({
        rows: [{
          id: ALERT_ID,
          product_id: PRODUCT_ID,
          alert_type: 'low_stock',
          generated_at: '2024-01-01T00:00:00.000Z',
          acknowledged_at: acknowledgedAt,
        }],
      })
      .mockResolvedValueOnce({ rows: [{ product_name: 'Milk' }] });

    const ackRes = await request(createTestApp())
      .put(`/alerts/${ALERT_ID}/acknowledge`);

    expect(ackRes.status).toBe(200);
    expect(ackRes.body.acknowledgedAt).not.toBeNull();

    // Second: GET /alerts returns empty (acknowledged alert filtered out)
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const listRes = await request(createTestApp()).get('/alerts');

    expect(listRes.status).toBe(200);
    expect(listRes.body).toEqual([]);
  });

  it('returns 200 with acknowledgedAt set after acknowledging', async () => {
    const acknowledgedAt = '2024-01-02T12:00:00.000Z';

    mockQuery
      .mockResolvedValueOnce({
        rows: [{
          id: ALERT_ID,
          product_id: PRODUCT_ID,
          alert_type: 'out_of_stock',
          generated_at: '2024-01-01T00:00:00.000Z',
          acknowledged_at: acknowledgedAt,
        }],
      })
      .mockResolvedValueOnce({ rows: [{ product_name: 'Milk' }] });

    const res = await request(createTestApp())
      .put(`/alerts/${ALERT_ID}/acknowledge`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: ALERT_ID,
      productId: PRODUCT_ID,
      productName: 'Milk',
      alertType: 'out_of_stock',
    });
    expect(res.body.acknowledgedAt).not.toBeNull();
  });

  it('returns 404 for non-existent alert', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(createTestApp())
      .put('/alerts/00000000-0000-0000-0000-000000000000/acknowledge');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Alert not found' });
  });
});
