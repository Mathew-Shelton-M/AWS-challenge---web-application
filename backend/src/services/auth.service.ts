import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import pool from '../db/pool';

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateAccessToken(userId: string): string {
  return jwt.sign(
    { sub: userId, type: 'access' },
    env.jwtAccessSecret,
    { expiresIn: '15m' }
  );
}

export function generateRefreshToken(userId: string): string {
  return jwt.sign(
    { sub: userId, type: 'refresh' },
    env.jwtRefreshSecret,
    { expiresIn: '7d' }
  );
}

export async function logAuthEvent(
  userId: string | null,
  eventType: 'login_success' | 'login_failure' | 'session_expiry',
  ipAddress: string
): Promise<void> {
  await pool.query(
    `INSERT INTO auth_events (user_id, event_type, ip_address) VALUES ($1, $2, $3)`,
    [userId, eventType, ipAddress]
  );
}
