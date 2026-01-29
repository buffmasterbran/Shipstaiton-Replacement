-- Step 1: Run this in Supabase → SQL Editor to insert 5 sample orders.
-- Then run the SELECT below, copy the result, and paste it in chat so we can generate hundreds.

INSERT INTO order_logs (id, order_number, status, raw_payload, created_at, updated_at)
VALUES
  (
    'seed001sampleorder00000000001',
    'NS-1001',
    'RECEIVED',
    '{"orderNumber":"NS-1001","orderKey":"1001","orderDate":"2025-01-28T12:00:00.000Z","orderStatus":"awaiting_shipment","shipTo":{"name":"Alice Smith","street1":"123 Main St","city":"Portland","state":"OR","postalCode":"97201","country":"US"},"items":[{"sku":"WIDGET-A","name":"Widget A","quantity":2,"weight":{"value":1.5,"units":"pounds"}}],"weight":{"value":3,"units":"pounds"},"advancedOptions":{"source":"netsuite"}}'::jsonb,
    NOW(),
    NOW()
  ),
  (
    'seed002sampleorder00000000002',
    'NS-1002',
    'RECEIVED',
    '{"orderNumber":"NS-1002","orderKey":"1002","orderDate":"2025-01-28T14:00:00.000Z","orderStatus":"awaiting_shipment","shipTo":{"name":"Bob Jones","street1":"456 Oak Ave","city":"Seattle","state":"WA","postalCode":"98101","country":"US"},"items":[{"sku":"GADGET-B","name":"Gadget B","quantity":1,"weight":{"value":0.5,"units":"pounds"}}],"weight":{"value":0.5,"units":"pounds"},"advancedOptions":{"source":"netsuite"}}'::jsonb,
    NOW(),
    NOW()
  ),
  (
    'seed003sampleorder00000000003',
    'NS-1003',
    'RECEIVED',
    '{"orderNumber":"NS-1003","orderKey":"1003","orderDate":"2025-01-28T16:00:00.000Z","orderStatus":"awaiting_shipment","shipTo":{"name":"Carol Lee","street1":"789 Pine Rd","city":"Denver","state":"CO","postalCode":"80202","country":"US"},"items":[{"sku":"WIDGET-A","name":"Widget A","quantity":3},{"sku":"GADGET-B","name":"Gadget B","quantity":1}],"weight":{"value":4.5,"units":"pounds"},"advancedOptions":{"source":"netsuite"}}'::jsonb,
    NOW(),
    NOW()
  ),
  (
    'seed004sampleorder00000000004',
    'NS-1004',
    'RECEIVED',
    '{"orderNumber":"NS-1004","orderKey":"1004","orderDate":"2025-01-29T09:00:00.000Z","orderStatus":"awaiting_shipment","shipTo":{"name":"Dave Brown","street1":"321 Elm St","city":"Phoenix","state":"AZ","postalCode":"85001","country":"US"},"items":[{"sku":"KIT-C","name":"Kit C","quantity":1,"weight":{"value":2,"units":"pounds"}}],"weight":{"value":2,"units":"pounds"},"advancedOptions":{"source":"netsuite"}}'::jsonb,
    NOW(),
    NOW()
  ),
  (
    'seed005sampleorder00000000005',
    'NS-1005',
    'RECEIVED',
    '{"orderNumber":"NS-1005","orderKey":"1005","orderDate":"2025-01-29T11:00:00.000Z","orderStatus":"awaiting_shipment","shipTo":{"name":"Eve Wilson","street1":"555 Commerce Dr","city":"Austin","state":"TX","postalCode":"78701","country":"US"},"items":[{"sku":"WIDGET-A","name":"Widget A","quantity":5},{"sku":"GADGET-B","name":"Gadget B","quantity":2}],"weight":{"value":8.5,"units":"pounds"},"advancedOptions":{"source":"netsuite"}}'::jsonb,
    NOW(),
    NOW()
  )
ON CONFLICT (id) DO NOTHING;
