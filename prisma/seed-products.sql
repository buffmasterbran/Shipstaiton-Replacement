-- Seed initial products configuration
-- Run this in Supabase SQL Editor to populate the products catalog

INSERT INTO "AppSetting" (id, key, value, "updatedAt")
VALUES (
  gen_random_uuid()::text,
  'products',
  '{
    "products": [
      {
        "id": "tumbler-10oz",
        "name": "10oz Tumbler",
        "skuPatterns": ["^DPT10", "^PT10"],
        "dimensions": { "length": 3, "width": 3, "height": 5 },
        "volume": 45,
        "weight": 0.4,
        "category": "tumbler",
        "active": true
      },
      {
        "id": "tumbler-16oz",
        "name": "16oz Tumbler",
        "skuPatterns": ["^DPT16", "^PT16"],
        "dimensions": { "length": 3.5, "width": 3.5, "height": 6 },
        "volume": 73.5,
        "weight": 0.6,
        "category": "tumbler",
        "active": true
      },
      {
        "id": "tumbler-26oz",
        "name": "26oz Tumbler",
        "skuPatterns": ["^DPT26", "^PT26"],
        "dimensions": { "length": 4, "width": 4, "height": 8 },
        "volume": 128,
        "weight": 0.9,
        "category": "tumbler",
        "active": true
      },
      {
        "id": "tumbler-32oz",
        "name": "32oz Tumbler",
        "skuPatterns": ["^DPT32", "^PT32"],
        "dimensions": { "length": 4.5, "width": 4.5, "height": 9 },
        "volume": 182.25,
        "weight": 1.1,
        "category": "tumbler",
        "active": true
      }
    ],
    "version": "1.0.0"
  }'::jsonb,
  NOW()
)
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  "updatedAt" = NOW();
