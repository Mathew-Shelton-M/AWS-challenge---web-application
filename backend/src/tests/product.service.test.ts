/**
 * Unit tests for deriveStockStatus and deriveExpiryStatus pure functions.
 *
 * Validates: Requirement 4 (stock level monitoring), Requirement 5 (expiry date management)
 */

import { deriveStockStatus, deriveExpiryStatus } from '../services/product.service';

// ---------------------------------------------------------------------------
// deriveStockStatus
// ---------------------------------------------------------------------------
describe('deriveStockStatus', () => {
  it('returns out_of_stock when quantity is 0', () => {
    expect(deriveStockStatus(0, 10)).toBe('out_of_stock');
  });

  it('returns low_stock when quantity equals threshold', () => {
    expect(deriveStockStatus(5, 5)).toBe('low_stock');
  });

  it('returns low_stock when quantity is below threshold', () => {
    expect(deriveStockStatus(3, 10)).toBe('low_stock');
  });

  it('returns in_stock when quantity is above threshold', () => {
    expect(deriveStockStatus(11, 10)).toBe('in_stock');
  });

  it('returns in_stock when quantity is 1 above threshold', () => {
    expect(deriveStockStatus(6, 5)).toBe('in_stock');
  });
});

// ---------------------------------------------------------------------------
// deriveExpiryStatus
// ---------------------------------------------------------------------------
describe('deriveExpiryStatus', () => {
  it('returns null when expiryDate is null', () => {
    expect(deriveExpiryStatus(null, 30)).toBeNull();
  });

  it('returns expired for a date in the past', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(deriveExpiryStatus(yesterday, 30)).toBe('expired');
  });

  it('returns near_expiry for today (within window)', () => {
    const today = new Date();
    expect(deriveExpiryStatus(today, 30)).toBe('near_expiry');
  });

  it('returns near_expiry for a date exactly at the window boundary', () => {
    const boundary = new Date();
    boundary.setDate(boundary.getDate() + 30);
    expect(deriveExpiryStatus(boundary, 30)).toBe('near_expiry');
  });

  it('returns valid for a date beyond the window', () => {
    const future = new Date();
    future.setDate(future.getDate() + 31);
    expect(deriveExpiryStatus(future, 30)).toBe('valid');
  });

  it('returns expired for a date far in the past', () => {
    const old = new Date('2000-01-01');
    expect(deriveExpiryStatus(old, 30)).toBe('expired');
  });
});
