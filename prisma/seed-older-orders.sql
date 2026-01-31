-- Run in Supabase → SQL Editor
-- Inserts 45 sample orders that are 3–20 days old (for testing All Orders date filter and orange/red highlights).
-- Table: order_logs (id, order_number, status, raw_payload, created_at, updated_at)

INSERT INTO order_logs (id, order_number, status, raw_payload, created_at, updated_at)
SELECT
  'older_' || lpad(g.i::text, 3, '0'),
  'OLDER-' || lpad(g.i::text, 3, '0'),
  'RECEIVED',
  jsonb_build_object(
    'orderNumber', 'OLDER-' || lpad(g.i::text, 3, '0'),
    'orderDate', (NOW() - ((3 + ((g.i - 1) % 18)) || ' days')::interval),
    'shipTo', jsonb_build_object('name', 'Customer ' || g.i, 'city', 'Austin', 'state', 'TX'),
    'billTo', jsonb_build_object('name', 'Customer ' || g.i),
    'items', jsonb_build_array(jsonb_build_object('sku', 'DPT16MC', 'name', 'Bottle')),
    'amountPaid', 29.99,
    'custbody_pir_internal_sales_order_memo', CASE WHEN g.i % 2 = 0 THEN '' ELSE 'Internal note' END
  ),
  (NOW() - ((3 + ((g.i - 1) % 18)) || ' days')::interval),
  NOW()
FROM generate_series(1, 45) AS g(i);

-- Result: 45 orders with order numbers OLDER-001 … OLDER-045.
-- Order dates spread from 3 to 20 days ago (1–18 → 3 days, 19–36 → 4 days, … up to 20 days).
-- Even-numbered orders have empty memo (can get orange/red highlight); odd have a memo (no highlight).
