/**
 * Auth property-based tests
 * Validates: Requirement 1 (authentication), Requirement 12 (auth event logging)
 *
 * Properties:
 *   P1  - Any arbitrary Bearer token (non-JWT) on a protected endpoint → 401
 *   P2  - Any arbitrary username/password that doesn't match a real user → 401
 *   P3  - Any two different passwords produce different hashes
 *   P30 - After any login attempt (success or failure), an auth_event row is inserted
 */

import * as fc from 'fast-check';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import express from 'express';

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

import pool from '../db/pool';
import { authenticate } from '../middleware/auth';

const mockQuery = pool.query as jest.Mock;

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-access-secret';

/** Build a minimal Express app with one protected route for P1 */
function buildProtectedApp() {
  const app = express();
  app.use(express.json());
  app.get('/protected', authenticate, (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

/** Build a minimal Express app with the auth router for P2 / P30 */
function buildAuthApp() {
  const app = express();
  app.use(express.json());
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const authRoutes = require('../routes/auth').default;
  app.use('/auth', authRoutes);
  return app;
}

// ---------------------------------------------------------------------------
// P1 — Unauthenticated requests (arbitrary Bearer token) → 401
// Validates: Requirement 12.2
// ---------------------------------------------------------------------------
describe('P1 — arbitrary Bearer token on protected endpoint → 401', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('returns 401 for any non-JWT Bearer token string', async () => {
    const app = buildProtectedApp();

    await fc.assert(
      fc.asyncProperty(fc.string(), async (token) => {
        // The middleware will try jwt.verify; for arbitrary strings this will
        // throw and return 401 before hitting the DB.
        // Reset mock for each iteration so DB calls don't bleed across.
        mockQuery.mockReset();

        const res = await request(app)
          .get('/protected')
          .set('Authorization', `Bearer ${token}`);

        // Either the token is invalid (401) or, in the astronomically unlikely
        // case fast-check generates a valid JWT signed with our secret, the
        // middleware will query the DB. We mock that to return no rows → 401.
        // So the result must always be 401.
        if (res.status !== 401) {
          // If somehow a valid JWT was generated, ensure DB mock returns no rows
          // (already reset above) — this path should never be reached in practice.
          return false;
        }
        return true;
      }),
      { numRuns: 25 }
    );
  });
});

// ---------------------------------------------------------------------------
// P2 — Arbitrary username/password that doesn't match a real user → 401
// Validates: Requirement 1.3
// ---------------------------------------------------------------------------
describe('P2 — arbitrary credentials not matching a real user → 401', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('returns 401 for any username/password combination with no matching user', async () => {
    const app = buildAuthApp();

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.string({ minLength: 1, maxLength: 50 }),
        async (username, password) => {
          mockQuery.mockReset();
          // SELECT user → no rows (user not found)
          mockQuery.mockResolvedValueOnce({ rows: [] });
          // INSERT auth_event (login_failure)
          mockQuery.mockResolvedValueOnce({ rows: [] });

          const res = await request(app)
            .post('/auth/login')
            .send({ username, password });

          return res.status === 401;
        }
      ),
      { numRuns: 25 }
    );
  });
});

// ---------------------------------------------------------------------------
// P3 — Any two different passwords produce different hashes
// Validates: Requirement 1.5
//
// Note: bcrypt with 12 salt rounds is intentionally slow for security.
// For property testing we use cost factor 4 (minimum) to keep the suite
// fast while still exercising the uniqueness property. The production
// hashPassword() function uses cost 12 — that is tested in unit tests.
// ---------------------------------------------------------------------------
describe('P3 — different passwords produce different hashes', () => {
  // Use a low cost factor so 100 iterations complete well within the timeout
  const FAST_SALT_ROUNDS = 4;

  it(
    'bcrypt produces unique hashes for distinct passwords',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1 }),
          async (passwordA, passwordB) => {
            fc.pre(passwordA !== passwordB);

            const [hashA, hashB] = await Promise.all([
              bcrypt.hash(passwordA, FAST_SALT_ROUNDS),
              bcrypt.hash(passwordB, FAST_SALT_ROUNDS),
            ]);

            // Different passwords must produce different hashes
            return hashA !== hashB;
          }
        ),
        { numRuns: 25 }
      );
    },
    20_000
  );

  it(
    'bcrypt produces different hashes for the same password on repeated calls (unique salt)',
    async () => {
      await fc.assert(
        fc.asyncProperty(fc.string({ minLength: 1 }), async (password) => {
          const [hash1, hash2] = await Promise.all([
            bcrypt.hash(password, FAST_SALT_ROUNDS),
            bcrypt.hash(password, FAST_SALT_ROUNDS),
          ]);

          // bcrypt uses a unique salt each time, so even the same password
          // produces a different hash — but both must verify correctly.
          const [valid1, valid2] = await Promise.all([
            bcrypt.compare(password, hash1),
            bcrypt.compare(password, hash2),
          ]);

          return valid1 && valid2 && hash1 !== hash2;
        }),
        { numRuns: 25 }
      );
    },
    20_000
  );
});

// ---------------------------------------------------------------------------
// P30 — After any login attempt, an auth_event row is inserted
// Validates: Requirement 12.4
//
// Note: We use bcrypt cost factor 4 for the pre-computed hash so that
// bcrypt.compare() in the login route completes quickly across 100 runs.
// ---------------------------------------------------------------------------
describe('P30 — login attempt always inserts an auth_event row', () => {
  const KNOWN_PASSWORD = 'KnownPassword!';
  // Cost 4 keeps bcrypt.compare fast enough for 100 property iterations
  const FAST_COST = 4;
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash(KNOWN_PASSWORD, FAST_COST);
  });

  beforeEach(() => {
    mockQuery.mockReset();
  });

  it(
    'inserts auth_event on failed login (user not found)',
    async () => {
      const app = buildAuthApp();

      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          async (username, password) => {
            mockQuery.mockReset();
            // SELECT user → no rows
            mockQuery.mockResolvedValueOnce({ rows: [] });
            // INSERT auth_event
            mockQuery.mockResolvedValueOnce({ rows: [] });

            await request(app).post('/auth/login').send({ username, password });

            const calls = mockQuery.mock.calls;
            const authEventCall = calls.find(
              (call: unknown[]) =>
                typeof call[0] === 'string' &&
                call[0].includes('INSERT INTO auth_events')
            );

            return authEventCall !== undefined;
          }
        ),
        { numRuns: 25 }
      );
    },
    15_000
  );

  it(
    'inserts auth_event on failed login (wrong password)',
    async () => {
      const app = buildAuthApp();

      await fc.assert(
        fc.asyncProperty(
          // Exclude the known password so we always get a failure path
          fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s !== KNOWN_PASSWORD),
          async (wrongPassword) => {
            mockQuery.mockReset();
            // SELECT user → returns user with known hash
            mockQuery.mockResolvedValueOnce({
              rows: [{ id: 'user-id-123', password_hash: passwordHash }],
            });
            // INSERT auth_event (login_failure)
            mockQuery.mockResolvedValueOnce({ rows: [] });

            await request(app)
              .post('/auth/login')
              .send({ username: 'shopkeeper', password: wrongPassword });

            const calls = mockQuery.mock.calls;
            const authEventCall = calls.find(
              (call: unknown[]) =>
                typeof call[0] === 'string' &&
                call[0].includes('INSERT INTO auth_events')
            );

            return authEventCall !== undefined;
          }
        ),
        { numRuns: 25 }
      );
    },
    20_000
  );

  it(
    'inserts auth_event on successful login',
    async () => {
      const app = buildAuthApp();

      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }),
          async (username) => {
            mockQuery.mockReset();
            // SELECT user → returns user with known hash
            mockQuery.mockResolvedValueOnce({
              rows: [{ id: 'user-id-123', password_hash: passwordHash }],
            });
            // INSERT refresh_token
            mockQuery.mockResolvedValueOnce({ rows: [] });
            // INSERT auth_event (login_success)
            mockQuery.mockResolvedValueOnce({ rows: [] });

            await request(app)
              .post('/auth/login')
              .send({ username, password: KNOWN_PASSWORD });

            const calls = mockQuery.mock.calls;
            const authEventCall = calls.find(
              (call: unknown[]) =>
                typeof call[0] === 'string' &&
                call[0].includes('INSERT INTO auth_events')
            );

            return authEventCall !== undefined;
          }
        ),
        { numRuns: 25 }
      );
    },
    15_000
  );
});
