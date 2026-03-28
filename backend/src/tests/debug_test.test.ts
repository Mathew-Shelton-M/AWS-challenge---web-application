// Temporary debug test to understand what's happening
import * as fc from 'fast-check';
import request from 'supertest';
import express from 'express';

jest.mock('../db/pool', () => {
  const mockQuery = jest.fn();
  return {
    __esModule: true,
    default: {
      query: mockQuery,
      end: jest.fn().mockResolvedValue(undefined),
    },
  };
});

jest.mock('../middleware/auth', () => ({
  authenticate: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import pool from '../db/pool
const mockQuery = pool.query as jest.Mock;

function buildReportsApp() {
  const app = express();
  app.use(express.json());
  const reportsRoutes = require('../routes/reports').default;
  app.use('/reports', reportsRoutes);
  return app;
}

describe('Debug P28', () => {
  it('debug single case', async () => {
    const app = buildReportsApp();
    mockQuery.mockReset();
    
    const rows = [{ productId: '00000000-0000-1000-8000-000000000000', productName: '#', totalAdded: 0, totalRemoved: 0, netChange: 0 }];
    mockQuery.mockResolvedValueOnce({ rows });
    
    const res = await request(app).get('/reports/stock-usage/csv?startDate=2024-01-01&endDate=2024-01-31');
    
    console.log('Status:', res.status);
    console.log('Content-Type:', res.headers['content-type']);
    console.log('res.text repr:', JSON.stringify(res.text));
    console.log('res.text length:', res.text?.length);
    
    expect(res.status).toBe(200);
  });
});
