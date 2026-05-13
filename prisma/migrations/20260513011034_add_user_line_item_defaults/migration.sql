-- AlterTable
ALTER TABLE "user" ADD COLUMN     "default_allocation_account_id" TEXT,
ADD COLUMN     "default_asset_id" TEXT,
ADD COLUMN     "default_nominal_account_id" TEXT,
ADD COLUMN     "default_real_account_id" TEXT;
