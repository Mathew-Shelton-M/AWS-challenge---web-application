import app from '../index';
import pool from '../db/pool';

/**
 * Returns the Express app instance for use with supertest.
 */
export function createTestApp() {
  return app;
}

/**
 * Truncates all application tables in the test database.
 * Call this in beforeEach/afterEach to ensure a clean state.
 */
export async function clearDatabase(): Promise<void> {
  await pool.query(`
    TRUNCATE TABLE
      alerts,
      stock_movements,
      products,
      categories,
      settings,
      refresh_tokens,
      auth_events,
      users
    RESTART IDENTITY CASCADE
  `);
}
