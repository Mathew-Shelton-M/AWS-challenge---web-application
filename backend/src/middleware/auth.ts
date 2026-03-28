import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import pool from '../db/pool';
import { logAuthEvent } from '../services/auth.service';

// Extend Express Request to include authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: { id: string };
    }
  }
}

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const token = authHeader.slice(7);

  let userId: string;
  try {
    const payload = jwt.verify(token, env.jwtAccessSecret) as jwt.JwtPayload;
    userId = payload.sub as string;
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // Look up the user's active refresh token and check inactivity
  const result = await pool.query(
    `SELECT id, last_activity_at
     FROM refresh_tokens
     WHERE user_id = $1
       AND revoked_at IS NULL
       AND expires_at > NOW()
     ORDER BY last_activity_at DESC
     LIMIT 1`,
    [userId]
  );

  if (result.rows.length === 0) {
    // No active refresh token — treat as expired session
    const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
    await logAuthEvent(userId, 'session_expiry', ip);
    res.status(401).json({ error: 'Session expired' });
    return;
  }

  const row = result.rows[0] as { id: string; last_activity_at: Date };
  const lastActivity = new Date(row.last_activity_at).getTime();
  const now = Date.now();

  if (now - lastActivity > INACTIVITY_TIMEOUT_MS) {
    // Inactivity timeout exceeded — revoke token and log event
    const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
    await pool.query(
      `UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1`,
      [row.id]
    );
    await logAuthEvent(userId, 'session_expiry', ip);
    res.status(401).json({ error: 'Session expired' });
    return;
  }

  // Active — update last_activity_at and proceed
  await pool.query(
    `UPDATE refresh_tokens SET last_activity_at = NOW() WHERE id = $1`,
    [row.id]
  );

  req.user = { id: userId };
  next();
}
