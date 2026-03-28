import { Router, Request, Response } from 'express';
import pool from '../db/pool';
import { validate } from '../middleware/validate';
import { CreateCategorySchema, UpdateCategorySchema } from '../schemas/category.schemas';

const router = Router();

// GET /categories — list all categories ordered by name
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  const result = await pool.query(
    'SELECT id, name, created_at AS "createdAt" FROM categories ORDER BY name ASC'
  );
  res.json(result.rows);
});

// POST /categories — create a new category
router.post('/', validate(CreateCategorySchema), async (req: Request, res: Response): Promise<void> => {
  const { name } = req.body as { name: string };

  try {
    const result = await pool.query(
      'INSERT INTO categories (name) VALUES ($1) RETURNING id, name, created_at AS "createdAt"',
      [name]
    );
    res.status(201).json(result.rows[0]);
  } catch (err: unknown) {
    // PostgreSQL unique violation error code
    if ((err as { code?: string }).code === '23505') {
      res.status(409).json({ error: 'Category already exists' });
      return;
    }
    throw err;
  }
});

// PUT /categories/:id — rename category
router.put('/:id', validate(UpdateCategorySchema), async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { name } = req.body as { name: string };

  try {
    const result = await pool.query(
      'UPDATE categories SET name = $1 WHERE id = $2 RETURNING id, name, created_at AS "createdAt"',
      [name, id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Category not found' });
      return;
    }

    res.status(200).json(result.rows[0]);
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '23505') {
      res.status(409).json({ error: 'Category already exists' });
      return;
    }
    throw err;
  }
});

// DELETE /categories/:id — delete category (409 if products exist)
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  // Check if any products reference this category
  const productCheck = await pool.query(
    'SELECT 1 FROM products WHERE category_id = $1 LIMIT 1',
    [id]
  );

  if (productCheck.rows.length > 0) {
    res.status(409).json({ error: 'Cannot delete category with existing products' });
    return;
  }

  const result = await pool.query(
    'DELETE FROM categories WHERE id = $1 RETURNING id',
    [id]
  );

  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Category not found' });
    return;
  }

  res.status(204).send();
});

export default router;
