import { Request, Response, NextFunction } from 'express';

/**
 * Sanitizes a string by escaping HTML special characters and neutralizing
 * common SQL injection patterns.
 */
export function sanitizeString(value: string): string {
  // Escape HTML entities — & must come first to avoid double-encoding
  let result = value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');

  // Neutralize SQL injection patterns
  result = result
    .replace(/--/g, '')
    .replace(/\/\*/g, '')
    .replace(/\*\//g, '')
    .replace(/xp_/gi, '');

  return result;
}

/**
 * Recursively walks an object/array and sanitizes all string values.
 */
function sanitizeValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return sanitizeString(value);
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (value !== null && typeof value === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      sanitized[k] = sanitizeValue(v);
    }
    return sanitized;
  }
  return value;
}

/**
 * Express middleware that sanitizes all string values in req.body before
 * they reach route handlers or Zod validation.
 */
export function sanitizeBody(req: Request, _res: Response, next: NextFunction): void {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeValue(req.body);
  }
  next();
}
