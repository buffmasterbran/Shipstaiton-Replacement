-- 5 bulk groups (20, 40, 60, 80, 100 orders each). Run in Supabase → SQL Editor.
-- Delete existing bulk seeds first: DELETE FROM order_logs WHERE id LIKE 'bulk%';

-- Helper: build common payload fields (order_number, orderKey, addresses, etc.)
-- We use 5 separate inserts for 5 different product mixes.

-- ========== GROUP 1: 20 orders — DPT16PYN×1 + DPT10MTD×1 ==========
INSERT INTO order_logs (id, order_number, status, raw_payload, created_at, updated_at)
SELECT
  'bulk1-' || lpad(n::text, 6, '0'),
  '#' || (71000 + n)::text,
  'RECEIVED',
  jsonb_build_object(
    'gift', false,
    'orderNumber', '#' || (71000 + n)::text,
    'orderKey', (1770000 + n)::text,
    'orderDate', '2026-01-29T08:00:00.000Z',
    'orderStatus', 'awaiting_shipment',
    'paymentDate', '2026-01-29T08:00:00.000Z',
    'shipByDate', '2026-01-29T08:00:00.000Z',
    'taxAmount', 0,
    'amountPaid', 52,
    'shippingAmount', 0,
    'customerNotes', '', 'internalNotes', '',
    'paymentMethod', 'Credit Card',
    'packageCode', 'package',
    'confirmation', 'delivery',
    'requestedShippingService', 'Free Shipping',
    'weight', '{"units":"pounds","value":1.12}'::jsonb,
    'dimensions', '{"units":"inches","width":7,"height":2,"length":7}'::jsonb,
    'billTo', jsonb_build_object('name', 'Customer G1-' || n, 'street1', (1000 + n)::text || ' Ave', 'street2', '', 'city', 'Portland', 'state', 'OR', 'postalCode', '97201', 'country', 'US', 'phone', ''),
    'shipTo', jsonb_build_object('name', 'Customer G1-' || n, 'company', '', 'street1', (1000 + n)::text || ' Ave', 'street2', '', 'city', 'Portland', 'state', 'OR', 'postalCode', '97201', 'country', 'US', 'phone', '', 'residential', true),
    'items', '[
      {"sku":"DPT16PYN","name":"Ombre Insulated Stackable Tumbler","weight":{"units":"pounds","value":0.5625},"quantity":1,"unitPrice":26.95,"lineItemKey":1},
      {"sku":"DPT10MTD","name":"Wine Tumbler","weight":{"units":"pounds","value":0.5625},"quantity":1,"unitPrice":24.95,"lineItemKey":2}
    ]'::jsonb,
    'advancedOptions', '{"source":"netsuite","storeId":257680,"warehouseId":870629,"customField1":""}'::jsonb
  ),
  NOW() - ((20 - n) * interval '1 minute'),
  NOW()
FROM generate_series(1, 20) AS n
ON CONFLICT (id) DO NOTHING;

-- ========== GROUP 2: 40 orders — DPT26MC×1 + DPT16PYN×2 ==========
INSERT INTO order_logs (id, order_number, status, raw_payload, created_at, updated_at)
SELECT
  'bulk2-' || lpad(n::text, 6, '0'),
  '#' || (71020 + n)::text,
  'RECEIVED',
  jsonb_build_object(
    'gift', false,
    'orderNumber', '#' || (71020 + n)::text,
    'orderKey', (1770020 + n)::text,
    'orderDate', '2026-01-29T08:00:00.000Z',
    'orderStatus', 'awaiting_shipment',
    'paymentDate', '2026-01-29T08:00:00.000Z',
    'shipByDate', '2026-01-29T08:00:00.000Z',
    'taxAmount', 0,
    'amountPaid', 88,
    'shippingAmount', 0,
    'customerNotes', '', 'internalNotes', '',
    'paymentMethod', 'Credit Card',
    'packageCode', 'package',
    'confirmation', 'delivery',
    'requestedShippingService', 'Free Shipping',
    'weight', '{"units":"pounds","value":1.69}'::jsonb,
    'dimensions', '{"units":"inches","width":7,"height":2,"length":7}'::jsonb,
    'billTo', jsonb_build_object('name', 'Customer G2-' || n, 'street1', (2000 + n)::text || ' St', 'street2', '', 'city', 'Seattle', 'state', 'WA', 'postalCode', '98101', 'country', 'US', 'phone', ''),
    'shipTo', jsonb_build_object('name', 'Customer G2-' || n, 'company', '', 'street1', (2000 + n)::text || ' St', 'street2', '', 'city', 'Seattle', 'state', 'WA', 'postalCode', '98101', 'country', 'US', 'phone', '', 'residential', true),
    'items', '[
      {"sku":"DPT26MC","name":"Insulated Stackable Tumbler","weight":{"units":"pounds","value":0.75},"quantity":1,"unitPrice":33.95,"lineItemKey":1},
      {"sku":"DPT16PYN","name":"Ombre Insulated Stackable Tumbler","weight":{"units":"pounds","value":0.5625},"quantity":2,"unitPrice":26.95,"lineItemKey":2}
    ]'::jsonb,
    'advancedOptions', '{"source":"netsuite","storeId":257680,"warehouseId":870629,"customField1":""}'::jsonb
  ),
  NOW() - ((40 - n) * interval '1 minute'),
  NOW()
FROM generate_series(1, 40) AS n
ON CONFLICT (id) DO NOTHING;

-- ========== GROUP 3: 60 orders — DPT16POS×1 + DPT16PODB×1 ==========
INSERT INTO order_logs (id, order_number, status, raw_payload, created_at, updated_at)
SELECT
  'bulk3-' || lpad(n::text, 6, '0'),
  '#' || (71060 + n)::text,
  'RECEIVED',
  jsonb_build_object(
    'gift', false,
    'orderNumber', '#' || (71060 + n)::text,
    'orderKey', (1770060 + n)::text,
    'orderDate', '2026-01-29T08:00:00.000Z',
    'orderStatus', 'awaiting_shipment',
    'paymentDate', '2026-01-29T08:00:00.000Z',
    'shipByDate', '2026-01-29T08:00:00.000Z',
    'taxAmount', 0,
    'amountPaid', 51,
    'shippingAmount', 3.99,
    'customerNotes', '', 'internalNotes', '',
    'paymentMethod', 'Credit Card',
    'packageCode', 'package',
    'confirmation', 'delivery',
    'requestedShippingService', 'Flate Rate',
    'weight', '{"units":"pounds","value":1.15}'::jsonb,
    'dimensions', '{"units":"inches","width":7,"height":2,"length":7}'::jsonb,
    'billTo', jsonb_build_object('name', 'Customer G3-' || n, 'street1', (3000 + n)::text || ' Blvd', 'street2', '', 'city', 'Denver', 'state', 'CO', 'postalCode', '80202', 'country', 'US', 'phone', ''),
    'shipTo', jsonb_build_object('name', 'Customer G3-' || n, 'company', '', 'street1', (3000 + n)::text || ' Blvd', 'street2', '', 'city', 'Denver', 'state', 'CO', 'postalCode', '80202', 'country', 'US', 'phone', '', 'residential', true),
    'items', '[
      {"sku":"DPT16POS","name":"Ombre Insulated Stackable Tumbler","weight":{"units":"pounds","value":0.5875},"quantity":1,"unitPrice":24.95,"lineItemKey":1},
      {"sku":"DPT16PODB","name":"Ombre Insulated Stackable Tumbler","weight":{"units":"pounds","value":0},"quantity":1,"unitPrice":-2.5,"lineItemKey":2}
    ]'::jsonb,
    'advancedOptions', '{"source":"netsuite","storeId":257680,"warehouseId":870629,"customField1":""}'::jsonb
  ),
  NOW() - ((60 - n) * interval '1 minute'),
  NOW()
FROM generate_series(1, 60) AS n
ON CONFLICT (id) DO NOTHING;

-- ========== GROUP 4: 80 orders — DPT10MDFF×2 + DPT26PYN×1 ==========
INSERT INTO order_logs (id, order_number, status, raw_payload, created_at, updated_at)
SELECT
  'bulk4-' || lpad(n::text, 6, '0'),
  '#' || (71120 + n)::text,
  'RECEIVED',
  jsonb_build_object(
    'gift', false,
    'orderNumber', '#' || (71120 + n)::text,
    'orderKey', (1770120 + n)::text,
    'orderDate', '2026-01-29T08:00:00.000Z',
    'orderStatus', 'awaiting_shipment',
    'paymentDate', '2026-01-29T08:00:00.000Z',
    'shipByDate', '2026-01-29T08:00:00.000Z',
    'taxAmount', 0,
    'amountPaid', 81,
    'shippingAmount', 0,
    'customerNotes', '', 'internalNotes', '',
    'paymentMethod', 'Credit Card',
    'packageCode', 'package',
    'confirmation', 'delivery',
    'requestedShippingService', 'Free Shipping',
    'weight', '{"units":"pounds","value":1.67}'::jsonb,
    'dimensions', '{"units":"inches","width":7,"height":2,"length":7}'::jsonb,
    'billTo', jsonb_build_object('name', 'Customer G4-' || n, 'street1', (4000 + n)::text || ' Dr', 'street2', '', 'city', 'Austin', 'state', 'TX', 'postalCode', '78701', 'country', 'US', 'phone', ''),
    'shipTo', jsonb_build_object('name', 'Customer G4-' || n, 'company', '', 'street1', (4000 + n)::text || ' Dr', 'street2', '', 'city', 'Austin', 'state', 'TX', 'postalCode', '78701', 'country', 'US', 'phone', '', 'residential', true),
    'items', '[
      {"sku":"DPT10MDFF","name":"Wine Tumbler","weight":{"units":"pounds","value":0.5625},"quantity":2,"unitPrice":26.95,"lineItemKey":1},
      {"sku":"DPT26PYN","name":"Insulated Stackable Tumbler","weight":{"units":"pounds","value":0.5625},"quantity":1,"unitPrice":26.95,"lineItemKey":2}
    ]'::jsonb,
    'advancedOptions', '{"source":"netsuite","storeId":257680,"warehouseId":870629,"customField1":""}'::jsonb
  ),
  NOW() - ((80 - n) * interval '1 minute'),
  NOW()
FROM generate_series(1, 80) AS n
ON CONFLICT (id) DO NOTHING;

-- ========== GROUP 5: 100 orders — DPT16PYN×1 + DPT10MTD×2 + DPT26MC×1 ==========
INSERT INTO order_logs (id, order_number, status, raw_payload, created_at, updated_at)
SELECT
  'bulk5-' || lpad(n::text, 6, '0'),
  '#' || (71200 + n)::text,
  'RECEIVED',
  jsonb_build_object(
    'gift', false,
    'orderNumber', '#' || (71200 + n)::text,
    'orderKey', (1770200 + n)::text,
    'orderDate', '2026-01-29T08:00:00.000Z',
    'orderStatus', 'awaiting_shipment',
    'paymentDate', '2026-01-29T08:00:00.000Z',
    'shipByDate', '2026-01-29T08:00:00.000Z',
    'taxAmount', 0,
    'amountPaid', 112,
    'shippingAmount', 0,
    'customerNotes', '', 'internalNotes', '',
    'paymentMethod', 'Credit Card',
    'packageCode', 'package',
    'confirmation', 'delivery',
    'requestedShippingService', 'Free Shipping',
    'weight', '{"units":"pounds","value":2.44}'::jsonb,
    'dimensions', '{"units":"inches","width":7,"height":2,"length":7}'::jsonb,
    'billTo', jsonb_build_object('name', 'Customer G5-' || n, 'street1', (5000 + n)::text || ' Ln', 'street2', '', 'city', 'Phoenix', 'state', 'AZ', 'postalCode', '85001', 'country', 'US', 'phone', ''),
    'shipTo', jsonb_build_object('name', 'Customer G5-' || n, 'company', '', 'street1', (5000 + n)::text || ' Ln', 'street2', '', 'city', 'Phoenix', 'state', 'AZ', 'postalCode', '85001', 'country', 'US', 'phone', '', 'residential', true),
    'items', '[
      {"sku":"DPT16PYN","name":"Ombre Insulated Stackable Tumbler","weight":{"units":"pounds","value":0.5625},"quantity":1,"unitPrice":26.95,"lineItemKey":1},
      {"sku":"DPT10MTD","name":"Wine Tumbler","weight":{"units":"pounds","value":0.5625},"quantity":2,"unitPrice":24.95,"lineItemKey":2},
      {"sku":"DPT26MC","name":"Insulated Stackable Tumbler","weight":{"units":"pounds","value":0.75},"quantity":1,"unitPrice":33.95,"lineItemKey":3}
    ]'::jsonb,
    'advancedOptions', '{"source":"netsuite","storeId":257680,"warehouseId":870629,"customField1":""}'::jsonb
  ),
  NOW() - ((100 - n) * interval '1 minute'),
  NOW()
FROM generate_series(1, 100) AS n
ON CONFLICT (id) DO NOTHING;
