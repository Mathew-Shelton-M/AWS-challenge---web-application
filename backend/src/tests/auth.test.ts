/**
 * Auth integration tests
 * Validates: Requirement 1 (authentication)
 *
 * Uses jest.mock for pool to avoid requiring a real DB in CI.
 */

import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { createTestApp } from './helpers';

// Mock the DB pool before any imports that use it
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

// Import pool AFTER mock is set up so we get the mocked version
import pool from '../db/pool';

const mockQuery = pool.query as jest.Mock;

const JWT_ACCESS_SECRET = 'test-access-secret';
const JWT_REFRESH_SECRET = 'test-refresh-secret';

// Helper: generate a valid refresh token signed with test secret
function makeRefreshToken(userId: string): string {
  return jwt.sign({ sub: userId, type: 'refresh' }, JWT_REFRESH_SECRET, { expiresIn: '7d' });
}

// Helper: generate a valid access token signed with test secret
function makeAccessToken(userId: string): string {
  return jwt.sign({ sub: userId, type: 'access' }, JWT_ACCESS_SECRET, { expiresIn: '15m' });
}

const TEST_USER_ID = 'user-uuid-1234';
const TEST_USERNAME = 'shopkeeper';
const TEST_PASSWORD = 'SecurePass123!';

describe('POST /auth/login', () => {
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash(TEST_PASSWORD, 12);
  });

  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('returns 200 with accessToken and refreshToken on valid credentials', async () => {
    // SELECT user
    mockQuery.mockResolvedValueOnce({ rows: [{ id: TEST_USER_ID, password_hash: passwordHash }] });
    // INSERT refresh token
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // INSERT auth event (login_success)
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(createTestApp())
      .post('/auth/login')
      .send({ username: TEST_USERNAME, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');

    // Verify tokens are valid JWTs
    const accessPayload = jwt.verify(res.body.accessToken, JWT_ACCESS_SECRET) as jwt.JwtPayload;
    expect(accessPayload.sub).toBe(TEST_USER_ID);

    const refreshPayload = jwt.verify(res.body.refreshToken, JWT_REFRESH_SECRET) as jwt.JwtPayload;
    expect(refreshPayload.sub).toBe(TEST_USER_ID);
  });

  it('returns 401 with "Invalid credentials" on wrong password', async () => {
    // SELECT user — returns user with hash
    mockQuery.mockResolvedValueOnce({ rows: [{ id: TEST_USER_ID, password_hash: passwordHash }] });
    // INSERT auth event (login_failure)
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(createTestApp())
      .post('/auth/login')
      .send({ username: TEST_USERNAME, password: 'WrongPassword!' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid credentials' });
  });

  it('returns 401 with "Invalid credentials" on unknown username', async () => {
    // SELECT user — returns no rows
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // INSERT auth event (login_failure) with null userId
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(createTestApp())
      .post('/auth/login')
      .send({ username: 'nobody', password: TEST_PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid credentials' });
  });
});

describe('POST /auth/refresh', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('returns 200 with new accessToken on valid refresh token', async () => {
    const refreshToken = makeRefreshToken(TEST_USER_ID);

    // SELECT refresh token from DB — found, not revoked, not expired
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'token-row-id', user_id: TEST_USER_ID }] });

    const res = await request(createTestApp())
      .post('/auth/refresh')
      .send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');

    const payload = jwt.verify(res.body.accessToken, JWT_ACCESS_SECRET) as jwt.JwtPayload;
    expect(payload.sub).toBe(TEST_USER_ID);
  });

  it('returns 401 when refresh token is revoked (not found in DB)', async () => {
    const refreshToken = makeRefreshToken(TEST_USER_ID);

    // SELECT returns no rows (token revoked or not found)
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(createTestApp())
      .post('/auth/refresh')
      .send({ refreshToken });

    expect(res.status).toBe(401);
  });

  it('returns 401 when refresh token is expired (JWT signature fails)', async () => {
    // Create a token that expired 1 second ago
    const expiredToken = jwt.sign(
      { sub: TEST_USER_ID, type: 'refresh' },
      JWT_REFRESH_SECRET,
      { expiresIn: -1 }
    );

    const res = await request(createTestApp())
      .post('/auth/refresh')
      .send({ refreshToken: expiredToken });

    expect(res.status).toBe(401);
  });
});

describe('POST /auth/logout', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('returns 204 on logout', async () => {
    const refreshToken = makeRefreshToken(TEST_USER_ID);

    // UPDATE revoked_at
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(createTestApp())
      .post('/auth/logout')
      .send({ refreshToken });

    expect(res.status).toBe(204);
  });
});

describe('Session expiry — authenticated request with inactive session', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('returns 401 with "Session expired" when last_activity_at > 30 min ago', async () => {
    // We need a protected route to test the auth middleware.
    // Add a temporary protected route to the test app, or use the health check.
    // Since no protected routes are mounted yet, we test the middleware directly
    // by mounting a test route on the app.
    //
    // Instead, we test the authenticate middleware behaviour by calling a route
    // that uses it. We'll add a minimal protected route inline for this test.

    const accessToken = makeAccessToken(TEST_USER_ID);

    // The auth middleware queries for active refresh tokens
    // Return a token row with last_activity_at > 30 min ago
    const oldActivity = new Date(Date.now() - 31 * 60 * 1000); // 31 minutes ago
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'token-row-id', last_activity_at: oldActivity }],
    });
    // UPDATE revoked_at (middleware revokes the token)
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // INSERT auth_event (session_expiry)
    mockQuery.mockResolvedValueOnce({ rows: [] });

    // Mount a temporary protected route on the app for this test
    const app = createTestApp();

    // We need to add a protected route — use the authenticate middleware directly
    const { authenticate } = await import('../middleware/auth');
    app.get('/test-protected', authenticate, (_req, res) => {
      res.json({ ok: true });
    });

    const res = await request(app)
      .get('/test-protected')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Session expired' });
  });
});
