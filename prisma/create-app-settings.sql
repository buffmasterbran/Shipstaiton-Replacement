-- Run in Supabase → SQL Editor
-- Creates app_settings table for order highlight rules and other settings (matches Prisma AppSetting model).

CREATE TABLE IF NOT EXISTS app_settings (
  id         TEXT PRIMARY KEY,
  key        TEXT NOT NULL UNIQUE,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Optional: insert default order highlight so it’s saved from first load (otherwise app uses in-memory defaults until you save in Settings)
-- INSERT INTO app_settings (id, key, value, updated_at)
-- VALUES (
--   'order_highlight_row',
--   'order_highlight',
--   '{"orangeMinDays": 3, "orangeMaxDays": 6, "redMinDays": 6, "onlyWhenMemoEmpty": true}'::jsonb,
--   NOW()
-- )
-- ON CONFLICT (key) DO NOTHING;
