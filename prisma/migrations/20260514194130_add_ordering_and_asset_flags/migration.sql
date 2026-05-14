-- Rename is_placeholder_acc -> is_placeholder on account (preserves data).
-- Prisma's auto-generated diff would DROP+ADD; we use RENAME COLUMN instead.
ALTER TABLE "account" RENAME COLUMN "is_placeholder_acc" TO "is_placeholder";

-- AlterTable
ALTER TABLE "account" ADD COLUMN "order_index" INTEGER;

-- AlterTable
ALTER TABLE "asset" ADD COLUMN "is_placeholder" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "order_index" INTEGER;

-- CreateIndex
CREATE INDEX "account_user_id_parent_id_order_index_idx" ON "account"("user_id", "parent_id", "order_index");

-- CreateIndex
CREATE INDEX "asset_user_id_parent_id_order_index_idx" ON "asset"("user_id", "parent_id", "order_index");
