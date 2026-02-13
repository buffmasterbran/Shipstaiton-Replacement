-- ============================================================================
-- MANUAL MIGRATION: Permission Groups & User Enhancements
-- Run this in Supabase SQL Editor
-- ============================================================================

-- 1. Create permission_groups table
CREATE TABLE IF NOT EXISTS "permission_groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permission_groups_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "permission_groups_name_key" ON "permission_groups"("name");
CREATE INDEX IF NOT EXISTS "permission_groups_is_default_idx" ON "permission_groups"("is_default");

-- 2. Create group_page_access table
CREATE TABLE IF NOT EXISTS "group_page_access" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "page_key" TEXT NOT NULL,

    CONSTRAINT "group_page_access_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "group_page_access_group_id_page_key_key" ON "group_page_access"("group_id", "page_key");
CREATE INDEX IF NOT EXISTS "group_page_access_group_id_idx" ON "group_page_access"("group_id");

ALTER TABLE "group_page_access" ADD CONSTRAINT "group_page_access_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "permission_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. Add new columns to users table
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "netsuite_emp_id" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "group_id" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_admin" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_login_at" TIMESTAMP(3);

-- Create unique index on netsuite_emp_id (only if not exists)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'users_netsuite_emp_id_key') THEN
        CREATE UNIQUE INDEX "users_netsuite_emp_id_key" ON "users"("netsuite_emp_id");
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "users_netsuite_emp_id_idx" ON "users"("netsuite_emp_id");
CREATE INDEX IF NOT EXISTS "users_group_id_idx" ON "users"("group_id");

ALTER TABLE "users" ADD CONSTRAINT "users_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "permission_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. Seed default "Warehouse Staff" group
INSERT INTO "permission_groups" ("id", "name", "description", "is_default", "created_at", "updated_at")
VALUES (
    'default-warehouse-staff',
    'Warehouse Staff',
    'Default group for new users. Access to picking, packing, and scan-to-verify.',
    true,
    NOW(),
    NOW()
)
ON CONFLICT ("name") DO NOTHING;

-- 5. Seed page access for default group
INSERT INTO "group_page_access" ("id", "group_id", "page_key") VALUES
    ('gpa-ws-pick', 'default-warehouse-staff', 'pick'),
    ('gpa-ws-cart-scan', 'default-warehouse-staff', 'cart-scan'),
    ('gpa-ws-scan-to-verify', 'default-warehouse-staff', 'scan-to-verify')
ON CONFLICT ("group_id", "page_key") DO NOTHING;
