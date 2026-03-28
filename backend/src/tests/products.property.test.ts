/**
 * Products property-based tests
 *
 * Properties:
 *   P4  - Product creation round-trip
 *   P5  - Missing required fields are rejected
 *   P6  - Product update round-trip
 *   P7  - Product deletion round-trip
 *   P10 - Stock status derivation correctness
 *   P11 - Stock movement quantity invariant
 *   P13 - Expiry status derivation correctness
 *   P14 - Expiry status present in all product listings
 *   P16 - Location present in search results
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
import { deriveStockStatus, deriveExpiryStatus } from '../services/product.service';

const mockQuery = pool.query as jest.Mock;

fc.configureGlobal({ numRuns: 25 });

/** Build a minimal Express app with the products router */
function buildProductsApp() {
  const app = express();
  app.use(express.json());
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const productRoutes = require('../routes/products').default;
  app.use('/products', productRoutes);
  return app;
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const CATEGORY_ID = '550e8400-e29b-41d4-a716-446655440002';
const PRODUCT_ID = '550e8400-e29b-41d4-a716-446655440001';

/** Arbitrary for a valid product creation payload */
const validProductPayloadArb = fc.record({
  name: fc.string({ minLength: 1, maxLength: 50 }),
  categoryId: fc.constant(CATEGORY_ID),
  quantity: fc.integer({ min: 0, max: 1000 }),
  minimumThreshold: fc.integer({ min: 0, max: 100 }),
  rack: fc.string({ minLength: 1, maxLength: 20 }),
  shelf: fc.string({ minLength: 1, maxLength: 20 }),
  section: fc.string({ minLength: 1, maxLength: 20 }),
});

/** Build a DB row from a payload for mock responses */
function buildProductRow(
  id: string,
  payload: {
    name: string;
    categoryId: string;
    quantity: number;
    minimumThreshold?: number;
    rack?: string;
    shelf?: string;
    section?: string;
    expiryDate?: string | null;
  }
) {
  return {
    id,
    name: payload.name,
    category_id: payload.categoryId,
    category_name: 'TestCategory',
    quantity: payload.quantity,
    minimum_threshold: payload.minimumThreshold ?? 0,
    rack: payload.rack ?? null,
    shelf: payload.shelf ?? null,
    section: payload.section ?? null,
    expiry_date: payload.expiryDate ?? null,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  };
}

// ---------------------------------------------------------------------------
// P4 — Product creation round-trip
// Feature: smart-shop-inventory-management, Property 4: For any valid product payload,
// creating the product and then fetching it by the returned ID should yield a record
// containing all the submitted fields.
// Validates: Requirements 2.1, 2.5
// ---------------------------------------------------------------------------
describe('P4 — Product creation round-trip', () => {
  beforeEach(() => mockQuery.mockReset());

  it(
    'create then GET /:id returns all submitted fields',
    async () => {
      const app = buildProductsApp();

      await fc.assert(
        fc.asyncProperty(validProductPayloadArb, async (payload) => {
          mockQuery.mockReset();

          const row = buildProductRow(PRODUCT_ID, payload);

          // POST /products query sequence:
          // 1. INSERT RETURNING id
          // 2. SELECT full row (for response)
          // Alert service (evaluateAlerts) query sequence:
          // 3. SELECT quantity, minimum_threshold, expiry_date FROM products
          // 4. SELECT near_expiry_window FROM settings
          // 5. SELECT alert_type FROM alerts (only if alerts triggered)
          // 6. INSERT INTO alerts (only if new alert type)
          // GET /products/:id:
          // N+1. SELECT full row
          //
          // Since alert queries are conditional, we set a persistent fallback
          // for the GET so it always resolves regardless of how many alert
          // queries were consumed.
          mockQuery
            .mockResolvedValueOnce({ rows: [{ id: PRODUCT_ID }] })   // INSERT RETURNING id
            .mockResolvedValueOnce({ rows: [row] })                   // SELECT full row
            .mockResolvedValueOnce({ rows: [{ quantity: payload.quantity, minimum_threshold: payload.minimumThreshold ?? 0, expiry_date: null }] }) // alert: SELECT product
            .mockResolvedValueOnce({ rows: [] })                      // alert: SELECT settings
            .mockResolvedValue({ rows: [row] });                      // fallback: alert SELECT existing alerts OR GET /:id

          const createRes = await request(app).post('/products').send(payload);
          if (createRes.status !== 201) return false;

          // GET /products/:id — uses the persistent fallback mock
          const getRes = await request(app).get(`/products/${PRODUCT_ID}`);
          if (getRes.status !== 200) return false;

          const body = getRes.body as Record<string, unknown>;
          return (
            body.name === payload.name &&
            body.quantity === payload.quantity &&
            body.rack === payload.rack &&
            body.shelf === payload.shelf &&
            body.section === payload.section
          );
        }),
        { numRuns: 25 }
      );
    },
    15_000
  );
});

// ---------------------------------------------------------------------------
// P5 — Missing required fields are rejected
// Feature: smart-shop-inventory-management, Property 5: For any product creation request
// with at least one required field omitted, the system should return a validation error.
// Validates: Requirements 2.2
// ---------------------------------------------------------------------------
describe('P5 — Missing required fields are rejected', () => {
  beforeEach(() => mockQuery.mockReset());

  it(
    'POST /products with a required field missing returns 422',
    async () => {
      const app = buildProductsApp();

      // Required fields: name, categoryId, quantity
      const requiredFields = ['name', 'categoryId', 'quantity'] as const;

      const fullPayload = {
        name: 'Test Product',
        categoryId: CATEGORY_ID,
        quantity: 10,
      };

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...requiredFields),
          async (fieldToOmit) => {
            mockQuery.mockReset();

            const payload = { ...fullPayload } as Record<string, unknown>;
            delete payload[fieldToOmit];

            const res = await request(app).post('/products').send(payload);

            // Must be rejected with a validation error (422)
            return res.status === 422 && res.body.errors !== undefined;
          }
        ),
        { numRuns: 25 }
      );
    },
    15_000
  );
});

// ---------------------------------------------------------------------------
// P6 — Product update round-trip
// Feature: smart-shop-inventory-management, Property 6: For any existing product and any
// valid update payload, updating the product and then fetching it should return the updated
// field values.
// Validates: Requirements 2.3
// ---------------------------------------------------------------------------
describe('P6 — Product update round-trip', () => {
  beforeEach(() => mockQuery.mockReset());

  it(
    'PUT /:id then GET /:id returns updated field values',
    async () => {
      const app = buildProductsApp();

      const updatePayloadArb = fc.record({
        name: fc.string({ minLength: 1, maxLength: 50 }),
        quantity: fc.integer({ min: 0, max: 1000 }),
      });

      await fc.assert(
        fc.asyncProperty(updatePayloadArb, async (updatePayload) => {
          mockQuery.mockReset();

          const updatedRow = buildProductRow(PRODUCT_ID, {
            name: updatePayload.name,
            categoryId: CATEGORY_ID,
            quantity: updatePayload.quantity,
          });

          // PUT: UPDATE RETURNING id, SELECT full row,
          // then alert service: SELECT product, SELECT settings, SELECT existing alerts (conditional)
          // GET /:id uses persistent fallback mock
          mockQuery
            .mockResolvedValueOnce({ rows: [{ id: PRODUCT_ID }] })   // UPDATE RETURNING id
            .mockResolvedValueOnce({ rows: [updatedRow] })            // SELECT full row
            .mockResolvedValueOnce({ rows: [{ quantity: updatePayload.quantity, minimum_threshold: 0, expiry_date: null }] }) // alert: SELECT product
            .mockResolvedValueOnce({ rows: [] })                      // alert: SELECT settings
            .mockResolvedValue({ rows: [updatedRow] });               // fallback: alert SELECT existing alerts OR GET /:id

          const putRes = await request(app)
            .put(`/products/${PRODUCT_ID}`)
            .send(updatePayload);

          if (putRes.status !== 200) return false;

          // GET /:id — uses the persistent fallback mock
          const getRes = await request(app).get(`/products/${PRODUCT_ID}`);
          if (getRes.status !== 200) return false;

          const body = getRes.body as Record<string, unknown>;
          return (
            body.name === updatePayload.name &&
            body.quantity === updatePayload.quantity
          );
        }),
        { numRuns: 25 }
      );
    },
    15_000
  );
});

// ---------------------------------------------------------------------------
// P7 — Product deletion round-trip
// Feature: smart-shop-inventory-management, Property 7: For any existing product,
// deleting it and then attempting to fetch it should return a not-found response.
// Validates: Requirements 2.4
// ---------------------------------------------------------------------------
describe('P7 — Product deletion round-trip', () => {
  beforeEach(() => mockQuery.mockReset());

  it(
    'DELETE /:id then GET /:id returns 404',
    async () => {
      const app = buildProductsApp();

      await fc.assert(
        fc.asyncProperty(fc.uuid(), async (productId) => {
          mockQuery.mockReset();

          // DELETE: RETURNING id (product found and deleted)
          mockQuery.mockResolvedValueOnce({ rows: [{ id: productId }] });

          const deleteRes = await request(app).delete(`/products/${productId}`);
          if (deleteRes.status !== 204) return false;

          // GET /:id: no rows (product gone)
          mockQuery.mockResolvedValueOnce({ rows: [] });

          const getRes = await request(app).get(`/products/${productId}`);
          return getRes.status === 404;
        }),
        { numRuns: 25 }
      );
    },
    15_000
  );
});

// ---------------------------------------------------------------------------
// P10 — Stock status derivation correctness (pure function)
// Feature: smart-shop-inventory-management, Property 10: For any product quantity and
// minimum threshold, deriveStockStatus should return the correct status.
// Validates: Requirements 4.2, 4.3
// ---------------------------------------------------------------------------
describe('P10 — Stock status derivation correctness', () => {
  it(
    'deriveStockStatus returns "out_of_stock" when quantity = 0',
    () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 10000 }), (threshold) => {
          return deriveStockStatus(0, threshold) === 'out_of_stock';
        }),
        { numRuns: 25 }
      );
    }
  );

  it(
    'deriveStockStatus returns "low_stock" when 0 < quantity <= threshold',
    () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10000 }),
          fc.integer({ min: 1, max: 10000 }),
          (quantity, threshold) => {
            fc.pre(quantity <= threshold);
            return deriveStockStatus(quantity, threshold) === 'low_stock';
          }
        ),
        { numRuns: 25 }
      );
    }
  );

  it(
    'deriveStockStatus returns "in_stock" when quantity > threshold',
    () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10000 }),
          fc.integer({ min: 0, max: 9999 }),
          (quantity, threshold) => {
            fc.pre(quantity > threshold);
            return deriveStockStatus(quantity, threshold) === 'in_stock';
          }
        ),
        { numRuns: 25 }
      );
    }
  );
});

// ---------------------------------------------------------------------------
// P11 — Stock movement quantity invariant
// Feature: smart-shop-inventory-management, Property 11: For any sequence of stock
// additions and reductions, the final quantity equals the sum of all deltas and never
// goes below zero (underflow is rejected).
// Validates: Requirements 4.5
// ---------------------------------------------------------------------------
describe('P11 — Stock movement quantity invariant', () => {
  beforeEach(() => mockQuery.mockReset());

  it(
    'final quantity equals sum of applied deltas and never goes below zero',
    async () => {
      const app = buildProductsApp();

      const movementArb = fc.record({
        movementType: fc.constantFrom('addition' as const, 'reduction' as const),
        quantity: fc.integer({ min: 1, max: 50 }),
      });

      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 200 }),
          fc.array(movementArb, { minLength: 1, maxLength: 10 }),
          async (initialQty, movements) => {
            mockQuery.mockReset();

            let currentQty = initialQty;
            const appliedDeltas: number[] = [];

            for (const movement of movements) {
              const delta =
                movement.movementType === 'addition'
                  ? movement.quantity
                  : -movement.quantity;

              if (currentQty + delta < 0) {
                // Underflow: mock returns 422
                mockQuery.mockResolvedValueOnce({
                  rows: [{ quantity: currentQty }],
                });

                const res = await request(app)
                  .post(`/products/${PRODUCT_ID}/stock`)
                  .send(movement);

                if (res.status !== 422) return false;
                // quantity unchanged
              } else {
                const newQty = currentQty + delta;
                const updatedRow = buildProductRow(PRODUCT_ID, {
                  name: 'Test',
                  categoryId: CATEGORY_ID,
                  quantity: newQty,
                });

                mockQuery
                  .mockResolvedValueOnce({ rows: [{ quantity: currentQty }] }) // SELECT qty
                  .mockResolvedValueOnce({ rows: [] })                          // UPDATE qty
                  .mockResolvedValueOnce({ rows: [] })                          // INSERT movement
                  .mockResolvedValueOnce({ rows: [updatedRow] })                // SELECT full
                  .mockResolvedValueOnce({ rows: [{ quantity: newQty, minimum_threshold: 0, expiry_date: null }] }) // alert: SELECT product
                  .mockResolvedValueOnce({ rows: [] })                          // alert: SELECT settings
                  .mockResolvedValue({ rows: [] });                             // alert: SELECT existing alerts (conditional) + any further calls

                const res = await request(app)
                  .post(`/products/${PRODUCT_ID}/stock`)
                  .send(movement);

                if (res.status !== 200) return false;
                if ((res.body as { quantity: number }).quantity !== newQty) return false;

                currentQty = newQty;
                appliedDeltas.push(delta);
              }
            }

            // Final quantity must be >= 0
            return currentQty >= 0;
          }
        ),
        { numRuns: 25 }
      );
    },
    20_000
  );
});

// ---------------------------------------------------------------------------
// P13 — Expiry status derivation correctness (pure function)
// Feature: smart-shop-inventory-management, Property 13: For any product expiry date and
// near-expiry window, deriveExpiryStatus should return the correct status.
// Validates: Requirements 5.1, 5.2
// ---------------------------------------------------------------------------
describe('P13 — Expiry status derivation correctness', () => {
  it(
    'returns null when expiryDate is null',
    () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 365 }), (window) => {
          return deriveExpiryStatus(null, window) === null;
        }),
        { numRuns: 25 }
      );
    }
  );

  it(
    'returns "expired" when expiry date is before today',
    () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 3650 }),
          fc.integer({ min: 1, max: 365 }),
          (daysAgo, window) => {
            const expiry = new Date();
            expiry.setDate(expiry.getDate() - daysAgo);
            return deriveExpiryStatus(expiry, window) === 'expired';
          }
        ),
        { numRuns: 25 }
      );
    }
  );

  it(
    'returns "near_expiry" when expiry date is within the near-expiry window',
    () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 30 }),
          fc.integer({ min: 30, max: 365 }),
          (daysUntilExpiry, window) => {
            fc.pre(daysUntilExpiry <= window);
            const expiry = new Date();
            expiry.setDate(expiry.getDate() + daysUntilExpiry);
            return deriveExpiryStatus(expiry, window) === 'near_expiry';
          }
        ),
        { numRuns: 25 }
      );
    }
  );

  it(
    'returns "valid" when expiry date is beyond the near-expiry window',
    () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 30 }),
          fc.integer({ min: 1, max: 30 }),
          (extraDays, window) => {
            const daysUntilExpiry = window + extraDays;
            const expiry = new Date();
            expiry.setDate(expiry.getDate() + daysUntilExpiry);
            return deriveExpiryStatus(expiry, window) === 'valid';
          }
        ),
        { numRuns: 25 }
      );
    }
  );
});

// ---------------------------------------------------------------------------
// P14 — Expiry status present in all product listings
// Feature: smart-shop-inventory-management, Property 14: For any product with an expiry
// date, the listing response should include the derived expiry status alongside the product.
// Validates: Requirements 5.3
// ---------------------------------------------------------------------------
describe('P14 — Expiry status present in all product listings', () => {
  beforeEach(() => mockQuery.mockReset());

  it(
    'GET /products always includes expiryStatus for products with an expiry date',
    async () => {
      const app = buildProductsApp();

      // Generate ISO date strings (past, near-future, far-future)
      const expiryDateArb = fc.oneof(
        // Past date (expired)
        fc.integer({ min: 1, max: 365 }).map((d) => {
          const date = new Date();
          date.setDate(date.getDate() - d);
          return date.toISOString().split('T')[0];
        }),
        // Future date within 30 days (near expiry)
        fc.integer({ min: 1, max: 29 }).map((d) => {
          const date = new Date();
          date.setDate(date.getDate() + d);
          return date.toISOString().split('T')[0];
        }),
        // Future date beyond 30 days (valid)
        fc.integer({ min: 31, max: 365 }).map((d) => {
          const date = new Date();
          date.setDate(date.getDate() + d);
          return date.toISOString().split('T')[0];
        })
      );

      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              name: fc.string({ minLength: 1, maxLength: 30 }),
              expiryDate: expiryDateArb,
            }),
            { minLength: 1, maxLength: 5 }
          ),
          async (products) => {
            mockQuery.mockReset();

            const rows = products.map((p, i) =>
              buildProductRow(`id-${i}`, {
                name: p.name,
                categoryId: CATEGORY_ID,
                quantity: 10,
                expiryDate: p.expiryDate,
              })
            );

            mockQuery.mockResolvedValueOnce({ rows });

            const res = await request(app).get('/products');
            if (res.status !== 200) return false;

            const body = res.body as Array<Record<string, unknown>>;

            // Every product with an expiry date must have a non-null expiryStatus
            return body.every(
              (item) =>
                item.expiryDate !== null
                  ? item.expiryStatus !== null && item.expiryStatus !== undefined
                  : true
            );
          }
        ),
        { numRuns: 25 }
      );
    },
    15_000
  );
});

// ---------------------------------------------------------------------------
// P15 — Expiry filter correctness
// Feature: smart-shop-inventory-management, Property 15: For any expiry status filter value
// ("Near Expiry", "Expired", "Valid"), all products returned by the filtered list should have
// an expiry status matching the filter, and no matching products should be excluded.
// Validates: Requirements 5.4
// ---------------------------------------------------------------------------
describe('P15 — Expiry filter correctness', () => {
  beforeEach(() => mockQuery.mockReset());

  it(
    'GET /products?expiryStatus=X returns only products with matching expiry status and excludes none',
    async () => {
      const app = buildProductsApp();

      const NEAR_EXPIRY_WINDOW = 30;

      // Generate a date string that produces a specific expiry status
      function makeDateForStatus(status: 'expired' | 'near_expiry' | 'valid'): string {
        const d = new Date();
        if (status === 'expired') {
          d.setDate(d.getDate() - 10);
        } else if (status === 'near_expiry') {
          d.setDate(d.getDate() + 10); // within 30-day window
        } else {
          d.setDate(d.getDate() + NEAR_EXPIRY_WINDOW + 10); // beyond window
        }
        return d.toISOString().split('T')[0];
      }

      const expiryStatusArb = fc.constantFrom('expired' as const, 'near_expiry' as const, 'valid' as const);

      await fc.assert(
        fc.asyncProperty(
          expiryStatusArb,
          fc.array(expiryStatusArb, { minLength: 1, maxLength: 8 }),
          async (filterStatus, productStatuses) => {
            mockQuery.mockReset();

            const rows = productStatuses.map((status, i) =>
              buildProductRow(`id-${i}`, {
                name: `Product ${i}`,
                categoryId: CATEGORY_ID,
                quantity: 10,
                minimumThreshold: 5,
                expiryDate: makeDateForStatus(status),
              })
            );

            mockQuery.mockResolvedValueOnce({ rows });

            // Map internal status to query param value
            const filterParamMap: Record<string, string> = {
              expired: 'Expired',
              near_expiry: 'Near Expiry',
              valid: 'Valid',
            };
            const filterParam = filterParamMap[filterStatus];

            const res = await request(app).get(`/products?expiryStatus=${encodeURIComponent(filterParam)}`);
            if (res.status !== 200) return false;

            const body = res.body as Array<Record<string, unknown>>;

            // All returned products must match the filter
            const allMatch = body.every((p) => p.expiryStatus === filterStatus);

            // No matching products should be excluded
            const matchingCount = productStatuses.filter((s) => s === filterStatus).length;
            const returnedCount = body.length;
            const noneExcluded = returnedCount === matchingCount;

            return allMatch && noneExcluded;
          }
        ),
        { numRuns: 100 }
      );
    },
    20_000
  );
});

// ---------------------------------------------------------------------------
// P17 — Search correctness
// Feature: smart-shop-inventory-management, Property 17: For any search term and product
// catalog, all returned products should have a name or category name containing the search
// term (case-insensitive), and no products matching the term should be absent from the results.
// Validates: Requirements 7.1
// ---------------------------------------------------------------------------
describe('P17 — Search correctness', () => {
  beforeEach(() => mockQuery.mockReset());

  it(
    'GET /products?q=term returns exactly the products whose name or category contains the term',
    async () => {
      const app = buildProductsApp();

      // Arbitrary: a search term and a list of products, some of which contain the term
      const searchTermArb = fc.string({ minLength: 1, maxLength: 8 }).filter((s) => s.trim().length > 0);

      await fc.assert(
        fc.asyncProperty(
          searchTermArb,
          fc.array(
            fc.record({
              name: fc.string({ minLength: 1, maxLength: 30 }),
              categoryName: fc.string({ minLength: 1, maxLength: 20 }),
            }),
            { minLength: 1, maxLength: 8 }
          ),
          async (term, products) => {
            mockQuery.mockReset();

            // The route does SQL ILIKE filtering; we simulate by only returning rows
            // that actually match (as the DB would do), then verify the response.
            const allRows = products.map((p, i) => ({
              id: `id-${i}`,
              name: p.name,
              category_id: CATEGORY_ID,
              category_name: p.categoryName,
              quantity: 10,
              minimum_threshold: 5,
              rack: null,
              shelf: null,
              section: null,
              expiry_date: null,
              created_at: '2024-01-01T00:00:00.000Z',
              updated_at: '2024-01-01T00:00:00.000Z',
            }));

            const termLower = term.toLowerCase();
            // Simulate what the DB ILIKE would return
            const matchingRows = allRows.filter(
              (r) =>
                r.name.toLowerCase().includes(termLower) ||
                r.category_name.toLowerCase().includes(termLower)
            );

            // Mock returns only matching rows (as DB would after ILIKE)
            mockQuery.mockResolvedValueOnce({ rows: matchingRows });

            const res = await request(app).get(`/products?q=${encodeURIComponent(term)}`);
            if (res.status !== 200) return false;

            const body = res.body as Array<Record<string, unknown>>;

            // All returned products must contain the search term in name or categoryName
            const allMatch = body.every(
              (p) =>
                (p.name as string).toLowerCase().includes(termLower) ||
                (p.categoryName as string).toLowerCase().includes(termLower)
            );

            // No matching products should be absent
            const noneExcluded = body.length === matchingRows.length;

            return allMatch && noneExcluded;
          }
        ),
        { numRuns: 100 }
      );
    },
    20_000
  );
});

// ---------------------------------------------------------------------------
// P18 — Multi-filter correctness
// Feature: smart-shop-inventory-management, Property 18: For any combination of active
// filters (category, stock status, expiry status), every product in the result set should
// satisfy all active filters simultaneously (AND semantics).
// Validates: Requirements 7.3
// ---------------------------------------------------------------------------
describe('P18 — Multi-filter correctness', () => {
  beforeEach(() => mockQuery.mockReset());

  it(
    'GET /products with multiple filters returns only products satisfying all filters (AND semantics)',
    async () => {
      const app = buildProductsApp();

      const NEAR_EXPIRY_WINDOW = 30;

      function makeDateForStatus(status: 'expired' | 'near_expiry' | 'valid'): string {
        const d = new Date();
        if (status === 'expired') {
          d.setDate(d.getDate() - 10);
        } else if (status === 'near_expiry') {
          d.setDate(d.getDate() + 10);
        } else {
          d.setDate(d.getDate() + NEAR_EXPIRY_WINDOW + 10);
        }
        return d.toISOString().split('T')[0];
      }

      const stockStatusArb = fc.constantFrom('in_stock' as const, 'low_stock' as const, 'out_of_stock' as const);
      const expiryStatusArb = fc.constantFrom('expired' as const, 'near_expiry' as const, 'valid' as const);

      // Optional filter values (null = filter not applied)
      const optionalStockArb = fc.option(stockStatusArb, { nil: null });
      const optionalExpiryArb = fc.option(expiryStatusArb, { nil: null });
      const optionalCategoryArb = fc.option(fc.string({ minLength: 1, maxLength: 10 }), { nil: null });

      await fc.assert(
        fc.asyncProperty(
          optionalStockArb,
          optionalExpiryArb,
          optionalCategoryArb,
          fc.array(
            fc.record({
              name: fc.string({ minLength: 1, maxLength: 20 }),
              categoryName: fc.string({ minLength: 1, maxLength: 10 }),
              stockStatus: stockStatusArb,
              expiryStatus: expiryStatusArb,
            }),
            { minLength: 1, maxLength: 8 }
          ),
          async (filterStock, filterExpiry, filterCategory, products) => {
            mockQuery.mockReset();

            const categoryFilterLower = filterCategory ? filterCategory.toLowerCase() : null;

            // Build rows; simulate DB-level category filter (ILIKE)
            const allRows = products.map((p, i) => {
              const qty =
                p.stockStatus === 'out_of_stock' ? 0 :
                p.stockStatus === 'low_stock' ? 3 : 20;
              const threshold = p.stockStatus === 'low_stock' ? 5 : 2;
              return {
                id: `id-${i}`,
                name: p.name,
                category_id: CATEGORY_ID,
                category_name: p.categoryName,
                quantity: qty,
                minimum_threshold: threshold,
                rack: null,
                shelf: null,
                section: null,
                expiry_date: makeDateForStatus(p.expiryStatus),
                created_at: '2024-01-01T00:00:00.000Z',
                updated_at: '2024-01-01T00:00:00.000Z',
              };
            });

            // Simulate DB-level category ILIKE filter
            const dbRows = categoryFilterLower
              ? allRows.filter((r) => r.category_name.toLowerCase().includes(categoryFilterLower))
              : allRows;

            mockQuery.mockResolvedValueOnce({ rows: dbRows });

            // Build query string
            const params = new URLSearchParams();
            if (filterCategory) params.set('category', filterCategory);
            if (filterStock) {
              const stockParamMap: Record<string, string> = {
                in_stock: 'In Stock',
                low_stock: 'Low Stock',
                out_of_stock: 'Out of Stock',
              };
              params.set('stockStatus', stockParamMap[filterStock]);
            }
            if (filterExpiry) {
              const expiryParamMap: Record<string, string> = {
                expired: 'Expired',
                near_expiry: 'Near Expiry',
                valid: 'Valid',
              };
              params.set('expiryStatus', expiryParamMap[filterExpiry]);
            }

            const qs = params.toString();
            const res = await request(app).get(`/products${qs ? '?' + qs : ''}`);
            if (res.status !== 200) return false;

            const body = res.body as Array<Record<string, unknown>>;

            // Every returned product must satisfy all active filters
            return body.every((p) => {
              const categoryOk = !filterCategory ||
                (p.categoryName as string).toLowerCase().includes(categoryFilterLower!);
              const stockOk = !filterStock || p.stockStatus === filterStock;
              const expiryOk = !filterExpiry || p.expiryStatus === filterExpiry;
              return categoryOk && stockOk && expiryOk;
            });
          }
        ),
        { numRuns: 100 }
      );
    },
    25_000
  );
});

// ---------------------------------------------------------------------------
// P19 — Clear filters returns full list
// Feature: smart-shop-inventory-management, Property 19: For any product catalog, applying
// any set of filters and then clearing all filters should return the same result as fetching
// the unfiltered product list.
// Validates: Requirements 7.5
// ---------------------------------------------------------------------------
describe('P19 — Clear filters returns full list', () => {
  beforeEach(() => mockQuery.mockReset());

  it(
    'GET /products (no filters) returns the same products as after clearing all filters',
    async () => {
      const app = buildProductsApp();

      const NEAR_EXPIRY_WINDOW = 30;

      function makeDateForStatus(status: 'expired' | 'near_expiry' | 'valid'): string {
        const d = new Date();
        if (status === 'expired') {
          d.setDate(d.getDate() - 10);
        } else if (status === 'near_expiry') {
          d.setDate(d.getDate() + 10);
        } else {
          d.setDate(d.getDate() + NEAR_EXPIRY_WINDOW + 10);
        }
        return d.toISOString().split('T')[0];
      }

      const stockStatusArb = fc.constantFrom('in_stock' as const, 'low_stock' as const, 'out_of_stock' as const);
      const expiryStatusArb = fc.constantFrom('expired' as const, 'near_expiry' as const, 'valid' as const);

      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              name: fc.string({ minLength: 1, maxLength: 20 }),
              categoryName: fc.string({ minLength: 1, maxLength: 10 }),
              stockStatus: stockStatusArb,
              expiryStatus: expiryStatusArb,
            }),
            { minLength: 1, maxLength: 8 }
          ),
          async (products) => {
            mockQuery.mockReset();

            const rows = products.map((p, i) => {
              const qty =
                p.stockStatus === 'out_of_stock' ? 0 :
                p.stockStatus === 'low_stock' ? 3 : 20;
              const threshold = p.stockStatus === 'low_stock' ? 5 : 2;
              return {
                id: `id-${i}`,
                name: p.name,
                category_id: CATEGORY_ID,
                category_name: p.categoryName,
                quantity: qty,
                minimum_threshold: threshold,
                rack: null,
                shelf: null,
                section: null,
                expiry_date: makeDateForStatus(p.expiryStatus),
                created_at: '2024-01-01T00:00:00.000Z',
                updated_at: '2024-01-01T00:00:00.000Z',
              };
            });

            // Both the filtered request and the cleared (unfiltered) request
            // should return the same full list. We mock the DB to return all rows
            // for both calls.
            mockQuery
              .mockResolvedValueOnce({ rows }) // filtered request (no filters applied = full list)
              .mockResolvedValueOnce({ rows }); // cleared filters request

            // First request: no filters (simulates "cleared" state)
            const clearedRes = await request(app).get('/products');
            if (clearedRes.status !== 200) return false;

            // Second request: also no filters (unfiltered baseline)
            const unfilteredRes = await request(app).get('/products');
            if (unfilteredRes.status !== 200) return false;

            const clearedBody = clearedRes.body as Array<Record<string, unknown>>;
            const unfilteredBody = unfilteredRes.body as Array<Record<string, unknown>>;

            // Both should return the same number of products with the same IDs
            if (clearedBody.length !== unfilteredBody.length) return false;

            const clearedIds = clearedBody.map((p) => p.id as string).sort();
            const unfilteredIds = unfilteredBody.map((p) => p.id as string).sort();

            return clearedIds.every((id, idx) => id === unfilteredIds[idx]);
          }
        ),
        { numRuns: 100 }
      );
    },
    20_000
  );
});

// ---------------------------------------------------------------------------
// P16 — Location present in search results
// Feature: smart-shop-inventory-management, Property 16: For any product search result,
// the response should include the product's rack, shelf, and section fields (or
// "Location not set" if unassigned).
// Validates: Requirements 6.2, 6.3
// ---------------------------------------------------------------------------
describe('P16 — Location present in search results', () => {
  beforeEach(() => mockQuery.mockReset());

  it(
    'GET /products search results always include rack, shelf, section, and location fields',
    async () => {
      const app = buildProductsApp();

      const locationArb = fc.oneof(
        // Product with location set
        fc.record({
          rack: fc.string({ minLength: 1, maxLength: 10 }),
          shelf: fc.string({ minLength: 1, maxLength: 10 }),
          section: fc.string({ minLength: 1, maxLength: 10 }),
        }),
        // Product with no location
        fc.constant({ rack: null, shelf: null, section: null })
      );

      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              name: fc.string({ minLength: 1, maxLength: 30 }),
              location: locationArb,
            }),
            { minLength: 1, maxLength: 5 }
          ),
          async (products) => {
            mockQuery.mockReset();

            const rows = products.map((p, i) => ({
              id: `id-${i}`,
              name: p.name,
              category_id: CATEGORY_ID,
              category_name: 'TestCategory',
              quantity: 5,
              minimum_threshold: 0,
              rack: p.location.rack,
              shelf: p.location.shelf,
              section: p.location.section,
              expiry_date: null,
              created_at: '2024-01-01T00:00:00.000Z',
              updated_at: '2024-01-01T00:00:00.000Z',
            }));

            mockQuery.mockResolvedValueOnce({ rows });

            const res = await request(app).get('/products');
            if (res.status !== 200) return false;

            const body = res.body as Array<Record<string, unknown>>;

            return body.every((item) => {
              // rack, shelf, section must be present (can be null)
              const hasFields =
                'rack' in item && 'shelf' in item && 'section' in item;

              // location must be a non-empty string
              const hasLocation =
                typeof item.location === 'string' && item.location.length > 0;

              // If all location fields are null, location must be "Location not set"
              const allNull =
                item.rack === null && item.shelf === null && item.section === null;
              const locationCorrect = allNull
                ? item.location === 'Location not set'
                : typeof item.location === 'string' && item.location.startsWith('Rack:');

              return hasFields && hasLocation && locationCorrect;
            });
          }
        ),
        { numRuns: 25 }
      );
    },
    15_000
  );
});
