CREATE TABLE IF NOT EXISTS settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  near_expiry_window INTEGER NOT NULL DEFAULT 30,
  email_notifications BOOLEAN NOT NULL DEFAULT FALSE,
  sms_notifications BOOLEAN NOT NULL DEFAULT FALSE,
  email_address VARCHAR(255),
  phone_number VARCHAR(50)
);
