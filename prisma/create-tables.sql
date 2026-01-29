-- Recreate all app tables. Run in Supabase → SQL Editor.
-- (After deleting the DB or starting fresh.)

-- 1. Order logs (main orders table)
CREATE TABLE IF NOT EXISTS "order_logs" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "order_number" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RECEIVED',
  "raw_payload" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE INDEX IF NOT EXISTS "order_logs_created_at_idx" ON "order_logs"("created_at");
CREATE INDEX IF NOT EXISTS "order_logs_order_number_idx" ON "order_logs"("order_number");

-- 2. Bulk queue (batched orders for verification)
CREATE SEQUENCE IF NOT EXISTS bulk_batch_seq START 1;

CREATE TABLE IF NOT EXISTS "bulk_queue_items" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "batch_id" TEXT UNIQUE,
  "bulk_group_signature" TEXT NOT NULL,
  "chunk_index" INTEGER NOT NULL,
  "total_chunks" INTEGER NOT NULL,
  "order_numbers" JSONB NOT NULL,
  "package_info" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE INDEX IF NOT EXISTS "bulk_queue_items_status_idx" ON "bulk_queue_items"("status");
CREATE UNIQUE INDEX IF NOT EXISTS "bulk_queue_items_batch_id_key" ON "bulk_queue_items"("batch_id");
