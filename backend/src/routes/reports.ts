import { Router, Request, Response } from 'express';
import pool from '../db/pool';
import { DateRangeSchema } from '../schemas/reports.schemas';
import { Parser } from 'json2csv';

const router = Router();

// Helper: parse and validate date range query params
function parseDateRange(query: Record<string, unknown>): { startDate: string; endDate: string } | null {
  const result = DateRangeSchema.safeParse(query);
  if (!result.success) return null;
  return result.data;
}

// GET /reports/stock-usage
// Query stock_movements within date range, group by product
router.get('/stock-usage', async (req: Request, res: Response): Promise<void> => {
  const range = parseDateRange(req.query as Record<string, unknown>);
  if (!range) {
    res.status(400).json({ error: 'Invalid or missing date range. Provide startDate and endDate as YYYY-MM-DD.' });
    return;
  }

  const { startDate, endDate } = range;

  const result = await pool.query(
    `SELECT
       sm.product_id AS "productId",
       p.name AS "productName",
       SUM(CASE WHEN sm.delta > 0 THEN sm.delta ELSE 0 END)::int AS "totalAdded",
       SUM(CASE WHEN sm.delta < 0 THEN ABS(sm.delta) ELSE 0 END)::int AS "totalRemoved",
       SUM(sm.delta)::int AS "netChange",
       json_agg(
         json_build_object(
           'id', sm.id,
           'delta', sm.delta,
           'quantityAfter', sm.quantity_after,
           'recordedAt', sm.recorded_at
         ) ORDER BY sm.recorded_at
       ) AS movements
     FROM stock_movements sm
     JOIN products p ON sm.product_id = p.id
     WHERE sm.recorded_at >= $1::date
       AND sm.recorded_at < ($2::date + INTERVAL '1 day')
     GROUP BY sm.product_id, p.name
     ORDER BY p.name`,
    [startDate, endDate]
  );

  res.json(result.rows);
});

// GET /reports/expiry-wastage
// Query products with expiry_date within date range
router.get('/expiry-wastage', async (req: Request, res: Response): Promise<void> => {
  const range = parseDateRange(req.query as Record<string, unknown>);
  if (!range) {
    res.status(400).json({ error: 'Invalid or missing date range. Provide startDate and endDate as YYYY-MM-DD.' });
    return;
  }

  const { startDate, endDate } = range;

  const result = await pool.query(
    `SELECT
       p.id AS "productId",
       p.name AS "productName",
       p.expiry_date AS "expiryDate",
       p.quantity AS "quantityWasted"
     FROM products p
     WHERE p.expiry_date >= $1::date
       AND p.expiry_date <= $2::date
     ORDER BY p.expiry_date`,
    [startDate, endDate]
  );

  res.json(result.rows);
});

// GET /reports/top-restocked
// Aggregate stock_movements (positive deltas = restocks), return top 10 by restock count descending
router.get('/top-restocked', async (req: Request, res: Response): Promise<void> => {
  const range = parseDateRange(req.query as Record<string, unknown>);
  if (!range) {
    res.status(400).json({ error: 'Invalid or missing date range. Provide startDate and endDate as YYYY-MM-DD.' });
    return;
  }

  const { startDate, endDate } = range;

  const result = await pool.query(
    `SELECT
       sm.product_id AS "productId",
       p.name AS "productName",
       COUNT(*)::int AS "restockCount",
       SUM(sm.delta)::int AS "totalAdded"
     FROM stock_movements sm
     JOIN products p ON sm.product_id = p.id
     WHERE sm.delta > 0
       AND sm.recorded_at >= $1::date
       AND sm.recorded_at < ($2::date + INTERVAL '1 day')
     GROUP BY sm.product_id, p.name
     ORDER BY "restockCount" DESC
     LIMIT 10`,
    [startDate, endDate]
  );

  res.json(result.rows);
});

// GET /reports/:type/csv
// Serialize report data to CSV and return as file download
router.get('/:type/csv', async (req: Request, res: Response): Promise<void> => {
  const { type } = req.params;
  const validTypes = ['stock-usage', 'expiry-wastage', 'top-restocked'];

  if (!validTypes.includes(type)) {
    res.status(400).json({ error: `Invalid report type. Must be one of: ${validTypes.join(', ')}` });
    return;
  }

  const range = parseDateRange(req.query as Record<string, unknown>);
  if (!range) {
    res.status(400).json({ error: 'Invalid or missing date range. Provide startDate and endDate as YYYY-MM-DD.' });
    return;
  }

  const { startDate, endDate } = range;

  let rows: Record<string, unknown>[] = [];
  let fields: string[] = [];

  if (type === 'stock-usage') {
    const result = await pool.query(
      `SELECT
         sm.product_id AS "productId",
         p.name AS "productName",
         SUM(CASE WHEN sm.delta > 0 THEN sm.delta ELSE 0 END)::int AS "totalAdded",
         SUM(CASE WHEN sm.delta < 0 THEN ABS(sm.delta) ELSE 0 END)::int AS "totalRemoved",
         SUM(sm.delta)::int AS "netChange"
       FROM stock_movements sm
       JOIN products p ON sm.product_id = p.id
       WHERE sm.recorded_at >= $1::date
         AND sm.recorded_at < ($2::date + INTERVAL '1 day')
       GROUP BY sm.product_id, p.name
       ORDER BY p.name`,
      [startDate, endDate]
    );
    rows = result.rows;
    fields = ['productId', 'productName', 'totalAdded', 'totalRemoved', 'netChange'];
  } else if (type === 'expiry-wastage') {
    const result = await pool.query(
      `SELECT
         p.id AS "productId",
         p.name AS "productName",
         p.expiry_date AS "expiryDate",
         p.quantity AS "quantityWasted"
       FROM products p
       WHERE p.expiry_date >= $1::date
         AND p.expiry_date <= $2::date
       ORDER BY p.expiry_date`,
      [startDate, endDate]
    );
    rows = result.rows;
    fields = ['productId', 'productName', 'expiryDate', 'quantityWasted'];
  } else if (type === 'top-restocked') {
    const result = await pool.query(
      `SELECT
         sm.product_id AS "productId",
         p.name AS "productName",
         COUNT(*)::int AS "restockCount",
         SUM(sm.delta)::int AS "totalAdded"
       FROM stock_movements sm
       JOIN products p ON sm.product_id = p.id
       WHERE sm.delta > 0
         AND sm.recorded_at >= $1::date
         AND sm.recorded_at < ($2::date + INTERVAL '1 day')
       GROUP BY sm.product_id, p.name
       ORDER BY "restockCount" DESC
       LIMIT 10`,
      [startDate, endDate]
    );
    rows = result.rows;
    fields = ['productId', 'productName', 'restockCount', 'totalAdded'];
  }

  const parser = new Parser({ fields });
  const csv = parser.parse(rows);

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${type}-report.csv"`);
  res.send(csv);
});

export default router;
