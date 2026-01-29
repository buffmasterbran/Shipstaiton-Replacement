-- Run in Supabase → SQL Editor if you already have bulk_queue_items and need to add batch_id.
-- New batches will get IDs like Bulk-000001 (6 digits, numbers only, 1M capacity).

CREATE SEQUENCE IF NOT EXISTS bulk_batch_seq START 1;

ALTER TABLE "bulk_queue_items"
  ADD COLUMN IF NOT EXISTS "batch_id" TEXT UNIQUE;

CREATE UNIQUE INDEX IF NOT EXISTS "bulk_queue_items_batch_id_key" ON "bulk_queue_items"("batch_id");
