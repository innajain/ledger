-- DropIndex
DROP INDEX "line_item_external_ref_idx";

-- AlterTable
ALTER TABLE "line_item" DROP COLUMN "external_ref";

