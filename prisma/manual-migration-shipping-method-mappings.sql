-- ============================================================================
-- Shipping Method Mappings table
-- Maps incoming requestedShippingService values to ShipEngine carrier/services
-- Run this manually in Supabase SQL Editor
-- ============================================================================

-- Create the shipping_method_mappings table
CREATE TABLE IF NOT EXISTS shipping_method_mappings (
  id TEXT PRIMARY KEY,
  incoming_name TEXT NOT NULL UNIQUE,
  carrier_id TEXT NOT NULL,
  carrier_code TEXT NOT NULL,
  service_code TEXT NOT NULL,
  service_name TEXT NOT NULL,
  is_expedited BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for active lookups
CREATE INDEX IF NOT EXISTS idx_shipping_method_mappings_is_active
  ON shipping_method_mappings (is_active);

-- Unique index on incoming_name (already enforced by UNIQUE constraint, but explicit for clarity)
-- The UNIQUE constraint above handles this.

-- ============================================================================
-- DONE. The table is now ready for use.
-- Mappings are managed via Settings > Shipping Rules > Shipping Method Mappings
-- ============================================================================
