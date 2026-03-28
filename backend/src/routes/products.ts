import { Router, Request, Response } from 'express';
import pool from '../db/pool';
import { validate } from '../middleware/validate';
import {
  CreateProductSchema,
  UpdateProductSchema,
  StockMovementSchema,
  ProductQuerySchema,
} from '../schemas/product.schemas';
import { deriveStockStatus, deriveExpiryStatus } from '../services/product.service';
import { evaluateAndGenerateAlerts } from '../services/alert.service';

const router = Router();

const NEAR_EXPIRY_WINDOW_DAYS = 30;

async function evaluateAlerts(productId: string): Promise<void> {
  await evaluateAndGenerateAlerts(productId, pool);
}

function formatLocation(rack: string | null, shelf: string | null, section: string | null): string {
  if (rack === null && shelf === null && section === null) return 'Location not set';
  return `Rack: ${rack ?? ''}, Shelf: ${shelf ?? ''}, Section: ${section ?? ''}`;
}

function buildProductResponse(row: Record<string, unknown>) {
  const stockStatus = deriveStockStatus(
    row.quantity as number,
    row.minimum_threshold as number
  );
  const expiryStatus = deriveExpiryStatus(
    row.expiry_date ? new Date(row.expiry_date as string) : null,
    NEAR_EXPIRY_WINDOW_DAYS
  );
  return {
    id: row.id,
    name: row.name,
    categoryId: row.category_id,
    categoryName: row.category_name ?? null,
    quantity: row.quantity,
    minimumThreshold: row.minimum_threshold,
    rack: row.rack ?? null,
    shelf: row.shelf ?? null,
    section: row.section ?? null,
    location: formatLocation(
      row.rack as string | null,
      row.shelf as string | null,
      row.section as string | null
    ),
    expiryDate: row.expiry_date ?? null,
    stockStatus,
    expiryStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const PRODUCT_SELECT = `
  SELECT p.*, c.name AS category_name
  FROM products p
  LEFT JOIN categories c ON p.category_id = c.id
`;

// POST / — create product
router.post('/', validate(CreateProductSchema), async (req: Request, res: Response): Promise<void> => {
  const { name, categoryId, quantity, minimumThreshold, rack, shelf, section, expiryDate } =
    req.body as {
      name: string;
      categoryId: string;
      quantity: number;
      minimumThreshold?: number;
      rack?: string;
      shelf?: string;
      section?: string;
      expiryDate?: string;
    };

  const result = await pool.query(
    `INSERT INTO products (name, category_id, quantity, minimum_threshold, rack, shelf, section, expiry_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [name, categoryId, quantity, minimumThreshold ?? 0, rack ?? null, shelf ?? null, section ?? null, expiryDate ?? null]
  );

  const id = result.rows[0].id as string;

  const full = await pool.query(`${PRODUCT_SELECT} WHERE p.id = $1`, [id]);
  await evaluateAlerts(id);

  res.status(201).json(buildProductResponse(full.rows[0]));
});

// GET / — list products with optional search/filter params
// Supports: q (search term), category, stockStatus, expiryStatus
// AND semantics: all active filters must be satisfied simultaneously
// Returns empty array (never an error) when no products match
router.get('/', async (req: Request, res: Response): Promise<void> => {
  // Validate query params with Zod
  const parsed = ProductQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(422).json({ errors: parsed.error.issues.map((e) => ({ field: e.path.join('.'), message: e.message })) });
    return;
  }

  const { q, category, stockStatus, expiryStatus } = parsed.data;

  const conditions: string[] = [];
  const params: unknown[] = [];

  // Case-insensitive name/category search using pg_trgm ILIKE (trigram index on products.name)
  if (q) {
    params.push('%' + q + '%');
    const idx = params.length;
    conditions.push('(p.name ILIKE $' + idx + ' OR c.name ILIKE $' + idx + ')');
  }

  // Filter by category name (case-insensitive, partial match)
  if (category) {
    params.push('%' + category + '%');
    const idx = params.length;
    conditions.push('c.name ILIKE $' + idx);
  }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  const rows = (await pool.query(PRODUCT_SELECT + ' ' + where + ' ORDER BY p.name ASC', params)).rows;

  let products = rows.map(buildProductResponse);

  // Post-query filtering for derived statuses (AND semantics with SQL filters above)
  if (stockStatus) {
    const stockMap: Record<string, string> = {
      'In Stock': 'in_stock',
      'Low Stock': 'low_stock',
      'Out of Stock': 'out_of_stock',
    };
    products = products.filter((p) => p.stockStatus === stockMap[stockStatus]);
  }
  if (expiryStatus) {
    const expiryMap: Record<string, string> = {
      'Valid': 'valid',
      'Near Expiry': 'near_expiry',
      'Expired': 'expired',
    };
    products = products.filter((p) => p.expiryStatus === expiryMap[expiryStatus]);
  }

  // Always return array — empty array when no matches (never an error)
  res.json(products);
});

// GET /:id — get single product
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const result = await pool.query(PRODUCT_SELECT + ' WHERE p.id = $1', [id]);

  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }

  res.json(buildProductResponse(result.rows[0]));
});

// PUT /:id — update product
router.put('/:id', validate(UpdateProductSchema), async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const updates = req.body as {
    name?: string;
    categoryId?: string;
    quantity?: number;
    minimumThreshold?: number;
    rack?: string;
    shelf?: string;
    section?: string;
    expiryDate?: string;
  };

  // Build dynamic SET clause
  const fields: string[] = [];
  const params: unknown[] = [];

  if (updates.name !== undefined) { params.push(updates.name); fields.push('name = $' + params.length); }
  if (updates.categoryId !== undefined) { params.push(updates.categoryId); fields.push('category_id = $' + params.length); }
  if (updates.quantity !== undefined) { params.push(updates.quantity); fields.push('quantity = $' + params.length); }
  if (updates.minimumThreshold !== undefined) { params.push(updates.minimumThreshold); fields.push('minimum_threshold = $' + params.length); }
  if (updates.rack !== undefined) { params.push(updates.rack); fields.push('rack = $' + params.length); }
  if (updates.shelf !== undefined) { params.push(updates.shelf); fields.push('shelf = $' + params.length); }
  if (updates.section !== undefined) { params.push(updates.section); fields.push('section = $' + params.length); }
  if (updates.expiryDate !== undefined) { params.push(updates.expiryDate); fields.push('expiry_date = $' + params.length); }

  if (fields.length === 0) {
    res.status(422).json({ error: 'No fields to update' });
    return;
  }

  fields.push('updated_at = NOW()');
  params.push(id);

  const updateResult = await pool.query(
    'UPDATE products SET ' + fields.join(', ') + ' WHERE id = $' + params.length + ' RETURNING id',
    params
  );

  if (updateResult.rows.length === 0) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }

  const full = await pool.query(PRODUCT_SELECT + ' WHERE p.id = $1', [id]);
  await evaluateAlerts(id);

  res.json(buildProductResponse(full.rows[0]));
});

// DELETE /:id — delete product
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING id', [id]);

  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }

  res.status(204).send();
});

// POST /:id/stock — record stock movement
router.post('/:id/stock', validate(StockMovementSchema), async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { movementType, quantity } = req.body as { movementType: 'addition' | 'reduction'; quantity: number };

  // Fetch current product
  const productResult = await pool.query('SELECT quantity FROM products WHERE id = $1', [id]);
  if (productResult.rows.length === 0) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }

  const currentQty = productResult.rows[0].quantity as number;

  if (movementType === 'reduction' && currentQty - quantity < 0) {
    res.status(422).json({ error: 'Insufficient stock' });
    return;
  }

  const newQty = movementType === 'addition' ? currentQty + quantity : currentQty - quantity;

  await pool.query(
    'UPDATE products SET quantity = $1, updated_at = NOW() WHERE id = $2',
    [newQty, id]
  );

  await pool.query(
    'INSERT INTO stock_movements (product_id, movement_type, quantity) VALUES ($1, $2, $3)',
    [id, movementType, quantity]
  );

  const full = await pool.query(PRODUCT_SELECT + ' WHERE p.id = $1', [id]);
  await evaluateAlerts(id);

  res.json(buildProductResponse(full.rows[0]));
});

export default router;
