/**
 * Dashboard property-based tests
 *
 * Properties:
 *   P20 - Dashboard counts match actual product statuses
 *
 * **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5**
 */

// Feature: smart-shop-inventory-management, Property 20: Dashboard counts match actual product statuses

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
import { deriveStockStatus, deriveExpiryStatus } from '../services/product.service';

const mockQuery = pool.query as jest.Mock;

fc.configureGlobal({ numRuns: 100 });

/** Build a minimal Express app with the dashboard router */
function buildDashboardApp() {
  const app = express();
  app.use(express.json());
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const dashboardRoutes = require('../routes/dashboard').default;
  app.use('/dashboard', dashboardRoutes);
  return app;
}

// ---------------------------------------------------------------------------
// P20 — Dashboard counts match actual product statuses
// Feature: smart-shop-inventory-management, Property 20: For any product catalog state,
// the dashboard's totalProducts, lowStockCount, outOfStockCount, nearExpiryCount, and
// expiredCount should each equal the count of products with the corresponding derived
// status in the database.
// Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5
// ---------------------------------------------------------------------------
describe('P20 — Dashboard counts match actual product statuses', () => {
  beforeEach(() => mockQuery.mockReset());

  it(
    'GET /dashboard counts match independently computed status counts for any product catalog',
    async () => {
      const app = buildDashboardApp();

      // Arbitrary for a single product row (quantity, minimumThreshold, optional expiryDate)
      const productArb = fc.record({
        quantity: fc.integer({ min: 0, max: 500 }),
        minimumThreshold: fc.integer({ min: 0, max: 100 }),
        expiryDate: fc.option(
          fc.oneof(
            // Past date (expired)
            fc.integer({ min: 1, max: 365 }).map((daysAgo) => {
              const d = new Date();
              d.setDate(d.getDate() - daysAgo);
              return d.toISOString().split('T')[0];
            }),
            // Near-future date (potentially near_expiry)
            fc.integer({ min: 0, max: 60 }).map((daysAhead) => {
              const d = new Date();
              d.setDate(d.getDate() + daysAhead);
              return d.toISOString().split('T')[0];
            }),
            // Far-future date (valid)
            fc.integer({ min: 61, max: 365 }).map((daysAhead) => {
              const d = new Date();
              d.setDate(d.getDate() + daysAhead);
              return d.toISOString().split('T')[0];
            })
          ),
          { nil: null }
        ),
      });

      // Arbitrary for near_expiry_window_days setting (or empty for default 30)
      const settingsArb = fc.option(
        fc.integer({ min: 1, max: 90 }),
        { nil: null }
      );

      await fc.assert(
        fc.asyncProperty(
          fc.array(productArb, { minLength: 0, maxLength: 20 }),
          settingsArb,
          async (products, nearExpiryWindowDays) => {
            mockQuery.mockReset();

            // Build DB rows for products query
            const productRows = products.map((p) => ({
              quantity: p.quantity,
              minimum_threshold: p.minimumThreshold,
              expiry_date: p.expiryDate,
            }));

            // Mock settings query
            const settingsRows =
              nearExpiryWindowDays !== null
                ? [{ near_expiry_window_days: nearExpiryWindowDays }]
                : [];

            mockQuery
              .mockResolvedValueOnce({ rows: settingsRows })   // settings query
              .mockResolvedValueOnce({ rows: productRows })    // products query
              .mockResolvedValueOnce({ rows: [] });            // alerts query

            const res = await request(app).get('/dashboard');
            if (res.status !== 200) return false;

            // Determine the effective window (default 30 if no settings row)
            const effectiveWindow =
              nearExpiryWindowDays !== null ? nearExpiryWindowDays : 30;

            // Independently compute expected counts
            let expectedTotal = 0;
            let expectedLowStock = 0;
            let expectedOutOfStock = 0;
            let expectedNearExpiry = 0;
            let expectedExpired = 0;

            for (const p of products) {
              expectedTotal++;

              const stockStatus = deriveStockStatus(p.quantity, p.minimumThreshold);
              if (stockStatus === 'low_stock') expectedLowStock++;
              else if (stockStatus === 'out_of_stock') expectedOutOfStock++;

              const expiryDate = p.expiryDate ? new Date(p.expiryDate) : null;
              const expiryStatus = deriveExpiryStatus(expiryDate, effectiveWindow);
              if (expiryStatus === 'near_expiry') expectedNearExpiry++;
              else if (expiryStatus === 'expired') expectedExpired++;
            }

            const body = res.body as {
              totalProducts: number;
              lowStockCount: number;
              outOfStockCount: number;
              nearExpiryCount: number;
              expiredCount: number;
            };

            return (
              body.totalProducts === expectedTotal &&
              body.lowStockCount === expectedLowStock &&
              body.outOfStockCount === expectedOutOfStock &&
              body.nearExpiryCount === expectedNearExpiry &&
              body.expiredCount === expectedExpired
            );
          }
        ),
        { numRuns: 100 }
      );
    },
    30_000
  );
});
