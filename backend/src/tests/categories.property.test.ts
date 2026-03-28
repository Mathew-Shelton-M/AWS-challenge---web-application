/**
 * Categories property-based tests
 *
 * Properties:
 *   P8 - For any category that has at least one product, DELETE /categories/:id returns 409
 *   P9 - For any list of categories returned by GET /categories, every item has a non-empty categoryName (name field)
 *
 * **Validates: Requirements 3.3, 3.4**
 */

import * as fc from 'fast-check';
import request from 'supertest';
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

// Mock the auth middleware to always pass through
jest.mock('../middleware/auth', () => ({
  authenticate: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import pool from '../db/pool';

const mockQuery = pool.query as jest.Mock;

/** Build a minimal Express app with the categories router */
function buildCategoriesApp() {
  const app = express();
  app.use(express.json());
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const categoryRoutes = require('../routes/categories').default;
  app.use('/categories', categoryRoutes);
  return app;
}

// ---------------------------------------------------------------------------
// P8 — For any category that has at least one product, DELETE returns 409
// Validates: Requirement 3.3
// ---------------------------------------------------------------------------
describe('P8 — DELETE /categories/:id returns 409 when category has products', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it(
    'always returns 409 when the product check finds at least one product',
    async () => {
      const app = buildCategoriesApp();

      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.integer({ min: 1, max: 100 }),
          async (categoryId, productCount) => {
            mockQuery.mockReset();

            // Mock: product check returns rows (products exist for this category)
            const productRows = Array.from({ length: productCount }, () => ({ 1: 1 }));
            mockQuery.mockResolvedValueOnce({ rows: productRows });

            const res = await request(app).delete(`/categories/${categoryId}`);

            return res.status === 409 &&
              res.body.error === 'Cannot delete category with existing products';
          }
        ),
        { numRuns: 25 }
      );
    },
    15_000
  );
});

// ---------------------------------------------------------------------------
// P9 — Every item in GET /categories response has a non-empty name field
// Validates: Requirement 3.4
// ---------------------------------------------------------------------------
describe('P9 — GET /categories always returns items with non-empty name', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it(
    'every category in the listing has a non-empty name field',
    async () => {
      const app = buildCategoriesApp();

      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              id: fc.uuid(),
              name: fc.string({ minLength: 1 }),
              createdAt: fc.string(),
            })
          ),
          async (categories) => {
            mockQuery.mockReset();
            mockQuery.mockResolvedValueOnce({ rows: categories });

            const res = await request(app).get('/categories');

            if (res.status !== 200) return false;

            const body = res.body as Array<{ id: string; name: string; createdAt: string }>;

            // Every item must have a non-empty name
            return body.every(
              (item) => typeof item.name === 'string' && item.name.length > 0
            );
          }
        ),
        { numRuns: 25 }
      );
    },
    15_000
  );
});
