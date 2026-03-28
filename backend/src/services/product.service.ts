/**
 * Product service — pure derivation functions for stock and expiry status.
 *
 * Validates: Requirement 4 (stock level monitoring), Requirement 5 (expiry date management)
 */

/**
 * Derives the stock status of a product based on its current quantity and minimum threshold.
 *
 * - quantity === 0            → 'out_of_stock'
 * - 0 < quantity <= threshold → 'low_stock'
 * - quantity > threshold      → 'in_stock'
 */
export function deriveStockStatus(
  quantity: number,
  threshold: number
): 'out_of_stock' | 'low_stock' | 'in_stock' {
  if (quantity === 0) return 'out_of_stock';
  if (quantity <= threshold) return 'low_stock';
  return 'in_stock';
}

/**
 * Derives the expiry status of a product based on its expiry date and the near-expiry window.
 *
 * - null expiryDate                              → null  (no expiry tracking)
 * - expiryDate < today (start of day)            → 'expired'
 * - expiryDate within nearExpiryWindowDays days  → 'near_expiry'
 * - otherwise                                    → 'valid'
 */
export function deriveExpiryStatus(
  expiryDate: Date | null,
  nearExpiryWindowDays: number
): 'expired' | 'near_expiry' | 'valid' | null {
  if (expiryDate === null) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expiry = new Date(expiryDate);
  expiry.setHours(0, 0, 0, 0);

  if (expiry < today) return 'expired';

  const windowMs = nearExpiryWindowDays * 24 * 60 * 60 * 1000;
  if (expiry.getTime() - today.getTime() <= windowMs) return 'near_expiry';

  return 'valid';
}
