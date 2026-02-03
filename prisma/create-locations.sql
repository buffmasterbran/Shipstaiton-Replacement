-- Create the locations table for storing ship-from warehouse locations
-- Used for shipping label generation

CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  company TEXT,
  address_line1 TEXT NOT NULL,
  address_line2 TEXT,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  postal_code TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'US',
  phone TEXT NOT NULL,
  email TEXT,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_locations_active ON locations(active);
CREATE INDEX IF NOT EXISTS idx_locations_is_default ON locations(is_default);

-- Ensure only one location can be marked as default at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_locations_single_default 
ON locations(is_default) 
WHERE is_default = TRUE;

-- Insert a default location (Pirani Life warehouse)
INSERT INTO locations (id, name, company, address_line1, city, state, postal_code, country, phone, is_default, active)
VALUES (
  'loc_pirani_main',
  'Pirani Life - Main Warehouse',
  'Pirani Life',
  '7901 E 88th St',
  'Kansas City',
  'MO',
  '64138',
  'US',
  '555-555-5555',
  TRUE,
  TRUE
)
ON CONFLICT (id) DO NOTHING;
