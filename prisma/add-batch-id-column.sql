-- Add batch_id and sequence if missing. Run in Supabase → SQL Editor.
-- (Use this if bulk_queue_items was created without batch_id or sequence.)

CREATE SEQUENCE IF NOT EXISTS bulk_batch_seq START 1;

ALTER TABLE "bulk_queue_items"
  ADD COLUMN IF NOT EXISTS "batch_id" TEXT UNIQUE;

CREATE UNIQUE INDEX IF NOT EXISTS "bulk_queue_items_batch_id_key" ON "bulk_queue_items"("batch_id");
