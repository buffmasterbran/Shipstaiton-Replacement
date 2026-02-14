-- Migration: Add targetType and rateShopperId to shipping_method_mappings
-- Run this in Supabase SQL Editor AFTER the initial shipping_method_mappings migration

-- Add target_type column (defaults to 'service' for backward compatibility with existing rows)
ALTER TABLE "shipping_method_mappings"
ADD COLUMN IF NOT EXISTS "target_type" TEXT NOT NULL DEFAULT 'service';

-- Add rate_shopper_id column
ALTER TABLE "shipping_method_mappings"
ADD COLUMN IF NOT EXISTS "rate_shopper_id" TEXT;

-- Make carrier fields nullable (they won't be set for weight_rules target type)
ALTER TABLE "shipping_method_mappings"
ALTER COLUMN "carrier_id" DROP NOT NULL;

ALTER TABLE "shipping_method_mappings"
ALTER COLUMN "carrier_code" DROP NOT NULL;

ALTER TABLE "shipping_method_mappings"
ALTER COLUMN "service_code" DROP NOT NULL;

ALTER TABLE "shipping_method_mappings"
ALTER COLUMN "service_name" DROP NOT NULL;

-- Add foreign key to rate_shoppers
ALTER TABLE "shipping_method_mappings"
ADD CONSTRAINT "shipping_method_mappings_rate_shopper_id_fkey"
FOREIGN KEY ("rate_shopper_id") REFERENCES "rate_shoppers"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- Index for rate_shopper lookups
CREATE INDEX IF NOT EXISTS "shipping_method_mappings_rate_shopper_id_idx"
ON "shipping_method_mappings"("rate_shopper_id");
