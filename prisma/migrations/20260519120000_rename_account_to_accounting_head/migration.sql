-- Rename enum type and its values
ALTER TYPE "account_type" RENAME TO "accounting_head_type";
ALTER TYPE "accounting_head_type" RENAME VALUE 'real' TO 'account';
ALTER TYPE "accounting_head_type" RENAME VALUE 'nominal' TO 'income_expense';

-- Rename the table and align its constraints / indexes to the new name
ALTER TABLE "account" RENAME TO "accounting_head";
ALTER TABLE "accounting_head" RENAME CONSTRAINT "account_pkey" TO "accounting_head_pkey";
ALTER TABLE "accounting_head" RENAME CONSTRAINT "account_user_id_fkey" TO "accounting_head_user_id_fkey";
ALTER TABLE "accounting_head" RENAME CONSTRAINT "account_parent_id_fkey" TO "accounting_head_parent_id_fkey";
ALTER INDEX "account_name_user_id_key" RENAME TO "accounting_head_name_user_id_key";
ALTER INDEX "account_parent_id_idx" RENAME TO "accounting_head_parent_id_idx";
ALTER INDEX "account_user_id_parent_id_order_index_idx" RENAME TO "accounting_head_user_id_parent_id_order_index_idx";
ALTER INDEX "account_user_id_type_idx" RENAME TO "accounting_head_user_id_type_idx";

-- Rename FK columns on dependent tables
ALTER TABLE "line_item" RENAME COLUMN "account_id" TO "accounting_head_id";
ALTER TABLE "line_item" RENAME CONSTRAINT "line_item_account_id_fkey" TO "line_item_accounting_head_id_fkey";
ALTER INDEX "line_item_account_id_idx" RENAME TO "line_item_accounting_head_id_idx";

ALTER TABLE "line_item_template" RENAME COLUMN "account_id" TO "accounting_head_id";
ALTER TABLE "line_item_template" RENAME CONSTRAINT "line_item_template_account_id_fkey" TO "line_item_template_accounting_head_id_fkey";
ALTER INDEX "line_item_template_account_id_idx" RENAME TO "line_item_template_accounting_head_id_idx";

-- Rename per-user default columns
ALTER TABLE "user" RENAME COLUMN "default_real_account_id"       TO "default_account_id";
ALTER TABLE "user" RENAME COLUMN "default_nominal_account_id"    TO "default_income_expense_id";
ALTER TABLE "user" RENAME COLUMN "default_allocation_account_id" TO "default_allocation_id";
