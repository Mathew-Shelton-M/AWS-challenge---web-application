/**
 * Reports property-based tests
 *
 * Properties:
 *   P25 - Stock usage report completeness
 *   P26 - Expiry wastage report completeness
 *   P27 - Top-restocked ordering invariant
 *   P28 - CSV export round-trip
 *
 * **Validates: Requirements 10.1, 10.2, 10.3, 10.5**
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

fc.configureGlobal({ numRuns: 100 });

/** Build a minimal Express app with the reports router */
function buildReportsApp() {
  const app = express();
  app.use(express.json());
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const reportsRoutes = require('../routes/reports').default;
  app.use('/reports', reportsRoutes);
  return app;
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Arbitrary for a valid UUID-like product ID */
const productIdArb = fc.uuid();

/** Arbitrary for a product name */
const productNameArb = fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0);

/** Arbitrary for a stock usage row (as returned by the DB) */
const stockUsageRowArb = fc.record({
  productId: productIdArb,
  productName: productNameArb,
  totalAdded: fc.integer({ min: 0, max: 1000 }),
  totalRemoved: fc.integer({ min: 0, max: 1000 }),
  netChange: fc.integer({ min: -1000, max: 1000 }),
  movements: fc.constant([]),
});

/** Arbitrary for an ISO date string (2020-01-01 to 2030-12-31) */
const isoDateArb = fc.integer({ min: 0, max: 3999 }).map((offset) => {
  const base = new Date('2020-01-01T00:00:00.000Z');
  base.setUTCDate(base.getUTCDate() + offset);
  return base.toISOString().split('T')[0];
});

/** Arbitrary for an expiry wastage row (as returned by the DB) */
const expiryWastageRowArb = fc.record({
  productId: productIdArb,
  productName: productNameArb,
  expiryDate: isoDateArb,
  quantityWasted: fc.integer({ min: 0, max: 500 }),
});

/** Arbitrary for a top-restocked row (as returned by the DB) */
const topRestockedRowArb = fc.record({
  productId: productIdArb,
  productName: productNameArb,
  restockCount: fc.integer({ min: 1, max: 100 }),
  totalAdded: fc.integer({ min: 1, max: 10000 }),
});


// ---------------------------------------------------------------------------
// P25 — Stock usage report completeness
// Feature: smart-shop-inventory-management, Property 25: Stock usage report completeness
//
// For any date range, the stock usage report should include an entry for every
// stock movement recorded within that range, with no movements omitted.
// Validates: Requirements 10.1
// ---------------------------------------------------------------------------
describe('P25 — Stock usage report completeness', () => {
  beforeEach(() => mockQuery.mockReset());

  it(
    'GET /reports/stock-usage includes an entry for every product in the mock data',
    async () => {
      const app = buildReportsApp();

      await fc.assert(
        fc.asyncProperty(
          fc.array(stockUsageRowArb, { minLength: 0, maxLength: 15 }),
          async (rows) => {
            mockQuery.mockReset();
            mockQuery.mockResolvedValueOnce({ rows });

            const res = await request(app).get(
              '/reports/stock-usage?startDate=2024-01-01&endDate=2024-01-31'
            );

            if (res.status !== 200) return false;

            const body = res.body as Array<{ productId: string }>;

            // Every product in the mock data must appear in the response
            const returnedIds = new Set(body.map((r) => r.productId));
            return rows.every((row) => returnedIds.has(row.productId));
          }
        ),
        { numRuns: 100 }
      );
    },
    30_000
  );
});

// ---------------------------------------------------------------------------
// P26 — Expiry wastage report completeness
// Feature: smart-shop-inventory-management, Property 26: Expiry wastage report completeness
//
// For any date range, the expiry wastage report should include every product
// whose expiry date falls within that range.
// Validates: Requirements 10.2
// ---------------------------------------------------------------------------
describe('P26 — Expiry wastage report completeness', () => {
  beforeEach(() => mockQuery.mockReset());

  it(
    'GET /reports/expiry-wastage includes every product in the mock data',
    async () => {
      const app = buildReportsApp();

      await fc.assert(
        fc.asyncProperty(
          fc.array(expiryWastageRowArb, { minLength: 0, maxLength: 15 }),
          async (rows) => {
            mockQuery.mockReset();
            mockQuery.mockResolvedValueOnce({ rows });

            const res = await request(app).get(
              '/reports/expiry-wastage?startDate=2024-01-01&endDate=2030-12-31'
            );

            if (res.status !== 200) return false;

            const body = res.body as Array<{ productId: string }>;

            // Every product in the mock data must appear in the response
            const returnedIds = new Set(body.map((r) => r.productId));
            return rows.every((row) => returnedIds.has(row.productId));
          }
        ),
        { numRuns: 100 }
      );
    },
    30_000
  );
});

// ---------------------------------------------------------------------------
// P27 — Top-restocked ordering invariant
// Feature: smart-shop-inventory-management, Property 27: Top-restocked ordering invariant
//
// For any stock movement history, the top-restocked report should list products
// in descending order of restock count, and should contain at most 10 entries.
// Validates: Requirements 10.3
// ---------------------------------------------------------------------------
describe('P27 — Top-restocked ordering invariant', () => {
  beforeEach(() => mockQuery.mockReset());

  it(
    'GET /reports/top-restocked returns entries sorted descending by restockCount and at most 10',
    async () => {
      const app = buildReportsApp();

      await fc.assert(
        fc.asyncProperty(
          // Generate up to 10 rows (as the DB LIMIT 10 would return)
          fc.array(topRestockedRowArb, { minLength: 0, maxLength: 10 }),
          async (unsortedRows) => {
            mockQuery.mockReset();

            // Sort descending by restockCount (simulating what the DB ORDER BY does)
            const rows = [...unsortedRows].sort((a, b) => b.restockCount - a.restockCount);
            mockQuery.mockResolvedValueOnce({ rows });

            const res = await request(app).get(
              '/reports/top-restocked?startDate=2024-01-01&endDate=2024-01-31'
            );

            if (res.status !== 200) return false;

            const body = res.body as Array<{ restockCount: number }>;

            // Must have at most 10 entries
            if (body.length > 10) return false;

            // Must be sorted in descending order of restockCount
            for (let i = 1; i < body.length; i++) {
              if (body[i].restockCount > body[i - 1].restockCount) return false;
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    },
    30_000
  );
});


// ---------------------------------------------------------------------------
// P28 — CSV export round-trip
// Feature: smart-shop-inventory-management, Property 28: CSV export round-trip
//
// For any report, exporting it as CSV and then parsing the CSV should recover
// all the original report rows and field values.
// Validates: Requirements 10.5
// ---------------------------------------------------------------------------
describe('P28 — CSV export round-trip', () => {
  beforeEach(() => mockQuery.mockReset());

  /**
   * CSV parser that handles json2csv output:
  function parseCsv(csv: string): Array<Record<string, string>> {
    // Normalize CRLF (json2csv uses \r\n) to LF before splitting
    const normalized = csv.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = normalized.split('\n').filter((l) => l.trim().length > 0);
   * - Escaped double-quotes ("")
   * Returns an array of objects keyed by the header row.
   */
  function parseCsv(csv: string): Array<Record<string, string>> {
    // Normalize \r\n (json2csv default) and bare \r to \n before splitting
    const lines = csv.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((l) => l.trim().length > 0);
    if (lines.length === 0) return [];

    const unquote = (s: string) => s.replace(/^"|"$/g, '').replace(/""/g, '"');

    const splitLine = (line: string): string[] => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (ch === ',' && !inQuotes) {
          result.push(current);
          current = '';
        } else {
          current += ch;
        }
      }
      result.push(current);
      return result.map(unquote);
    };

    const headers = splitLine(lines[0]);
    return lines.slice(1).map((line) => {
      const values = splitLine(line);
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => {
        obj[h] = values[i] ?? '';
      });
      return obj;
    });
  }

  /** Safe string arbitrary: no quotes, commas, or newlines */
  const safeStringArb = fc
    .string({ minLength: 1, maxLength: 20 })
    .filter((s) => !s.includes('"') && !s.includes(',') && !s.includes('\n') && s.trim().length > 0);

  it(
    'GET /reports/stock-usage/csv round-trip recovers all original rows and field values',
    async () => {
      const app = buildReportsApp();

      const csvStockRowArb = fc.record({
        productId: fc.uuid(),
        productName: safeStringArb,
        totalAdded: fc.integer({ min: 0, max: 1000 }),
        totalRemoved: fc.integer({ min: 0, max: 1000 }),
        netChange: fc.integer({ min: -1000, max: 1000 }),
      });

      await fc.assert(
        fc.asyncProperty(
          fc.array(csvStockRowArb, { minLength: 1, maxLength: 10 }),
          async (rows) => {
            mockQuery.mockReset();
            mockQuery.mockResolvedValueOnce({ rows });

            const res = await request(app).get(
              '/reports/stock-usage/csv?startDate=2024-01-01&endDate=2024-01-31'
            );

            if (res.status !== 200) return false;

            const parsed = parseCsv(res.text);

            // Must have same number of rows
            if (parsed.length !== rows.length) return false;

            // Every original row must be recoverable from the CSV
            return rows.every((row, i) => {
              const csvRow = parsed[i];
              return (
                csvRow['productId'] === String(row.productId) &&
                csvRow['productName'] === String(row.productName) &&
                csvRow['totalAdded'] === String(row.totalAdded) &&
                csvRow['totalRemoved'] === String(row.totalRemoved) &&
                csvRow['netChange'] === String(row.netChange)
              );
            });
          }
        ),
        { numRuns: 100 }
      );
    },
    30_000
  );

  it(
    'GET /reports/expiry-wastage/csv round-trip recovers all original rows and field values',
    async () => {
      const app = buildReportsApp();

      const csvExpiryRowArb = fc.record({
        productId: fc.uuid(),
        productName: safeStringArb,
        expiryDate: isoDateArb,
        quantityWasted: fc.integer({ min: 0, max: 500 }),
      });

      await fc.assert(
        fc.asyncProperty(
          fc.array(csvExpiryRowArb, { minLength: 1, maxLength: 10 }),
          async (rows) => {
            mockQuery.mockReset();
            mockQuery.mockResolvedValueOnce({ rows });

            const res = await request(app).get(
              '/reports/expiry-wastage/csv?startDate=2020-01-01&endDate=2030-12-31'
            );

            if (res.status !== 200) return false;

            const parsed = parseCsv(res.text);

            if (parsed.length !== rows.length) return false;

            return rows.every((row, i) => {
              const csvRow = parsed[i];
              return (
                csvRow['productId'] === String(row.productId) &&
                csvRow['productName'] === String(row.productName) &&
                csvRow['expiryDate'] === String(row.expiryDate) &&
                csvRow['quantityWasted'] === String(row.quantityWasted)
              );
            });
          }
        ),
        { numRuns: 100 }
      );
    },
    30_000
  );

  it(
    'GET /reports/top-restocked/csv round-trip recovers all original rows and field values',
    async () => {
      const app = buildReportsApp();

      const csvTopRestockedRowArb = fc.record({
        productId: fc.uuid(),
        productName: safeStringArb,
        restockCount: fc.integer({ min: 1, max: 100 }),
        totalAdded: fc.integer({ min: 1, max: 10000 }),
      });

      await fc.assert(
        fc.asyncProperty(
          fc.array(csvTopRestockedRowArb, { minLength: 1, maxLength: 10 }),
          async (rows) => {
            mockQuery.mockReset();
            mockQuery.mockResolvedValueOnce({ rows });

            const res = await request(app).get(
              '/reports/top-restocked/csv?startDate=2024-01-01&endDate=2024-01-31'
            );

            if (res.status !== 200) return false;

            const parsed = parseCsv(res.text);

            if (parsed.length !== rows.length) return false;

            return rows.every((row, i) => {
              const csvRow = parsed[i];
              return (
                csvRow['productId'] === String(row.productId) &&
                csvRow['productName'] === String(row.productName) &&
                csvRow['restockCount'] === String(row.restockCount) &&
                csvRow['totalAdded'] === String(row.totalAdded)
              );
            });
          }
        ),
        { numRuns: 100 }
      );
    },
    30_000
  );
});
