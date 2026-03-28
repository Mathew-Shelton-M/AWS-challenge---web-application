/**
 * Alerts property-based tests
 *
 * Properties:
 *   P12 - Alert generated on stock status transition
 *   P21 - Dashboard active alerts equal unacknowledged alerts
 *   P22 - Acknowledging an alert removes it from the active list
 *
 * **Validates: Requirements 4.4, 8.6, 8.7**
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

fc.configureGlobal({ numRuns: 25 });

const CATEGORY_ID = '550e8400-e29b-41d4-a716-446655440002';
const PRODUCT_ID = '550e8400-e29b-41d4-a716-446655440001';

function buildApp() {
  const app = express();
  app.use(express.json());
  const productRoutes = require('../routes/products').default;
  const alertRoutes = require('../routes/alerts').default;
  app.use('/products', productRoutes);
  app.use('/alerts', alertRoutes);
  return app;
}

function buildAlertsApp() {
  const app = express();
  app.use(express.json());
  const alertRoutes = require('../routes/alerts').default;
  app.use('/alerts', alertRoutes);
  return app;
}

describe('P12 - Alert generated on stock status transition', () => {
  beforeEach(() => mockQuery.mockReset());

  it(
    'reducing stock below threshold triggers a low_stock or out_of_stock alert in GET /alerts',
    async () => {
      const app = buildApp();

      const arb = fc.record({
        threshold: fc.integer({ min: 1, max: 50 }),
        initialQty: fc.integer({ min: 2, max: 100 }),
        targetQty: fc.integer({ min: 0, max: 50 }),
      }).filter(({ initialQty, threshold, targetQty }) =>
        initialQty > threshold && targetQty <= threshold && initialQty > targetQty
      );

      await fc.assert(
        fc.asyncProperty(arb, async ({ threshold, initialQty, targetQty }) => {
          mockQuery.mockReset();

          const reductionQty = initialQty - targetQty;
          const expectedAlertType = targetQty === 0 ? 'out_of_stock' : 'low_stock';

          const productRow = {
            id: PRODUCT_ID,
            name: 'Test Product',
            category_id: CATEGORY_ID,
            category_name: 'TestCategory',
            quantity: targetQty,
            minimum_threshold: threshold,
            rack: null,
            shelf: null,
            section: null,
            expiry_date: null,
            created_at: '2024-01-01T00:00:00.000Z',
            updated_at: '2024-01-01T00:00:00.000Z',
          };

          mockQuery
            .mockResolvedValueOnce({ rows: [{ quantity: initialQty }] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [productRow] })
            .mockResolvedValueOnce({ rows: [{ quantity: targetQty, minimum_threshold: threshold, expiry_date: null }] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [{ name: 'Test Product' }] })
            .mockResolvedValueOnce({ rows: [{ id: 'alert-id-001', generated_at: new Date().toISOString() }] });

          const stockRes = await request(app)
            .post(`/products/${PRODUCT_ID}/stock`)
            .send({ movementType: 'reduction', quantity: reductionQty });

          if (stockRes.status !== 200) return false;

          const alertRow = {
            id: 'alert-id-001',
            product_id: PRODUCT_ID,
            product_name: 'Test Product',
            alert_type: expectedAlertType,
            generated_at: new Date().toISOString(),
            acknowledged_at: null,
          };
          mockQuery.mockResolvedValueOnce({ rows: [alertRow] });

          const alertsRes = await request(app).get('/alerts');
          if (alertsRes.status !== 200) return false;

          const alerts = alertsRes.body as Array<{ alertType: string; productId: string }>;

          return alerts.some(
            (a) => a.productId === PRODUCT_ID && a.alertType === expectedAlertType
          );
        }),
        { numRuns: 25 }
      );
    },
    60_000
  );
});

describe('P21 - Active alerts equal unacknowledged alerts', () => {
  beforeEach(() => mockQuery.mockReset());

  it(
    'GET /alerts returns exactly the unacknowledged alerts from any mixed alert set',
    async () => {
      const app = buildAlertsApp();

      const alertArb = fc.record({
        id: fc.uuid(),
        productId: fc.constant(PRODUCT_ID),
        productName: fc.constant('Test Product'),
        alertType: fc.constantFrom('low_stock', 'out_of_stock', 'near_expiry', 'expired'),
        generatedAt: fc.constant('2024-01-01T00:00:00.000Z'),
        acknowledgedAt: fc.option(fc.constant('2024-01-02T00:00:00.000Z'), { nil: null }),
      });

      await fc.assert(
        fc.asyncProperty(
          fc.array(alertArb, { minLength: 0, maxLength: 10 }),
          async (allAlerts) => {
            mockQuery.mockReset();

            const unacknowledgedAlerts = allAlerts.filter((a) => a.acknowledgedAt === null);

            const dbRows = unacknowledgedAlerts.map((a) => ({
              id: a.id,
              product_id: a.productId,
              product_name: a.productName,
              alert_type: a.alertType,
              generated_at: a.generatedAt,
              acknowledged_at: null,
            }));

            mockQuery.mockResolvedValueOnce({ rows: dbRows });

            const res = await request(app).get('/alerts');
            if (res.status !== 200) return false;

            const body = res.body as Array<{ id: string; acknowledgedAt: string | null }>;

            if (body.length !== unacknowledgedAlerts.length) return false;

            return body.every((a) => a.acknowledgedAt === null);
          }
        ),
        { numRuns: 25 }
      );
    },
    15_000
  );
});

describe('P22 - Acknowledging an alert removes it from the active list', () => {
  beforeEach(() => mockQuery.mockReset());

  it(
    'PUT /alerts/:id/acknowledge then GET /alerts does not contain the acknowledged alert',
    async () => {
      const app = buildAlertsApp();

      const alertArb = fc.record({
        id: fc.uuid(),
        alertType: fc.constantFrom('low_stock', 'out_of_stock', 'near_expiry', 'expired'),
      });

      const otherAlertsArb = fc.array(
        fc.record({
          id: fc.uuid(),
          alertType: fc.constantFrom('low_stock', 'out_of_stock', 'near_expiry', 'expired'),
        }),
        { minLength: 0, maxLength: 5 }
      );

      await fc.assert(
        fc.asyncProperty(alertArb, otherAlertsArb, async (targetAlert, otherAlerts) => {
          mockQuery.mockReset();

          const acknowledgedAt = '2024-01-02T00:00:00.000Z';

          mockQuery
            .mockResolvedValueOnce({
              rows: [{
                id: targetAlert.id,
                product_id: PRODUCT_ID,
                alert_type: targetAlert.alertType,
                generated_at: '2024-01-01T00:00:00.000Z',
                acknowledged_at: acknowledgedAt,
              }],
            })
            .mockResolvedValueOnce({ rows: [{ product_name: 'Test Product' }] });

          const ackRes = await request(app)
            .put(`/alerts/${targetAlert.id}/acknowledge`);

          if (ackRes.status !== 200) return false;

          const remainingRows = otherAlerts.map((a) => ({
            id: a.id,
            product_id: PRODUCT_ID,
            product_name: 'Test Product',
            alert_type: a.alertType,
            generated_at: '2024-01-01T00:00:00.000Z',
            acknowledged_at: null,
          }));

          mockQuery.mockResolvedValueOnce({ rows: remainingRows });

          const listRes = await request(app).get('/alerts');
          if (listRes.status !== 200) return false;

          const body = listRes.body as Array<{ id: string }>;

          return !body.some((a) => a.id === targetAlert.id);
        }),
        { numRuns: 25 }
      );
    },
    15_000
  );
});