import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { validate } from '../middleware/validate';
import { LoginSchema, RefreshSchema } from '../schemas/auth.schemas';
import pool from '../db/pool';
import { env } from '../config/env';
import {
  comparePassword,
  generateAccessToken,
  generateRefreshToken,
  logAuthEvent,
} from '../services/auth.service';

const router = Router();

const loginRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later.' },
  skip: () => process.env.NODE_ENV === 'test',
});

router.post('/login', loginRateLimiter, validate(LoginSchema), async (req: Request, res: Response): Promise<void> => {
  const { username, password } = req.body as { username: string; password: string };
  const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';

  const result = await pool.query(
    'SELECT id, password_hash FROM users WHERE username = $1',
    [username]
  );

  const user = result.rows[0];

  if (!user || !(await comparePassword(password, user.password_hash))) {
    await logAuthEvent(user?.id ?? null, 'login_failure', ip);
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const accessToken = generateAccessToken(user.id);
  const refreshToken = generateRefreshToken(user.id);

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await pool.query(
    'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
    [user.id, refreshToken, expiresAt]
  );

  await logAuthEvent(user.id, 'login_success', ip);

  res.json({ accessToken, refreshToken });
});

router.post('/refresh', validate(RefreshSchema), async (req: Request, res: Response): Promise<void> => {
  const { refreshToken } = req.body as { refreshToken: string };

  // Verify JWT signature and expiry
  try {
    jwt.verify(refreshToken, env.jwtRefreshSecret);
  } catch {
    res.status(401).json({ error: 'Invalid or expired refresh token' });
    return;
  }

  // Check token exists in DB, is not revoked, and not expired
  const result = await pool.query(
    `SELECT id, user_id FROM refresh_tokens
     WHERE token = $1
       AND revoked_at IS NULL
       AND expires_at > NOW()`,
    [refreshToken]
  );

  if (result.rows.length === 0) {
    res.status(401).json({ error: 'Invalid or expired refresh token' });
    return;
  }

  const userId = result.rows[0].user_id as string;
  const accessToken = generateAccessToken(userId);

  res.json({ accessToken });
});

router.post('/logout', validate(RefreshSchema), async (req: Request, res: Response): Promise<void> => {
  const { refreshToken } = req.body as { refreshToken: string };

  await pool.query(
    `UPDATE refresh_tokens SET revoked_at = NOW() WHERE token = $1 AND revoked_at IS NULL`,
    [refreshToken]
  );

  res.status(204).send();
});

export default router;
