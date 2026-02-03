-- Create the rate_shoppers table for storing rate shopper configurations
-- Similar to ShipStation's Rate Shopper feature

CREATE TABLE IF NOT EXISTS rate_shoppers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  services JSONB NOT NULL DEFAULT '[]',
  transit_time_restriction TEXT,
  preference_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  preferred_service_code TEXT,
  preference_type TEXT,
  preference_value DOUBLE PRECISION,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_rate_shoppers_active ON rate_shoppers(active);
CREATE INDEX IF NOT EXISTS idx_rate_shoppers_is_default ON rate_shoppers(is_default);

-- Ensure only one rate shopper can be marked as default at a time
-- This is handled at the application level, but we add a partial unique index for safety
CREATE UNIQUE INDEX IF NOT EXISTS idx_rate_shoppers_single_default 
ON rate_shoppers(is_default) 
WHERE is_default = TRUE;
