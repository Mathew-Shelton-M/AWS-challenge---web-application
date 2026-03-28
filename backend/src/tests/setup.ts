import pool from '../db/pool';

afterAll(async () => {
  await pool.end();
});
