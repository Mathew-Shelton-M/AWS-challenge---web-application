import { Router, Request, Response } from 'express';
import pool from '../db/pool';
import { UpdateSettingsSchema } from '../schemas/settings.schemas';

const router = Router();

const DEFAULT_SETTINGS = {
  nearExpiryWindowDays: 30,
  emailNotificationsEnabled: false,
  smsNotificationsEnabled: false,
};

// GET /settings — return settings for authenticated user; defaults if no row exists
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;

  const result = await pool.query(
    `SELECT near_expiry_window_days, email_notifications_enabled, sms_notifications_enabled
     FROM settings
     WHERE user_id = $1`,
    [userId]
  );

  if (result.rows.length === 0) {
    res.json(DEFAULT_SETTINGS);
    return;
  }

  const row = result.rows[0];
  res.json({
    nearExpiryWindowDays: row.near_expiry_window_days,
    emailNotificationsEnabled: row.email_notifications_enabled,
    smsNotificationsEnabled: row.sms_notifications_enabled,
  });
});

// PUT /settings — upsert settings for authenticated user
router.put('/', async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;

  const parsed = UpdateSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ errors: parsed.error.issues });
    return;
  }

  const { nearExpiryWindow, emailNotifications, smsNotifications } = parsed.data;

  // Validate near_expiry_window >= 1 (422 if invalid)
  if (nearExpiryWindow !== undefined && nearExpiryWindow < 1) {
    res.status(422).json({ error: 'near_expiry_window must be at least 1' });
    return;
  }

  // Fetch current settings (or defaults) to merge with
  const current = await pool.query(
    `SELECT near_expiry_window_days, email_notifications_enabled, sms_notifications_enabled
     FROM settings WHERE user_id = $1`,
    [userId]
  );

  const existing = current.rows.length > 0 ? current.rows[0] : null;

  const newNearExpiryWindow =
    nearExpiryWindow !== undefined
      ? nearExpiryWindow
      : existing?.near_expiry_window_days ?? DEFAULT_SETTINGS.nearExpiryWindowDays;

  const newEmailNotifications =
    emailNotifications !== undefined
      ? emailNotifications
      : existing?.email_notifications_enabled ?? DEFAULT_SETTINGS.emailNotificationsEnabled;

  const newSmsNotifications =
    smsNotifications !== undefined
      ? smsNotifications
      : existing?.sms_notifications_enabled ?? DEFAULT_SETTINGS.smsNotificationsEnabled;

  await pool.query(
    `INSERT INTO settings (user_id, near_expiry_window_days, email_notifications_enabled, sms_notifications_enabled)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE SET
       near_expiry_window_days = EXCLUDED.near_expiry_window_days,
       email_notifications_enabled = EXCLUDED.email_notifications_enabled,
       sms_notifications_enabled = EXCLUDED.sms_notifications_enabled`,
    [userId, newNearExpiryWindow, newEmailNotifications, newSmsNotifications]
  );

  res.json({
    nearExpiryWindowDays: newNearExpiryWindow,
    emailNotificationsEnabled: newEmailNotifications,
    smsNotificationsEnabled: newSmsNotifications,
  });
});

export default router;
