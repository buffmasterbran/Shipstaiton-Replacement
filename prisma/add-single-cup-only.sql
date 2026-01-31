-- ============================================================================
-- Migration: Add single_cup_only column to boxes table
-- Run this in Supabase SQL Editor
-- ============================================================================

-- Add the single_cup_only column
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS single_cup_only BOOLEAN DEFAULT FALSE;

-- Mark existing single boxes as single-cup-only
-- Adjust the box names/IDs to match your actual boxes
UPDATE boxes SET single_cup_only = TRUE
WHERE name ILIKE '%single%'
   OR id ILIKE '%single%';

-- Verify the change
SELECT id, name, single_cup_only FROM boxes ORDER BY priority;
