/**
 * Notifications property-based tests
 *
 * Properties:
 *   P23 - Notification triggered with correct content
 *   P24 - Notification retry count does not exceed 3
 *
 * **Validates: Requirements 9.1, 9.2, 9.4**
 */

import * as fc from 'fast-check';
import { NotificationService, NotificationAdapter, Alert, NotificationSettings } from '../services/notification.service';
import { Pool } from 'pg';

fc.configureGlobal({ numRuns: 100 });

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Creates a mock DB pool that returns a user with email and phone */
function makeMockDb(email = 'user@example.com', phone = '+15550001234'): Pool {
  return {
    query: jest.fn().mockResolvedValue({ rows: [{ email, phone }] }),
  } as unknown as Pool;
}

/** Creates a mock NotificationAdapter that always succeeds */
function makeMockAdapter(): jest.Mocked<NotificationAdapter> {
  return { send: jest.fn().mockResolvedValue(undefined) };
}

/** Creates a mock NotificationAdapter that always rejects */
function makeFailingAdapter(): jest.Mocked<NotificationAdapter> {
  return { send: jest.fn().mockRejectedValue(new Error('delivery failed')) };
}

/** Helper: run notify and advance all fake timers to flush backoff delays */
async function runNotify(
  service: NotificationService,
  alert: Alert,
  settings: NotificationSettings,
  db: Pool
): Promise<void> {
  const promise = service.notify(alert, settings, db);
  await jest.runAllTimersAsync();
  await promise;
}

// ─── Arbitraries ──────────────────────────────────────────────────────────────

const alertTypeArb = fc.constantFrom(
  'low_stock' as const,
  'out_of_stock' as const,
  'near_expiry' as const,
  'expired' as const
);

const alertArb = fc.record({
  id: fc.uuid(),
  productId: fc.uuid(),
  productName: fc.string({ minLength: 1, maxLength: 50 }),
  alertType: alertTypeArb,
  generatedAt: fc.constant('2024-01-01T00:00:00.000Z'),
  acknowledgedAt: fc.constant(null),
});

/** Settings with at least one channel enabled */
const settingsWithChannelArb = fc.oneof(
  // email only
  fc.record({
    nearExpiryWindowDays: fc.integer({ min: 1, max: 90 }),
    emailNotificationsEnabled: fc.constant(true),
    smsNotificationsEnabled: fc.constant(false),
  }),
  // sms only
  fc.record({
    nearExpiryWindowDays: fc.integer({ min: 1, max: 90 }),
    emailNotificationsEnabled: fc.constant(false),
    smsNotificationsEnabled: fc.constant(true),
  }),
  // both enabled
  fc.record({
    nearExpiryWindowDays: fc.integer({ min: 1, max: 90 }),
    emailNotificationsEnabled: fc.constant(true),
    smsNotificationsEnabled: fc.constant(true),
  })
);

/** Human-readable label for each alert type (mirrors buildMessage in the service) */
const ALERT_TYPE_LABELS: Record<Alert['alertType'], string> = {
  low_stock: 'Low Stock',
  out_of_stock: 'Out of Stock',
  near_expiry: 'Near Expiry',
  expired: 'Expired',
};

// ---------------------------------------------------------------------------
// P23 — Notification triggered with correct content
// Feature: smart-shop-inventory-management, Property 23: Notification triggered with correct content
//
// For any alert generated when the corresponding notification channel is enabled,
// a notification should be sent containing the product name, alert type, and
// current stock level or expiry date.
// Validates: Requirements 9.1, 9.2
// ---------------------------------------------------------------------------
describe('P23 — Notification triggered with correct content', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it(
    'adapter is called and message contains productName and alertType label for any enabled channel',
    async () => {
      await fc.assert(
        fc.asyncProperty(alertArb, settingsWithChannelArb, async (alert, settings) => {
          const emailAdapter = makeMockAdapter();
          const smsAdapter = makeMockAdapter();
          const service = new NotificationService(emailAdapter, smsAdapter);
          const db = makeMockDb();

          jest.spyOn(console, 'error').mockImplementation(() => {});

          await runNotify(service, alert, settings, db);

          const label = ALERT_TYPE_LABELS[alert.alertType];

          if (settings.emailNotificationsEnabled) {
            // Email adapter must have been called
            if (emailAdapter.send.mock.calls.length === 0) return false;

            const [_to, subject, body] = emailAdapter.send.mock.calls[0];
            // Subject and body must contain productName and alertType label
            if (!subject.includes(alert.productName)) return false;
            if (!subject.includes(label)) return false;
            if (!body.includes(alert.productName)) return false;
            if (!body.includes(label)) return false;
          }

          if (settings.smsNotificationsEnabled) {
            // SMS adapter must have been called
            if (smsAdapter.send.mock.calls.length === 0) return false;

            const [_to, subject, body] = smsAdapter.send.mock.calls[0];
            if (!subject.includes(alert.productName)) return false;
            if (!subject.includes(label)) return false;
            if (!body.includes(alert.productName)) return false;
            if (!body.includes(label)) return false;
          }

          return true;
        })
      );
    },
    30_000
  );
});

// ---------------------------------------------------------------------------
// P24 — Notification retry count does not exceed 3
// Feature: smart-shop-inventory-management, Property 24: Notification retry count does not exceed 3
//
// For any notification delivery that fails on every attempt, the system should
// attempt delivery at most 3 times before logging the failure and stopping.
// Validates: Requirements 9.4
// ---------------------------------------------------------------------------
describe('P24 — Notification retry count does not exceed 3', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it(
    'adapter.send is called exactly 3 times when every attempt fails',
    async () => {
      const settingsEmailOnly: NotificationSettings = {
        nearExpiryWindowDays: 30,
        emailNotificationsEnabled: true,
        smsNotificationsEnabled: false,
      };

      await fc.assert(
        fc.asyncProperty(alertArb, async (alert) => {
          const emailAdapter = makeFailingAdapter();
          const service = new NotificationService(emailAdapter, makeMockAdapter());
          const db = makeMockDb();

          jest.spyOn(console, 'error').mockImplementation(() => {});

          await runNotify(service, alert, settingsEmailOnly, db);

          // Must attempt exactly 3 times — no more, no less
          return emailAdapter.send.mock.calls.length === 3;
        })
      );
    },
    30_000
  );
});
