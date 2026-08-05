-- DropIndex
DROP INDEX "transaction_user_id_external_ref_idx";

-- AlterTable
ALTER TABLE "line_item" ADD COLUMN     "external_ref" TEXT;

-- CreateIndex
CREATE INDEX "line_item_external_ref_idx" ON "line_item"("external_ref");
