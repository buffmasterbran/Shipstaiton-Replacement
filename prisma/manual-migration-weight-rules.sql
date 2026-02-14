-- ============================================================================
-- Weight Rules table
-- Weight-based carrier routing with segmented ranges (0 oz to 2400 oz / 150 lbs)
-- Run this manually in Supabase SQL Editor
-- ============================================================================

-- Create the weight_rules table
CREATE TABLE IF NOT EXISTS weight_rules (
  id TEXT PRIMARY KEY,
  min_oz DOUBLE PRECISION NOT NULL,
  max_oz DOUBLE PRECISION NOT NULL,
  target_type TEXT NOT NULL,           -- "service" or "rate_shopper"
  carrier_id TEXT,
  carrier_code TEXT,
  service_code TEXT,
  service_name TEXT,
  rate_shopper_id TEXT REFERENCES rate_shoppers(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_weight_rules_is_active ON weight_rules (is_active);
CREATE INDEX IF NOT EXISTS idx_weight_rules_sort_order ON weight_rules (sort_order);

-- ============================================================================
-- DONE. Weight rules are managed via Settings > Shipping Rules > Weight Rules
-- ============================================================================
