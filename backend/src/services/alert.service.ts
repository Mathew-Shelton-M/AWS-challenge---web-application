/**
 * Alert evaluation service.
 *
 * Called after every product create/update and stock movement.
 * Derives current stock and expiry statuses and inserts new alert records
 * for any transitions — only if no unacknowledged alert of the same type
 * already exists for the product (avoids duplicates).
 */

import { Pool } from 'pg';
import { deriveStockStatus, deriveExpiryStatus } from './product.service';
import { notificationService, Alert } from './notification.service';

type AlertType = 'low_stock' | 'out_of_stock' | 'near_expiry' | 'expired';

const DEFAULT_NEAR_EXPIRY_WINDOW_DAYS = 30;

/**
 * Evaluates stock and expiry status for a product and inserts alert records
 * for any new alert conditions that don't already have an unacknowledged alert.
 */
export async function evaluateAndGenerateAlerts(productId: string, db: Pool): Promise<void> {
  // Fetch product fields needed for status derivation
  const productResult = await db.query(
    'SELECT quantity, minimum_threshold, expiry_date FROM products WHERE id = $1',
    [productId]
  );

  if (productResult.rows.length === 0) return;

  const { quantity, minimum_threshold, expiry_date } = productResult.rows[0] as {
    quantity: number;
    minimum_threshold: number | null;
    expiry_date: string | null;
  };

  // Fetch near_expiry_window from settings (single global row; fall back to default)
  const settingsResult = await db.query(
    'SELECT near_expiry_window FROM settings LIMIT 1'
  );
  const nearExpiryWindowDays =
    settingsResult.rows.length > 0
      ? (settingsResult.rows[0].near_expiry_window as number)
      : DEFAULT_NEAR_EXPIRY_WINDOW_DAYS;

  // Derive current statuses
  const stockStatus = deriveStockStatus(quantity, minimum_threshold ?? 0);
  const expiryStatus = deriveExpiryStatus(
    expiry_date ? new Date(expiry_date) : null,
    nearExpiryWindowDays
  );

  // Determine which alert types are currently triggered
  const triggeredAlerts: AlertType[] = [];

  if (stockStatus === 'out_of_stock') triggeredAlerts.push('out_of_stock');
  else if (stockStatus === 'low_stock') triggeredAlerts.push('low_stock');

  if (expiryStatus === 'expired') triggeredAlerts.push('expired');
  else if (expiryStatus === 'near_expiry') triggeredAlerts.push('near_expiry');

  if (triggeredAlerts.length === 0) return;

  // Fetch existing unacknowledged alerts for this product
  const existingResult = await db.query(
    `SELECT alert_type FROM alerts
     WHERE product_id = $1 AND acknowledged_at IS NULL`,
    [productId]
  );
  const existingTypes = new Set(
    (existingResult.rows as { alert_type: string }[]).map((r) => r.alert_type)
  );

  // Fetch settings for notification channel flags
  const notifSettingsResult = await db.query(
    'SELECT near_expiry_window_days, email_notifications_enabled, sms_notifications_enabled FROM settings LIMIT 1'
  );
  const notifSettings = notifSettingsResult.rows.length > 0
    ? {
        nearExpiryWindowDays: notifSettingsResult.rows[0].near_expiry_window_days as number,
        emailNotificationsEnabled: notifSettingsResult.rows[0].email_notifications_enabled as boolean,
        smsNotificationsEnabled: notifSettingsResult.rows[0].sms_notifications_enabled as boolean,
      }
    : { nearExpiryWindowDays: DEFAULT_NEAR_EXPIRY_WINDOW_DAYS, emailNotificationsEnabled: false, smsNotificationsEnabled: false };

  // Fetch product name for notification messages
  const productNameResult = await db.query('SELECT name FROM products WHERE id = $1', [productId]);
  const productName = (productNameResult.rows[0]?.name as string | undefined) ?? 'Unknown Product';

  // Insert only new alert types (no duplicate unacknowledged alerts)
  for (const alertType of triggeredAlerts) {
    if (!existingTypes.has(alertType)) {
      const insertResult = await db.query(
        'INSERT INTO alerts (product_id, alert_type) VALUES ($1, $2) RETURNING id, generated_at',
        [productId, alertType]
      );

      // Fire-and-forget notification — failures must not affect the alert flow
      if (notifSettings.emailNotificationsEnabled || notifSettings.smsNotificationsEnabled) {
        const row = insertResult.rows[0] as { id: string; generated_at: string };
        const alert: Alert = {
          id: row.id,
          productId,
          productName,
          alertType,
          generatedAt: row.generated_at,
          acknowledgedAt: null,
        };
        notificationService.notify(alert, notifSettings, db).catch((err: unknown) => {
          console.error('[alert.service] Unexpected notification error:', err);
        });
      }
    }
  }
}
