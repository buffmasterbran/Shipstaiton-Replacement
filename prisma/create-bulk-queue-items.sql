-- Run this in Supabase → SQL Editor if Prisma db push can't reach your DB (e.g. P1001).
-- Creates the bulk_queue_items table for the Bulk Verification feature.

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
