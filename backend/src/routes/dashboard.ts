import { Router, Request, Response } from 'express';
import pool from '../db/pool';
import { deriveStockStatus, deriveExpiryStatus } from '../services/product.service';

const router = Router();

// GET / — return inventory summary counts and active alerts
router.get('/', async (req: Request, res: Response): Promise<void> => {
  // Get near_expiry_window_days from settings for the authenticated user
  const userId = req.user?.id;
  const settingsResult = await pool.query(
    `SELECT near_expiry_window_days FROM settings WHERE user_id = $1`,
    [userId]
  );
  const nearExpiryWindowDays: number =
    settingsResult.rows.length > 0 ? settingsResult.rows[0].near_expiry_window_days : 30;

  // Get all products to compute counts
  const productsResult = await pool.query(
    `SELECT quantity, minimum_threshold, expiry_date FROM products`
  );

  let totalProducts = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;
  let nearExpiryCount = 0;
  let expiredCount = 0;

  for (const row of productsResult.rows) {
    totalProducts++;

    const stockStatus = deriveStockStatus(
      row.quantity,
      row.minimum_threshold ?? 0
    );
    if (stockStatus === 'low_stock') lowStockCount++;
    else if (stockStatus === 'out_of_stock') outOfStockCount++;

    const expiryDate = row.expiry_date ? new Date(row.expiry_date) : null;
    const expiryStatus = deriveExpiryStatus(expiryDate, nearExpiryWindowDays);
    if (expiryStatus === 'near_expiry') nearExpiryCount++;
    else if (expiryStatus === 'expired') expiredCount++;
  }

  // Get active (unacknowledged) alerts joined with product name
  const alertsResult = await pool.query(
    `SELECT a.id, a.product_id, p.name AS product_name, a.alert_type, a.generated_at, a.acknowledged_at
     FROM alerts a
     JOIN products p ON a.product_id = p.id
     WHERE a.acknowledged_at IS NULL
     ORDER BY a.generated_at DESC`
  );

  const activeAlerts = alertsResult.rows.map((row) => ({
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    alertType: row.alert_type,
    generatedAt: row.generated_at,
    acknowledgedAt: row.acknowledged_at,
  }));

  res.json({
    totalProducts,
    lowStockCount,
    outOfStockCount,
    nearExpiryCount,
    expiredCount,
    activeAlerts,
  });
});

export default router;
