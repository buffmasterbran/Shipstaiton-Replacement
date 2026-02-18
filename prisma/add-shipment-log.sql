-- Add new fields to order_logs
ALTER TABLE order_logs ADD COLUMN IF NOT EXISTS label_id TEXT;
ALTER TABLE order_logs ADD COLUMN IF NOT EXISTS shipment_id TEXT;

-- Create shipment_logs table
CREATE TABLE IF NOT EXISTS shipment_logs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  order_log_id TEXT NOT NULL REFERENCES order_logs(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  label_id TEXT,
  shipment_id TEXT,
  tracking_number TEXT,
  carrier TEXT,
  service_code TEXT,
  service_name TEXT,
  label_cost DOUBLE PRECISION,
  label_url TEXT,
  label_format TEXT DEFAULT 'pdf',
  print_job_id INTEGER,
  print_status TEXT,
  netsuite_updated BOOLEAN DEFAULT false,
  netsuite_error TEXT,
  created_by_name TEXT NOT NULL,
  void_reason TEXT,
  created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS shipment_logs_order_log_id_idx ON shipment_logs(order_log_id);
