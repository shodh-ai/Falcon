-- Store Expo push notification tokens for mobile clients.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS expo_push_token VARCHAR(255) NULL;

CREATE INDEX IF NOT EXISTS idx_users_expo_push_token
  ON users (expo_push_token)
  WHERE expo_push_token IS NOT NULL;
