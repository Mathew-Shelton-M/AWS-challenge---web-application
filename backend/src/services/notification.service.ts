/**
 * Notification service with Email (Nodemailer) and SMS (Twilio) adapters.
 *
 * Retry logic: up to 3 attempts with exponential backoff (1s, 2s, 4s).
 * Failures are logged to console.error and do NOT propagate to callers.
 *
 * NOTE: nodemailer and twilio must be installed for the respective adapters to work:
 *   npm install nodemailer twilio
 *   npm install --save-dev @types/nodemailer
 */

import { Pool } from 'pg';
import { env } from '../config/env';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NotificationAdapter {
  send(to: string, subject: string, body: string): Promise<void>;
}

export interface Alert {
  id: string;
  productId: string;
  productName: string;
  alertType: 'low_stock' | 'out_of_stock' | 'near_expiry' | 'expired';
  generatedAt: string;
  acknowledgedAt: string | null;
}

export interface NotificationSettings {
  nearExpiryWindowDays: number;
  emailNotificationsEnabled: boolean;
  smsNotificationsEnabled: boolean;
}

// ─── Email Adapter (Nodemailer) ───────────────────────────────────────────────

export class EmailAdapter implements NotificationAdapter {
  async send(to: string, subject: string, body: string): Promise<void> {
    // Dynamic require so the module is optional at compile time
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodemailer = require('nodemailer') as {
      createTransport(opts: unknown): {
        sendMail(opts: unknown): Promise<unknown>;
      };
    };

    const transporter = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpPort === 465,
      auth: {
        user: env.smtpUser,
        pass: env.smtpPass,
      },
    });

    await transporter.sendMail({
      from: env.smtpUser,
      to,
      subject,
      text: body,
    });
  }
}

// ─── SMS Adapter (Twilio) ─────────────────────────────────────────────────────

export class SmsAdapter implements NotificationAdapter {
  async send(to: string, _subject: string, body: string): Promise<void> {
    // Dynamic require so the module is optional at compile time
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const twilio = require('twilio') as (
      sid: string,
      token: string
    ) => { messages: { create(opts: unknown): Promise<unknown> } };

    const client = twilio(env.twilioAccountSid, env.twilioAuthToken);

    await client.messages.create({
      from: env.twilioFromNumber,
      to,
      body,
    });
  }
}

// ─── Retry helper ─────────────────────────────────────────────────────────────

const BACKOFF_DELAYS_MS = [1000, 2000, 4000];
const MAX_ATTEMPTS = 3;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Attempts to call `fn` up to MAX_ATTEMPTS times with exponential backoff.
 * Returns true on success, false after all attempts are exhausted.
 */
export async function withRetry(fn: () => Promise<void>): Promise<boolean> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      await fn();
      return true;
    } catch (err) {
      if (attempt < MAX_ATTEMPTS - 1) {
        await sleep(BACKOFF_DELAYS_MS[attempt]);
      } else {
        // Last attempt failed — caller handles logging
        throw err;
      }
    }
  }
  return false;
}

// ─── Notification message builder ─────────────────────────────────────────────

function buildMessage(alert: Alert): { subject: string; body: string } {
  const typeLabel: Record<Alert['alertType'], string> = {
    low_stock: 'Low Stock',
    out_of_stock: 'Out of Stock',
    near_expiry: 'Near Expiry',
    expired: 'Expired',
  };

  const label = typeLabel[alert.alertType];
  const subject = `[SSIMS Alert] ${label}: ${alert.productName}`;
  const body =
    `Alert Type: ${label}\n` +
    `Product: ${alert.productName}\n` +
    `Generated At: ${alert.generatedAt}\n` +
    `Please review your inventory.`;

  return { subject, body };
}

// ─── Notification Service ─────────────────────────────────────────────────────

export class NotificationService {
  private emailAdapter: NotificationAdapter;
  private smsAdapter: NotificationAdapter;

  constructor(
    emailAdapter: NotificationAdapter = new EmailAdapter(),
    smsAdapter: NotificationAdapter = new SmsAdapter()
  ) {
    this.emailAdapter = emailAdapter;
    this.smsAdapter = smsAdapter;
  }

  /**
   * Sends notifications for the given alert based on enabled channels in settings.
   * Looks up the user's email/phone from the users table.
   * Retries up to 3 times with exponential backoff (1s, 2s, 4s).
   * Failures are logged and do NOT throw.
   */
  async notify(alert: Alert, settings: NotificationSettings, db: Pool): Promise<void> {
    const { emailNotificationsEnabled, smsNotificationsEnabled } = settings;

    if (!emailNotificationsEnabled && !smsNotificationsEnabled) return;

    // Fetch user contact info (single user system — take first user)
    const userResult = await db.query('SELECT email, phone FROM users LIMIT 1');
    const user = userResult.rows[0] as { email: string | null; phone: string | null } | undefined;

    const { subject, body } = buildMessage(alert);

    if (emailNotificationsEnabled && user?.email) {
      await this._sendWithRetry(this.emailAdapter, user.email, subject, body, alert, 'email');
    }

    if (smsNotificationsEnabled && user?.phone) {
      await this._sendWithRetry(this.smsAdapter, user.phone, subject, body, alert, 'sms');
    }
  }

  private async _sendWithRetry(
    adapter: NotificationAdapter,
    to: string,
    subject: string,
    body: string,
    alert: Alert,
    channel: 'email' | 'sms'
  ): Promise<void> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        await adapter.send(to, subject, body);
        return; // success
      } catch (err) {
        lastError = err;
        if (attempt < MAX_ATTEMPTS) {
          await sleep(BACKOFF_DELAYS_MS[attempt - 1]);
        }
      }
    }

    // All 3 attempts failed — log and continue
    console.error(
      `[NotificationService] Failed to send ${channel} notification after ${MAX_ATTEMPTS} attempts.`,
      {
        alertId: alert.id,
        productName: alert.productName,
        alertType: alert.alertType,
        channel,
        to,
        error: lastError instanceof Error ? lastError.message : String(lastError),
      }
    );
  }
}

export const notificationService = new NotificationService();
