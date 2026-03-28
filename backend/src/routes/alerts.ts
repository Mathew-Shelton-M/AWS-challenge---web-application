import { Router, Request, Response } from 'express';
import pool from '../db/pool';

const router = Router();

// GET / — list active (unacknowledged) alerts
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  const result = await pool.query(
    `SELECT a.id, a.product_id, p.name AS product_name, a.alert_type, a.generated_at, a.acknowledged_at
     FROM alerts a
     JOIN products p ON a.product_id = p.id
     WHERE a.acknowledged_at IS NULL
     ORDER BY a.generated_at DESC`
  );

  const alerts = result.rows.map((row) => ({
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    alertType: row.alert_type,
    generatedAt: row.generated_at,
    acknowledgedAt: row.acknowledged_at,
  }));

  res.json(alerts);
});

// PUT /:id/acknowledge — mark alert as acknowledged
router.put('/:id/acknowledge', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  const result = await pool.query(
    `UPDATE alerts
     SET acknowledged_at = COALESCE(acknowledged_at, NOW())
     WHERE id = $1
     RETURNING id, product_id, alert_type, generated_at, acknowledged_at`,
    [id]
  );

  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Alert not found' });
    return;
  }

  const row = result.rows[0];

  // Fetch product name for the response shape
  const productResult = await pool.query(
    `SELECT p.name AS product_name FROM products p WHERE p.id = $1`,
    [row.product_id]
  );

  res.json({
    id: row.id,
    productId: row.product_id,
    productName: productResult.rows[0]?.product_name ?? null,
    alertType: row.alert_type,
    generatedAt: row.generated_at,
    acknowledgedAt: row.acknowledged_at,
  });
});

export default router;
