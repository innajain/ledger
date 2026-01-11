-- AlterTable
ALTER TABLE "account" ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "asset" ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;
