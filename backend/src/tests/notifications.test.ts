/**
 * NotificationService unit tests
 * Validates: Requirements 9.1, 9.2, 9.4
 */

import { NotificationService, NotificationAdapter, Alert, NotificationSettings } from '../services/notification.service';
import { Pool } from 'pg';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ALERT: Alert = {
  id: 'alert-001',
  productId: 'prod-001',
  productName: 'Milk',
  alertType: 'low_stock',
  generatedAt: '2024-01-01T00:00:00.000Z',
  acknowledgedAt: null,
};

const SETTINGS_EMAIL_ONLY: NotificationSettings = {
  nearExpiryWindowDays: 30,
  emailNotificationsEnabled: true,
  smsNotificationsEnabled: false,
};

const SETTINGS_SMS_ONLY: NotificationSettings = {
  nearExpiryWindowDays: 30,
  emailNotificationsEnabled: false,
  smsNotificationsEnabled: true,
};

const SETTINGS_BOTH_DISABLED: NotificationSettings = {
  nearExpiryWindowDays: 30,
  emailNotificationsEnabled: false,
  smsNotificationsEnabled: false,
};

const SETTINGS_BOTH_ENABLED: NotificationSettings = {
  nearExpiryWindowDays: 30,
  emailNotificationsEnabled: true,
  smsNotificationsEnabled: true,
};

/** Creates a mock DB pool that returns a user with email and phone */
function makeMockDb(email = 'user@example.com', phone = '+15550001234'): Pool {
  return {
    query: jest.fn().mockResolvedValue({ rows: [{ email, phone }] }),
  } as unknown as Pool;
}

/** Creates a mock NotificationAdapter */
function makeMockAdapter(): jest.Mocked<NotificationAdapter> {
  return { send: jest.fn().mockResolvedValue(undefined) };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('NotificationService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  // Helper: run notify and advance all timers to flush backoff delays.
  // jest.runAllTimersAsync() advances fake timers while also flushing async
  // microtasks, which is required for the promise-based sleep() inside the
  // retry loop to resolve correctly.
  async function runNotify(
    service: NotificationService,
    alert: Alert,
    settings: NotificationSettings,
    db: Pool
  ): Promise<void> {
    const promise = service.notify(alert, settings, db);
    // Advance timers to skip exponential backoff delays (1s, 2s, 4s)
    await jest.runAllTimersAsync();
    await promise;
  }

  // ── Channel triggering ──────────────────────────────────────────────────────

  it('sends email notification when emailNotificationsEnabled is true', async () => {
    const emailAdapter = makeMockAdapter();
    const smsAdapter = makeMockAdapter();
    const service = new NotificationService(emailAdapter, smsAdapter);
    const db = makeMockDb();

    await runNotify(service, ALERT, SETTINGS_EMAIL_ONLY, db);

    expect(emailAdapter.send).toHaveBeenCalledTimes(1);
    expect(smsAdapter.send).not.toHaveBeenCalled();
  });

  it('sends SMS notification when smsNotificationsEnabled is true', async () => {
    const emailAdapter = makeMockAdapter();
    const smsAdapter = makeMockAdapter();
    const service = new NotificationService(emailAdapter, smsAdapter);
    const db = makeMockDb();

    await runNotify(service, ALERT, SETTINGS_SMS_ONLY, db);

    expect(smsAdapter.send).toHaveBeenCalledTimes(1);
    expect(emailAdapter.send).not.toHaveBeenCalled();
  });

  it('does NOT send any notification when both channels are disabled', async () => {
    const emailAdapter = makeMockAdapter();
    const smsAdapter = makeMockAdapter();
    const service = new NotificationService(emailAdapter, smsAdapter);
    const db = makeMockDb();

    await runNotify(service, ALERT, SETTINGS_BOTH_DISABLED, db);

    expect(emailAdapter.send).not.toHaveBeenCalled();
    expect(smsAdapter.send).not.toHaveBeenCalled();
  });

  // ── Message content ─────────────────────────────────────────────────────────

  it('email notification message contains product name and alert type', async () => {
    const emailAdapter = makeMockAdapter();
    const service = new NotificationService(emailAdapter, makeMockAdapter());
    const db = makeMockDb();

    await runNotify(service, ALERT, SETTINGS_EMAIL_ONLY, db);

    const [_to, subject, body] = emailAdapter.send.mock.calls[0];
    expect(subject).toContain(ALERT.productName);
    expect(subject).toContain('Low Stock');
    expect(body).toContain(ALERT.productName);
    expect(body).toContain('Low Stock');
  });

  it('SMS notification message contains product name and alert type', async () => {
    const smsAdapter = makeMockAdapter();
    const service = new NotificationService(makeMockAdapter(), smsAdapter);
    const db = makeMockDb();

    await runNotify(service, ALERT, SETTINGS_SMS_ONLY, db);

    const [_to, subject, body] = smsAdapter.send.mock.calls[0];
    expect(subject).toContain(ALERT.productName);
    expect(subject).toContain('Low Stock');
    expect(body).toContain(ALERT.productName);
    expect(body).toContain('Low Stock');
  });

  // ── Retry on failure ────────────────────────────────────────────────────────

  it('retries up to 3 times when adapter always fails', async () => {
    const emailAdapter: jest.Mocked<NotificationAdapter> = {
      send: jest.fn().mockRejectedValue(new Error('SMTP error')),
    };
    const service = new NotificationService(emailAdapter, makeMockAdapter());
    const db = makeMockDb();

    jest.spyOn(console, 'error').mockImplementation(() => {});

    await runNotify(service, ALERT, SETTINGS_EMAIL_ONLY, db);

    expect(emailAdapter.send).toHaveBeenCalledTimes(3);
  });

  it('logs console.error after 3 failed attempts', async () => {
    const emailAdapter: jest.Mocked<NotificationAdapter> = {
      send: jest.fn().mockRejectedValue(new Error('SMTP error')),
    };
    const service = new NotificationService(emailAdapter, makeMockAdapter());
    const db = makeMockDb();

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await runNotify(service, ALERT, SETTINGS_EMAIL_ONLY, db);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain('Failed to send email notification after 3 attempts');
  });

  it('does NOT throw after 3 failed attempts (fire-and-forget safety)', async () => {
    const emailAdapter: jest.Mocked<NotificationAdapter> = {
      send: jest.fn().mockRejectedValue(new Error('SMTP error')),
    };
    const service = new NotificationService(emailAdapter, makeMockAdapter());
    const db = makeMockDb();

    jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(runNotify(service, ALERT, SETTINGS_EMAIL_ONLY, db)).resolves.toBeUndefined();
  });

  it('calls adapter exactly once when first attempt succeeds (no retry)', async () => {
    const emailAdapter = makeMockAdapter();
    const service = new NotificationService(emailAdapter, makeMockAdapter());
    const db = makeMockDb();

    await runNotify(service, ALERT, SETTINGS_EMAIL_ONLY, db);

    expect(emailAdapter.send).toHaveBeenCalledTimes(1);
  });
});
