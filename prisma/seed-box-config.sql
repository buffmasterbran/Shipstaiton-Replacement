-- Seed initial box configuration
-- Run this in Supabase SQL Editor to populate the box config

INSERT INTO "AppSetting" (id, key, value, "updatedAt")
VALUES (
  gen_random_uuid()::text,
  'box_config',
  '{
    "boxes": [
      {
        "id": "single",
        "name": "Single Box",
        "internalDimensions": { "length": 5, "width": 5, "height": 9 },
        "volume": 225,
        "priority": 1,
        "active": true,
        "inStock": true
      },
      {
        "id": "2-4-box",
        "name": "2/4 Box",
        "internalDimensions": { "length": 8, "width": 8, "height": 9 },
        "volume": 576,
        "priority": 2,
        "active": true,
        "inStock": true
      },
      {
        "id": "4-5-box",
        "name": "4/5 Box",
        "internalDimensions": { "length": 10, "width": 10, "height": 10 },
        "volume": 1000,
        "priority": 3,
        "active": true,
        "inStock": true
      },
      {
        "id": "6-10-box",
        "name": "6/10 Box",
        "internalDimensions": { "length": 12, "width": 12, "height": 12 },
        "volume": 1728,
        "priority": 4,
        "active": true,
        "inStock": true
      }
    ],
    "feedbackRules": [],
    "packingEfficiency": 0.7,
    "version": "1.0.0"
  }'::jsonb,
  NOW()
)
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  "updatedAt" = NOW();
