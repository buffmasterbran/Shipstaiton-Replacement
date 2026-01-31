-- ============================================================
-- 1. ADD THE COLUMN (run this first)
-- ============================================================
ALTER TABLE order_logs 
ADD COLUMN IF NOT EXISTS customer_reached_out BOOLEAN DEFAULT FALSE;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_order_logs_customer_reached_out 
ON order_logs(customer_reached_out);


-- ============================================================
-- 2. SAMPLE: Mark specific orders as "customer reached out"
-- ============================================================
-- Replace these order numbers with real ones from your database:

-- Mark a single order
UPDATE order_logs 
SET customer_reached_out = TRUE, updated_at = NOW()
WHERE order_number = '#70565';

-- Mark multiple orders at once
UPDATE order_logs 
SET customer_reached_out = TRUE, updated_at = NOW()
WHERE order_number IN ('#70539', '#70626', '#70603');


-- ============================================================
-- 3. SAMPLE: View all "customer reached out" orders
-- ============================================================
SELECT 
  id,
  order_number,
  status,
  customer_reached_out,
  created_at,
  raw_payload->>'requestedShippingService' AS shipping_method,
  raw_payload->'shipTo'->>'name' AS customer_name
FROM order_logs
WHERE customer_reached_out = TRUE
ORDER BY created_at DESC;


-- ============================================================
-- 4. SAMPLE: Toggle off (set back to false)
-- ============================================================
UPDATE order_logs 
SET customer_reached_out = FALSE, updated_at = NOW()
WHERE order_number = '#70565';


-- ============================================================
-- 5. SAMPLE: Find expedited orders (shipping method OR customer reached out)
-- ============================================================
SELECT 
  id,
  order_number,
  status,
  customer_reached_out,
  raw_payload->>'requestedShippingService' AS shipping_method,
  raw_payload->'shipTo'->>'name' AS customer_name,
  created_at
FROM order_logs
WHERE 
  customer_reached_out = TRUE
  OR LOWER(raw_payload->>'requestedShippingService') LIKE '%next day%'
  OR LOWER(raw_payload->>'requestedShippingService') LIKE '%2nd day%'
  OR LOWER(raw_payload->>'requestedShippingService') LIKE '%2 day%'
  OR LOWER(raw_payload->>'requestedShippingService') LIKE '%3 day%'
ORDER BY created_at DESC;


-- ============================================================
-- 6. SAMPLE: Count expedited orders by type
-- ============================================================
SELECT 
  CASE 
    WHEN customer_reached_out = TRUE THEN 'Customer Reached Out'
    ELSE 'Expedited Shipping'
  END AS reason,
  COUNT(*) AS count
FROM order_logs
WHERE 
  customer_reached_out = TRUE
  OR LOWER(raw_payload->>'requestedShippingService') LIKE '%next day%'
  OR LOWER(raw_payload->>'requestedShippingService') LIKE '%2nd day%'
  OR LOWER(raw_payload->>'requestedShippingService') LIKE '%2 day%'
  OR LOWER(raw_payload->>'requestedShippingService') LIKE '%3 day%'
GROUP BY 
  CASE 
    WHEN customer_reached_out = TRUE THEN 'Customer Reached Out'
    ELSE 'Expedited Shipping'
  END;
