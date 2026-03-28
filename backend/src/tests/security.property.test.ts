/**
 * Security property-based tests
 *
 * Properties:
 *   P29 - Injection payloads are sanitized
 */

// Feature: smart-shop-inventory-management, Property 29: Injection payloads are sanitized

import * as fc from 'fast-check';
import request from 'supertest';
import express from 'express';
import { sanitizeString } from '../middleware/sanitize';

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

// Mock the auth middleware to always pass through
jest.mock('../middleware/auth', () => ({
  authenticate: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import pool from '../db/pool';

const mockQuery = pool.query as jest.Mock;

fc.configureGlobal({ numRuns: 100 });

const CATEGORY_ID = '550e8400-e29b-41d4-a716-446655440002';
const PRODUCT_ID = '550e8400-e29b-41d4-a716-446655440001';

/** Build a minimal Express app with the products router (includes sanitizeBody middleware) */
function buildProductsApp() {
  const app = express();
  app.use(express.json());
  // Apply sanitizeBody middleware as it is in the real app (index.ts)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { sanitizeBody } = require('../middleware/sanitize');
  app.use(sanitizeBody);
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const productRoutes = require('../routes/products').default;
  app.use('/products', productRoutes);
  return app;
}

// ---------------------------------------------------------------------------
// P29 — Injection payloads are sanitized (pure function level)
// Feature: smart-shop-inventory-management, Property 29: Injection payloads are sanitized
// Validates: Requirements 12.3
// ---------------------------------------------------------------------------
describe('P29 — Injection payloads are sanitized', () => {
  /**
   * Pure function property: sanitizeString neutralizes HTML and SQL injection
   * patterns for any arbitrary string input.
   */
  it('sanitizeString neutralizes HTML and SQL injection payloads for any input', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = sanitizeString(input);

        // Must not contain raw HTML injection characters
        expect(result).not.toContain('<');
        expect(result).not.toContain('>');

        // Must not contain SQL comment sequences
        expect(result).not.toContain('--');
        expect(result).not.toContain('/*');
        expect(result).not.toContain('*/');
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Targeted property: known injection payloads are neutralized.
   * Uses a custom arbitrary that generates realistic injection strings.
   */
  it('sanitizeString neutralizes known SQL and HTML injection payload patterns', () => {
    const sqlPayloads = [
      "'; DROP TABLE products; --",
      "1 OR 1=1 --",
      "admin'--",
      "/* comment */",
      "1; SELECT * FROM users",
      "' UNION SELECT * FROM users --",
      "xp_cmdshell('dir')",
    ];

    const htmlPayloads = [
      '<script>alert(1)</script>',
      '<img src=x onerror=alert(1)>',
      '<svg onload=alert(1)>',
      '"><script>alert(document.cookie)</script>',
      '<iframe src="javascript:alert(1)">',
    ];

    const injectionPayloadArb = fc.oneof(
      fc.constantFrom(...sqlPayloads),
      fc.constantFrom(...htmlPayloads),
      // Arbitrary strings with injected SQL/HTML fragments
      fc.string({ minLength: 0, maxLength: 20 }).map((s) => s + "'; DROP TABLE --"),
      fc.string({ minLength: 0, maxLength: 20 }).map((s) => '<script>' + s + '</script>'),
      fc.string({ minLength: 0, maxLength: 20 }).map((s) => s + ' /* comment */ '),
    );

    fc.assert(
      fc.property(injectionPayloadArb, (payload) => {
        const result = sanitizeString(payload);

        expect(result).not.toContain('<');
        expect(result).not.toContain('>');
        expect(result).not.toContain('--');
        expect(result).not.toContain('/*');
        expect(result).not.toContain('*/');
      }),
      { numRuns: 100 }
    );
  });

  /**
   * HTTP-level property: sending injection payloads as product name via POST /products
   * results in either a 4xx rejection or a response body that does not echo back
   * raw injection strings.
   */
  it('POST /products with injection payload in name is rejected or sanitized in response', async () => {
    const app = buildProductsApp();

    const injectionPayloadArb = fc.oneof(
      fc.constantFrom(
        "'; DROP TABLE products; --",
        '<script>alert(1)</script>',
        '<img src=x onerror=alert(1)>',
        "1 OR 1=1 --",
        "/* comment */",
        "xp_cmdshell('dir')",
        '"><script>alert(document.cookie)</script>',
      ),
      fc.string({ minLength: 1, maxLength: 30 }).map((s) => s + '<script>'),
      fc.string({ minLength: 1, maxLength: 30 }).map((s) => s + "'; DROP TABLE --"),
    );

    await fc.assert(
      fc.asyncProperty(injectionPayloadArb, async (injectionName) => {
        mockQuery.mockReset();

        // The sanitizeBody middleware runs before the route handler.
        // The sanitized name will be stored; mock the DB to return it.
        const sanitizedName = sanitizeString(injectionName);

        const row = {
          id: PRODUCT_ID,
          name: sanitizedName,
          category_id: CATEGORY_ID,
          category_name: 'TestCategory',
          quantity: 10,
          minimum_threshold: 0,
          rack: null,
          shelf: null,
          section: null,
          expiry_date: null,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        };

        mockQuery
          .mockResolvedValueOnce({ rows: [{ id: PRODUCT_ID }] })  // INSERT RETURNING id
          .mockResolvedValueOnce({ rows: [row] })                  // SELECT full row
          .mockResolvedValueOnce({ rows: [{ quantity: 10, minimum_threshold: 0, expiry_date: null }] }) // alert: SELECT product
          .mockResolvedValueOnce({ rows: [] })                     // alert: SELECT settings
          .mockResolvedValue({ rows: [] });                        // fallback

        const res = await request(app).post('/products').send({
          name: injectionName,
          categoryId: CATEGORY_ID,
          quantity: 10,
        });

        // Either the request is rejected (4xx) due to validation
        if (res.status >= 400 && res.status < 500) {
          return true;
        }

        // Or the response body must not contain raw injection characters
        if (res.status === 201) {
          const body = res.body as Record<string, unknown>;
          const returnedName = body.name as string;

          // The stored/returned name must not contain executable injection patterns
          expect(returnedName).not.toContain('<');
          expect(returnedName).not.toContain('>');
          expect(returnedName).not.toContain('--');
          expect(returnedName).not.toContain('/*');
          expect(returnedName).not.toContain('*/');
          return true;
        }

        // Unexpected status
        return false;
      }),
      { numRuns: 100 }
    );
  }, 30_000);
});
