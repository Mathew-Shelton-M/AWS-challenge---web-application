import dotenv from 'dotenv';

dotenv.config();

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optionalEnv(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

export const env = {
  // Server
  port: parseInt(optionalEnv('PORT', '3001'), 10),
  nodeEnv: optionalEnv('NODE_ENV', 'development'),

  // Database
  databaseUrl: requireEnv('DATABASE_URL'),
  testDatabaseUrl: optionalEnv('TEST_DATABASE_URL', ''),

  // JWT
  jwtAccessSecret: requireEnv('JWT_ACCESS_SECRET'),
  jwtRefreshSecret: requireEnv('JWT_REFRESH_SECRET'),

  // SMTP
  smtpHost: optionalEnv('SMTP_HOST', ''),
  smtpPort: parseInt(optionalEnv('SMTP_PORT', '587'), 10),
  smtpUser: optionalEnv('SMTP_USER', ''),
  smtpPass: optionalEnv('SMTP_PASS', ''),

  // Twilio
  twilioAccountSid: optionalEnv('TWILIO_ACCOUNT_SID', ''),
  twilioAuthToken: optionalEnv('TWILIO_AUTH_TOKEN', ''),
  twilioFromNumber: optionalEnv('TWILIO_FROM_NUMBER', ''),

  // Notification recipients
  notificationEmail: optionalEnv('NOTIFICATION_EMAIL', ''),
  notificationPhone: optionalEnv('NOTIFICATION_PHONE', ''),
} as const;

export type Env = typeof env;
