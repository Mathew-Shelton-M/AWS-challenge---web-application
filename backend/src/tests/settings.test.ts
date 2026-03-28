/**
 * Settings integration tests
 * Validates: Requirements 5.5, 9.3
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

// Mock auth middleware to always authenticate as a fixed user
jest.mock('../middleware/auth', () => ({
  authenticate: (req: { user?: { id: string } }, _res: unknown, next: () => void) => {
    req.user = { id: 'test-user-id' };
    next();
  },
}));

import pool from '../db/pool';

const mockQuery = pool.query as jest.Mock;

describe('GET /settings', () => {
  beforeEach(() => mockQuery.mockReset());

  it('returns stored settings when a row exists', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          near_expiry_window_days: 14,
          email_notifications_enabled: true,
          sms_notifications_enabled: false,
        },
      ],
    });

    const res = await request(createTestApp()).get('/settings');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      nearExpiryWindowDays: 14,
      emailNotificationsEnabled: true,
      smsNotificationsEnabled: false,
    });
  });

  it('returns defaults (30 days, both notifications off) when no row exists', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(createTestApp()).get('/settings');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      nearExpiryWindowDays: 30,
      emailNotificationsEnabled: false,
      smsNotificationsEnabled: false,
    });
  });
});

describe('PUT /settings', () => {
  beforeEach(() => mockQuery.mockReset());

  it('updates near_expiry_window and returns updated settings', async () => {
    // First query: fetch current (no row), second: upsert
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // no existing row
      .mockResolvedValueOnce({ rows: [] }); // upsert

    const res = await request(createTestApp())
      .put('/settings')
      .send({ nearExpiryWindow: 14 });

    expect(res.status).toBe(200);
    expect(res.body.nearExpiryWindowDays).toBe(14);
  });

  it('returns 422 when near_expiry_window is 0', async () => {
    const res = await request(createTestApp())
      .put('/settings')
      .send({ nearExpiryWindow: 0 });

    expect(res.status).toBe(422);
  });

  it('returns 422 when near_expiry_window is negative', async () => {
    const res = await request(createTestApp())
      .put('/settings')
      .send({ nearExpiryWindow: -5 });

    expect(res.status).toBe(422);
  });

  it('toggles email notifications independently', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            near_expiry_window_days: 30,
            email_notifications_enabled: false,
            sms_notifications_enabled: false,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(createTestApp())
      .put('/settings')
      .send({ emailNotifications: true });

    expect(res.status).toBe(200);
    expect(res.body.emailNotificationsEnabled).toBe(true);
    expect(res.body.smsNotificationsEnabled).toBe(false); // unchanged
    expect(res.body.nearExpiryWindowDays).toBe(30); // unchanged
  });

  it('toggles sms notifications independently', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            near_expiry_window_days: 30,
            email_notifications_enabled: false,
            sms_notifications_enabled: false,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(createTestApp())
      .put('/settings')
      .send({ smsNotifications: true });

    expect(res.status).toBe(200);
    expect(res.body.smsNotificationsEnabled).toBe(true);
    expect(res.body.emailNotificationsEnabled).toBe(false); // unchanged
  });

  it('update and fetch round-trip: updated values are returned', async () => {
    // PUT: no existing row, upsert succeeds
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const putRes = await request(createTestApp())
      .put('/settings')
      .send({ nearExpiryWindow: 7, emailNotifications: true, smsNotifications: true });

    expect(putRes.status).toBe(200);
    expect(putRes.body).toEqual({
      nearExpiryWindowDays: 7,
      emailNotificationsEnabled: true,
      smsNotificationsEnabled: true,
    });

    // GET: now returns the updated row
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          near_expiry_window_days: 7,
          email_notifications_enabled: true,
          sms_notifications_enabled: true,
        },
      ],
    });

    const getRes = await request(createTestApp()).get('/settings');

    expect(getRes.status).toBe(200);
    expect(getRes.body).toEqual({
      nearExpiryWindowDays: 7,
      emailNotificationsEnabled: true,
      smsNotificationsEnabled: true,
    });
  });

  it('near_expiry_window of 1 is valid (minimum allowed)', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(createTestApp())
      .put('/settings')
      .send({ nearExpiryWindow: 1 });

    expect(res.status).toBe(200);
    expect(res.body.nearExpiryWindowDays).toBe(1);
  });
});
