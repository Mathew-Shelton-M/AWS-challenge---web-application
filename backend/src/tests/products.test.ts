/**
 * Products integration tests
 * Validates: Requirements 2, 4, 5, 6
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

// Mock the auth middleware to always authenticate
jest.mock('../middleware/auth', () => ({
  authenticate: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import pool from '../db/pool';

const mockQuery = pool.query as jest.Mock;

const PRODUCT_ID = '550e8400-e29b-41d4-a716-446655440001';
const CATEGORY_ID = '550e8400-e29b-41d4-a716-446655440002';

const PRODUCT_ROW = {
  id: PRODUCT_ID,
  name: 'Milk',
  category_id: CATEGORY_ID,
  category_name: 'Dairy',
  quantity: 10,
  minimum_threshold: 5,
  rack: 'A',
  shelf: '1',
  section: 'B',
  expiry_date: null,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

const EXPECTED_PRODUCT = {
  id: PRODUCT_ID,
  name: 'Milk',
  categoryId: CATEGORY_ID,
  categoryName: 'Dairy',
  quantity: 10,
  minimumThreshold: 5,
  rack: 'A',
  shelf: '1',
  section: 'B',
  location: 'Rack: A, Shelf: 1, Section: B',
  expiryDate: null,
  stockStatus: 'in_stock',
  expiryStatus: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

describe('POST /products', () => {
  beforeEach(() => mockQuery.mockReset());

  it('returns 201 with full product object on valid input', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: PRODUCT_ID }] }) // INSERT
      .mockResolvedValueOnce({ rows: [PRODUCT_ROW] })        // SELECT full product
      // evaluateAndGenerateAlerts queries:
      .mockResolvedValueOnce({ rows: [{ quantity: 10, minimum_threshold: 5, expiry_date: null }] }) // product fetch
      .mockResolvedValueOnce({ rows: [] })                   // settings fetch
      .mockResolvedValueOnce({ rows: [] });                  // existing alerts fetch (in_stock → no alerts)

    const res = await request(createTestApp())
      .post('/products')
      .send({ name: 'Milk', categoryId: CATEGORY_ID, quantity: 10, minimumThreshold: 5, rack: 'A', shelf: '1', section: 'B' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject(EXPECTED_PRODUCT);
  });

  it('returns 422 when name is missing', async () => {
    const res = await request(createTestApp())
      .post('/products')
      .send({ categoryId: 'cat-uuid-1234', quantity: 10 });

    expect(res.status).toBe(422);
    expect(res.body).toHaveProperty('errors');
  });

  it('returns 422 when categoryId is not a UUID', async () => {
    const res = await request(createTestApp())
      .post('/products')
      .send({ name: 'Milk', categoryId: 'not-a-uuid', quantity: 10 });

    expect(res.status).toBe(422);
    expect(res.body).toHaveProperty('errors');
  });

  it('returns 422 when quantity is negative', async () => {
    const res = await request(createTestApp())
      .post('/products')
      .send({ name: 'Milk', categoryId: CATEGORY_ID, quantity: -1 });

    expect(res.status).toBe(422);
    expect(res.body).toHaveProperty('errors');
  });

  it('derives stockStatus correctly — out_of_stock when quantity is 0', async () => {
    const zeroQtyRow = { ...PRODUCT_ROW, quantity: 0, minimum_threshold: 5 };
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: PRODUCT_ID }] })
      .mockResolvedValueOnce({ rows: [zeroQtyRow] })
      // evaluateAndGenerateAlerts:
      .mockResolvedValueOnce({ rows: [{ quantity: 0, minimum_threshold: 5, expiry_date: null }] })
      .mockResolvedValueOnce({ rows: [] })                   // settings (near_expiry_window)
      .mockResolvedValueOnce({ rows: [] })                   // existing alerts
      .mockResolvedValueOnce({ rows: [] })                   // notif settings
      .mockResolvedValueOnce({ rows: [{ name: 'Milk' }] })   // product name for notification
      .mockResolvedValueOnce({ rows: [{ id: 'alert-id', generated_at: new Date().toISOString() }] }); // INSERT alert

    const res = await request(createTestApp())
      .post('/products')
      .send({ name: 'Milk', categoryId: CATEGORY_ID, quantity: 0 });

    expect(res.status).toBe(201);
    expect(res.body.stockStatus).toBe('out_of_stock');
  });

  it('derives stockStatus correctly — low_stock when quantity <= threshold', async () => {
    const lowRow = { ...PRODUCT_ROW, quantity: 3, minimum_threshold: 5 };
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: PRODUCT_ID }] })
      .mockResolvedValueOnce({ rows: [lowRow] })
      // evaluateAndGenerateAlerts:
      .mockResolvedValueOnce({ rows: [{ quantity: 3, minimum_threshold: 5, expiry_date: null }] })
      .mockResolvedValueOnce({ rows: [] })                   // settings (near_expiry_window)
      .mockResolvedValueOnce({ rows: [] })                   // existing alerts
      .mockResolvedValueOnce({ rows: [] })                   // notif settings
      .mockResolvedValueOnce({ rows: [{ name: 'Milk' }] })   // product name for notification
      .mockResolvedValueOnce({ rows: [{ id: 'alert-id', generated_at: new Date().toISOString() }] }); // INSERT alert

    const res = await request(createTestApp())
      .post('/products')
      .send({ name: 'Milk', categoryId: CATEGORY_ID, quantity: 3, minimumThreshold: 5 });

    expect(res.status).toBe(201);
    expect(res.body.stockStatus).toBe('low_stock');
  });
});

describe('GET /products', () => {
  beforeEach(() => mockQuery.mockReset());

  it('returns array of products with stockStatus and expiryStatus', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [PRODUCT_ROW] });

    const res = await request(createTestApp()).get('/products');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toMatchObject({ stockStatus: 'in_stock', expiryStatus: null });
  });

  it('returns empty array when no products', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(createTestApp()).get('/products');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('includes category name in each product', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [PRODUCT_ROW] });

    const res = await request(createTestApp()).get('/products');

    expect(res.body[0].categoryName).toBe('Dairy');
  });
});

describe('GET /products/:id', () => {
  beforeEach(() => mockQuery.mockReset());

  it('returns 200 with product when found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [PRODUCT_ROW] });

    const res = await request(createTestApp()).get(`/products/${PRODUCT_ID}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject(EXPECTED_PRODUCT);
  });

  it('returns 404 when product not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(createTestApp()).get('/products/nonexistent-id');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Product not found' });
  });
});

describe('PUT /products/:id', () => {
  beforeEach(() => mockQuery.mockReset());

  it('returns 200 with updated product', async () => {
    const updatedRow = { ...PRODUCT_ROW, name: 'Full Cream Milk' };
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: PRODUCT_ID }] }) // UPDATE
      .mockResolvedValueOnce({ rows: [updatedRow] })          // SELECT
      // evaluateAndGenerateAlerts:
      .mockResolvedValueOnce({ rows: [{ quantity: 10, minimum_threshold: 5, expiry_date: null }] })
      .mockResolvedValueOnce({ rows: [] })                    // settings
      .mockResolvedValueOnce({ rows: [] });                   // existing alerts (in_stock → no alerts)

    const res = await request(createTestApp())
      .put(`/products/${PRODUCT_ID}`)
      .send({ name: 'Full Cream Milk' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Full Cream Milk');
  });

  it('returns 404 when product not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(createTestApp())
      .put('/products/nonexistent-id')
      .send({ name: 'Updated' });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Product not found' });
  });

  it('returns 422 when no fields provided', async () => {
    const res = await request(createTestApp())
      .put(`/products/${PRODUCT_ID}`)
      .send({});

    expect(res.status).toBe(422);
  });
});

describe('DELETE /products/:id', () => {
  beforeEach(() => mockQuery.mockReset());

  it('returns 204 when product deleted', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: PRODUCT_ID }] });

    const res = await request(createTestApp()).delete(`/products/${PRODUCT_ID}`);

    expect(res.status).toBe(204);
  });

  it('returns 404 when product not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(createTestApp()).delete('/products/nonexistent-id');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Product not found' });
  });
});

describe('POST /products/:id/stock', () => {
  beforeEach(() => mockQuery.mockReset());

  it('returns 200 with updated product after addition', async () => {
    const updatedRow = { ...PRODUCT_ROW, quantity: 15 };
    mockQuery
      .mockResolvedValueOnce({ rows: [{ quantity: 10 }] })  // SELECT current qty
      .mockResolvedValueOnce({ rows: [] })                   // UPDATE quantity
      .mockResolvedValueOnce({ rows: [] })                   // INSERT stock_movement
      .mockResolvedValueOnce({ rows: [updatedRow] })         // SELECT full product
      // evaluateAndGenerateAlerts:
      .mockResolvedValueOnce({ rows: [{ quantity: 15, minimum_threshold: 5, expiry_date: null }] })
      .mockResolvedValueOnce({ rows: [] })                   // settings
      .mockResolvedValueOnce({ rows: [] });                  // existing alerts (in_stock → no alerts)

    const res = await request(createTestApp())
      .post(`/products/${PRODUCT_ID}/stock`)
      .send({ movementType: 'addition', quantity: 5 });

    expect(res.status).toBe(200);
    expect(res.body.quantity).toBe(15);
  });

  it('returns 200 with updated product after reduction', async () => {
    const updatedRow = { ...PRODUCT_ROW, quantity: 7 };
    mockQuery
      .mockResolvedValueOnce({ rows: [{ quantity: 10 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [updatedRow] })
      // evaluateAndGenerateAlerts:
      .mockResolvedValueOnce({ rows: [{ quantity: 7, minimum_threshold: 5, expiry_date: null }] })
      .mockResolvedValueOnce({ rows: [] })                   // settings (near_expiry_window)
      .mockResolvedValueOnce({ rows: [] })                   // existing alerts
      .mockResolvedValueOnce({ rows: [] })                   // notif settings
      .mockResolvedValueOnce({ rows: [{ name: 'Milk' }] })   // product name for notification
      .mockResolvedValueOnce({ rows: [{ id: 'alert-id', generated_at: new Date().toISOString() }] }); // INSERT low_stock alert

    const res = await request(createTestApp())
      .post(`/products/${PRODUCT_ID}/stock`)
      .send({ movementType: 'reduction', quantity: 3 });

    expect(res.status).toBe(200);
    expect(res.body.quantity).toBe(7);
  });

  it('returns 422 when reduction would cause underflow', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ quantity: 3 }] });

    const res = await request(createTestApp())
      .post(`/products/${PRODUCT_ID}/stock`)
      .send({ movementType: 'reduction', quantity: 5 });

    expect(res.status).toBe(422);
    expect(res.body).toEqual({ error: 'Insufficient stock' });
  });

  it('returns 404 when product not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(createTestApp())
      .post('/products/nonexistent-id/stock')
      .send({ movementType: 'addition', quantity: 5 });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Product not found' });
  });

  it('returns 422 when movementType is invalid', async () => {
    const res = await request(createTestApp())
      .post(`/products/${PRODUCT_ID}/stock`)
      .send({ movementType: 'invalid', quantity: 5 });

    expect(res.status).toBe(422);
    expect(res.body).toHaveProperty('errors');
  });

  it('returns 422 when quantity is zero', async () => {
    const res = await request(createTestApp())
      .post(`/products/${PRODUCT_ID}/stock`)
      .send({ movementType: 'addition', quantity: 0 });

    expect(res.status).toBe(422);
    expect(res.body).toHaveProperty('errors');
  });
});

describe('Location display', () => {
  beforeEach(() => mockQuery.mockReset());

  it('shows "Location not set" when rack, shelf, section are all null', async () => {
    const noLocationRow = { ...PRODUCT_ROW, rack: null, shelf: null, section: null };
    mockQuery.mockResolvedValueOnce({ rows: [noLocationRow] });

    const res = await request(createTestApp()).get(`/products/${PRODUCT_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.location).toBe('Location not set');
  });

  it('formats location correctly when all fields are set', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [PRODUCT_ROW] });

    const res = await request(createTestApp()).get(`/products/${PRODUCT_ID}`);

    expect(res.body.location).toBe('Rack: A, Shelf: 1, Section: B');
  });
});

describe('GET /products — search and filter (tasks 6.1–6.4)', () => {
  beforeEach(() => mockQuery.mockReset());

  const DAIRY_ROW = { ...PRODUCT_ROW, name: 'Milk', category_name: 'Dairy' };
  const BEVERAGE_ROW = {
    ...PRODUCT_ROW,
    id: '550e8400-e29b-41d4-a716-446655440099',
    name: 'Orange Juice',
    category_name: 'Beverages',
    quantity: 2,
    minimum_threshold: 5,
  };

  it('filters by q — returns only products matching search term', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [DAIRY_ROW] });

    const res = await request(createTestApp()).get('/products?q=milk');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('filters by category — returns only products in that category', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [DAIRY_ROW] });

    const res = await request(createTestApp()).get('/products?category=Dairy');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('filters by stockStatus=In Stock — returns only in_stock products', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [DAIRY_ROW, BEVERAGE_ROW] });

    const res = await request(createTestApp()).get('/products?stockStatus=In+Stock');

    expect(res.status).toBe(200);
    // DAIRY_ROW has quantity=10, threshold=5 → in_stock
    // BEVERAGE_ROW has quantity=2, threshold=5 → low_stock (filtered out)
    expect(res.body.every((p: { stockStatus: string }) => p.stockStatus === 'in_stock')).toBe(true);
  });

  it('filters by stockStatus=Low Stock — returns only low_stock products', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [DAIRY_ROW, BEVERAGE_ROW] });

    const res = await request(createTestApp()).get('/products?stockStatus=Low+Stock');

    expect(res.status).toBe(200);
    expect(res.body.every((p: { stockStatus: string }) => p.stockStatus === 'low_stock')).toBe(true);
  });

  it('filters by stockStatus=Out of Stock — returns only out_of_stock products', async () => {
    const outOfStockRow = { ...PRODUCT_ROW, quantity: 0 };
    mockQuery.mockResolvedValueOnce({ rows: [outOfStockRow, DAIRY_ROW] });

    const res = await request(createTestApp()).get('/products?stockStatus=Out+of+Stock');

    expect(res.status).toBe(200);
    expect(res.body.every((p: { stockStatus: string }) => p.stockStatus === 'out_of_stock')).toBe(true);
  });

  it('filters by expiryStatus=Expired — returns only expired products', async () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 10);
    const expiredRow = { ...PRODUCT_ROW, expiry_date: pastDate.toISOString().split('T')[0] };
    mockQuery.mockResolvedValueOnce({ rows: [expiredRow, DAIRY_ROW] });

    const res = await request(createTestApp()).get('/products?expiryStatus=Expired');

    expect(res.status).toBe(200);
    expect(res.body.every((p: { expiryStatus: string }) => p.expiryStatus === 'expired')).toBe(true);
  });

  it('filters by expiryStatus=Near Expiry — returns only near_expiry products', async () => {
    const soonDate = new Date();
    soonDate.setDate(soonDate.getDate() + 5);
    const nearExpiryRow = { ...PRODUCT_ROW, expiry_date: soonDate.toISOString().split('T')[0] };
    mockQuery.mockResolvedValueOnce({ rows: [nearExpiryRow, DAIRY_ROW] });

    const res = await request(createTestApp()).get('/products?expiryStatus=Near+Expiry');

    expect(res.status).toBe(200);
    expect(res.body.every((p: { expiryStatus: string }) => p.expiryStatus === 'near_expiry')).toBe(true);
  });

  it('filters by expiryStatus=Valid — returns only valid products', async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 60);
    const validRow = { ...PRODUCT_ROW, expiry_date: futureDate.toISOString().split('T')[0] };
    mockQuery.mockResolvedValueOnce({ rows: [validRow, DAIRY_ROW] });

    const res = await request(createTestApp()).get('/products?expiryStatus=Valid');

    expect(res.status).toBe(200);
    // DAIRY_ROW has no expiry_date → expiryStatus null (filtered out)
    // validRow has future expiry → valid
    expect(res.body.every((p: { expiryStatus: string }) => p.expiryStatus === 'valid')).toBe(true);
  });

  it('combines q and stockStatus filters (AND semantics)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [DAIRY_ROW] });

    const res = await request(createTestApp()).get('/products?q=milk&stockStatus=In+Stock');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('returns empty array (not error) when no products match filters', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(createTestApp()).get('/products?q=nonexistentproduct12345');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 422 for invalid stockStatus value', async () => {
    const res = await request(createTestApp()).get('/products?stockStatus=InvalidStatus');

    expect(res.status).toBe(422);
    expect(res.body).toHaveProperty('errors');
  });

  it('returns 422 for invalid expiryStatus value', async () => {
    const res = await request(createTestApp()).get('/products?expiryStatus=BadValue');

    expect(res.status).toBe(422);
    expect(res.body).toHaveProperty('errors');
  });
});

describe('GET /products — task 6.5 search and filter unit tests', () => {
  beforeEach(() => mockQuery.mockReset());

  const MILK_ROW = {
    id: '550e8400-e29b-41d4-a716-446655440010',
    name: 'Milk',
    category_id: CATEGORY_ID,
    category_name: 'Dairy',
    quantity: 20,
    minimum_threshold: 5,
    rack: 'A',
    shelf: '1',
    section: 'B',
    expiry_date: null,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  };

  const CHEESE_ROW = {
    id: '550e8400-e29b-41d4-a716-446655440011',
    name: 'Cheese',
    category_id: CATEGORY_ID,
    category_name: 'Dairy',
    quantity: 8,
    minimum_threshold: 3,
    rack: 'A',
    shelf: '2',
    section: 'C',
    expiry_date: null,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  };

  const JUICE_ROW = {
    id: '550e8400-e29b-41d4-a716-446655440012',
    name: 'Orange Juice',
    category_id: '550e8400-e29b-41d4-a716-446655440020',
    category_name: 'Beverages',
    quantity: 2,
    minimum_threshold: 5,
    rack: 'B',
    shelf: '1',
    section: 'A',
    expiry_date: null,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  };

  // 1. Search by name (q param) — returns matching products
  it('search by name (q=milk) returns only products whose name matches', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [MILK_ROW] });

    const res = await request(createTestApp()).get('/products?q=milk');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);
    expect(res.body[0].name).toBe('Milk');
  });

  // 2. Search by category name (q param matching category) — returns matching products
  it('search by category name (q=dairy) returns products in that category', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [MILK_ROW, CHEESE_ROW] });

    const res = await request(createTestApp()).get('/products?q=dairy');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(2);
    expect(res.body.every((p: { categoryName: string }) => p.categoryName === 'Dairy')).toBe(true);
  });

  // 3. Filter by category param — returns only products in that category
  it('filter by category=Dairy returns only Dairy products', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [MILK_ROW, CHEESE_ROW] });

    const res = await request(createTestApp()).get('/products?category=Dairy');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(2);
    expect(res.body.every((p: { categoryName: string }) => p.categoryName === 'Dairy')).toBe(true);
    expect(res.body.map((p: { name: string }) => p.name)).toEqual(
      expect.arrayContaining(['Milk', 'Cheese'])
    );
  });

  // 4. Filter by stockStatus=Low Stock — returns only low stock products
  it('filter by stockStatus=Low Stock returns only low_stock products', async () => {
    // JUICE_ROW: quantity=2, threshold=5 → low_stock
    // MILK_ROW: quantity=20, threshold=5 → in_stock (filtered out)
    mockQuery.mockResolvedValueOnce({ rows: [MILK_ROW, JUICE_ROW] });

    const res = await request(createTestApp()).get('/products?stockStatus=Low+Stock');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);
    expect(res.body[0].name).toBe('Orange Juice');
    expect(res.body[0].stockStatus).toBe('low_stock');
  });

  // 5. Filter by stockStatus=Out of Stock — returns only out of stock products
  it('filter by stockStatus=Out of Stock returns only out_of_stock products', async () => {
    const outOfStockRow = { ...JUICE_ROW, quantity: 0 };
    // MILK_ROW: in_stock, outOfStockRow: out_of_stock
    mockQuery.mockResolvedValueOnce({ rows: [MILK_ROW, outOfStockRow] });

    const res = await request(createTestApp()).get('/products?stockStatus=Out+of+Stock');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);
    expect(res.body[0].stockStatus).toBe('out_of_stock');
    expect(res.body[0].name).toBe('Orange Juice');
  });

  // 6. Filter by expiryStatus=Near Expiry — returns only near expiry products
  it('filter by expiryStatus=Near Expiry returns only near_expiry products', async () => {
    const soonDate = new Date();
    soonDate.setDate(soonDate.getDate() + 10); // 10 days from now → near expiry (within 30-day window)
    const nearExpiryRow = { ...JUICE_ROW, expiry_date: soonDate.toISOString().split('T')[0] };
    // MILK_ROW has no expiry → expiryStatus null (filtered out)
    mockQuery.mockResolvedValueOnce({ rows: [MILK_ROW, nearExpiryRow] });

    const res = await request(createTestApp()).get('/products?expiryStatus=Near+Expiry');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);
    expect(res.body[0].expiryStatus).toBe('near_expiry');
    expect(res.body[0].name).toBe('Orange Juice');
  });

  // 7. Combined filters (q + stockStatus) — AND semantics, returns intersection
  it('combined q=milk and stockStatus=In Stock returns only in_stock milk products', async () => {
    // DB returns only MILK_ROW (q=milk filtered by SQL)
    // Post-filter: MILK_ROW quantity=20, threshold=5 → in_stock → passes stockStatus filter
    mockQuery.mockResolvedValueOnce({ rows: [MILK_ROW] });

    const res = await request(createTestApp()).get('/products?q=milk&stockStatus=In+Stock');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);
    expect(res.body[0].name).toBe('Milk');
    expect(res.body[0].stockStatus).toBe('in_stock');
  });

  // 8. Empty results — returns [] not an error when no products match
  it('returns empty array (not an error) when no products match the query', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(createTestApp()).get('/products?q=xyznonexistentproduct99999');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
