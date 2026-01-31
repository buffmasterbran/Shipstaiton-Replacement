-- ============================================================================
-- Box Config Tables for Supabase
-- Run this in the Supabase SQL Editor to create proper relational tables
-- ============================================================================

-- 1. BOXES TABLE
-- Stores box configurations with dimensions and priority
CREATE TABLE IF NOT EXISTS boxes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  length_inches DECIMAL(6,2) NOT NULL,  -- internal dimensions
  width_inches DECIMAL(6,2) NOT NULL,
  height_inches DECIMAL(6,2) NOT NULL,
  volume_cubic_inches DECIMAL(10,2) GENERATED ALWAYS AS (length_inches * width_inches * height_inches) STORED,
  priority INTEGER NOT NULL DEFAULT 1,  -- lower = try first (prefer smaller)
  active BOOLEAN NOT NULL DEFAULT true,
  in_stock BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. PRODUCT_SIZES TABLE
-- Physical product sizes used for volume calculations
CREATE TABLE IF NOT EXISTS product_sizes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  length_inches DECIMAL(6,2) NOT NULL,
  width_inches DECIMAL(6,2) NOT NULL,
  height_inches DECIMAL(6,2) NOT NULL,
  volume_cubic_inches DECIMAL(10,2) GENERATED ALWAYS AS (length_inches * width_inches * height_inches) STORED,
  weight_lbs DECIMAL(6,2) NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'other' CHECK (category IN ('tumbler', 'bottle', 'accessory', 'other')),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. PRODUCT_SKU_PATTERNS TABLE
-- Regex patterns to match SKUs to product sizes (fallback matching)
CREATE TABLE IF NOT EXISTS product_sku_patterns (
  id SERIAL PRIMARY KEY,
  product_size_id TEXT NOT NULL REFERENCES product_sizes(id) ON DELETE CASCADE,
  pattern TEXT NOT NULL,  -- Regex pattern like '^DPT16', '^PT16'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. PRODUCT_SKUS TABLE
-- Specific SKU -> product size mappings (takes priority over patterns)
CREATE TABLE IF NOT EXISTS product_skus (
  sku TEXT PRIMARY KEY,
  product_size_id TEXT NOT NULL REFERENCES product_sizes(id) ON DELETE CASCADE,
  name TEXT,  -- Optional display name
  barcode TEXT,  -- UPC/EAN
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. BOX_FEEDBACK_RULES TABLE
-- Learned rules from human feedback (confirming/rejecting box fits)
CREATE TABLE IF NOT EXISTS box_feedback_rules (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  combo_signature TEXT NOT NULL,  -- Normalized: "tumbler-16oz:1|tumbler-26oz:2"
  box_id TEXT NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  fits BOOLEAN NOT NULL,  -- true = fits, false = doesn't fit
  correct_box_id TEXT REFERENCES boxes(id) ON DELETE SET NULL,  -- If doesn't fit, which box works?
  tested_at TIMESTAMPTZ DEFAULT NOW(),
  tested_by TEXT,  -- Optional: user who tested
  UNIQUE(combo_signature, box_id)  -- One rule per combo+box
);

-- ============================================================================
-- INDEXES for performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_boxes_active ON boxes(active);
CREATE INDEX IF NOT EXISTS idx_boxes_priority ON boxes(priority);
CREATE INDEX IF NOT EXISTS idx_product_sizes_active ON product_sizes(active);
CREATE INDEX IF NOT EXISTS idx_product_sizes_category ON product_sizes(category);
CREATE INDEX IF NOT EXISTS idx_product_sku_patterns_size ON product_sku_patterns(product_size_id);
CREATE INDEX IF NOT EXISTS idx_product_skus_size ON product_skus(product_size_id);
CREATE INDEX IF NOT EXISTS idx_box_feedback_combo ON box_feedback_rules(combo_signature);
CREATE INDEX IF NOT EXISTS idx_box_feedback_box ON box_feedback_rules(box_id);

-- ============================================================================
-- SEED DATA - Default boxes
-- ============================================================================

INSERT INTO boxes (id, name, length_inches, width_inches, height_inches, priority, active, in_stock)
VALUES 
  ('single-box', 'Single Box', 5, 5, 9, 1, true, true),
  ('2-4-box', '2/4 Box', 8, 8, 9, 2, true, true),
  ('4-5-box', '4/5 Box', 10, 10, 10, 3, true, true),
  ('6-10-box', '6/10 Box', 12, 12, 12, 4, true, true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  length_inches = EXCLUDED.length_inches,
  width_inches = EXCLUDED.width_inches,
  height_inches = EXCLUDED.height_inches,
  priority = EXCLUDED.priority;

-- ============================================================================
-- SEED DATA - Default product sizes
-- ============================================================================

INSERT INTO product_sizes (id, name, length_inches, width_inches, height_inches, weight_lbs, category, active)
VALUES 
  ('tumbler-10oz', '10oz Tumbler', 3, 3, 5, 0.4, 'tumbler', true),
  ('tumbler-16oz', '16oz Tumbler', 3.5, 3.5, 6, 0.6, 'tumbler', true),
  ('tumbler-26oz', '26oz Tumbler', 4, 4, 8, 0.9, 'tumbler', true),
  ('tumbler-32oz', '32oz Tumbler', 4.5, 4.5, 9, 1.1, 'tumbler', true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  length_inches = EXCLUDED.length_inches,
  width_inches = EXCLUDED.width_inches,
  height_inches = EXCLUDED.height_inches,
  weight_lbs = EXCLUDED.weight_lbs,
  category = EXCLUDED.category;

-- ============================================================================
-- SEED DATA - Default SKU patterns (for backward compatibility)
-- ============================================================================

INSERT INTO product_sku_patterns (product_size_id, pattern)
VALUES 
  ('tumbler-10oz', '^DPT10'),
  ('tumbler-10oz', '^PT10'),
  ('tumbler-16oz', '^DPT16'),
  ('tumbler-16oz', '^PT16'),
  ('tumbler-26oz', '^DPT26'),
  ('tumbler-26oz', '^PT26'),
  ('tumbler-32oz', '^DPT32'),
  ('tumbler-32oz', '^PT32')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- HELPER FUNCTION: Calculate packing efficiency
-- ============================================================================

CREATE OR REPLACE FUNCTION get_packing_efficiency()
RETURNS DECIMAL AS $$
BEGIN
  -- Default 70% packing efficiency
  -- Could be stored in app_settings if you want it configurable
  RETURN 0.70;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- HELPER VIEW: Boxes with usable volume
-- ============================================================================

CREATE OR REPLACE VIEW boxes_with_usable_volume AS
SELECT 
  b.*,
  ROUND(b.volume_cubic_inches * get_packing_efficiency(), 2) AS usable_volume_cubic_inches
FROM boxes b
WHERE b.active = true
ORDER BY b.priority;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Check boxes:
-- SELECT * FROM boxes ORDER BY priority;

-- Check product sizes:
-- SELECT * FROM product_sizes ORDER BY name;

-- Check SKU patterns:
-- SELECT ps.name, pp.pattern 
-- FROM product_sku_patterns pp 
-- JOIN product_sizes ps ON pp.product_size_id = ps.id;

-- Check feedback rules:
-- SELECT * FROM box_feedback_rules ORDER BY tested_at DESC;
  