/*
  Warnings:

  - You are about to drop the column `income_data_id` on the `allocation_to_purpose_bucket` table. All the data in the column will be lost.
  - You are about to drop the column `asset_trade_data_id` on the `asset_replacement_in_purpose_bucket` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[purpose_bucket_id,income_txn_id]` on the table `allocation_to_purpose_bucket` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `asset_trade_txn_id` to the `asset_replacement_in_purpose_bucket` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."allocation_to_purpose_bucket" DROP CONSTRAINT "allocation_to_purpose_bucket_income_data_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."asset_replacement_in_purpose_bucket" DROP CONSTRAINT "asset_replacement_in_purpose_bucket_asset_trade_data_id_fkey";

-- DropIndex
DROP INDEX "public"."allocation_to_purpose_bucket_purpose_bucket_id_income_data__key";

-- AlterTable
ALTER TABLE "allocation_to_purpose_bucket" DROP COLUMN "income_data_id",
ADD COLUMN     "income_txn_id" TEXT;

-- AlterTable
ALTER TABLE "asset_replacement_in_purpose_bucket" DROP COLUMN "asset_trade_data_id",
ADD COLUMN     "asset_trade_txn_id" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "allocation_to_purpose_bucket_purpose_bucket_id_income_txn_i_key" ON "allocation_to_purpose_bucket"("purpose_bucket_id", "income_txn_id");

-- AddForeignKey
ALTER TABLE "allocation_to_purpose_bucket" ADD CONSTRAINT "allocation_to_purpose_bucket_income_txn_id_fkey" FOREIGN KEY ("income_txn_id") REFERENCES "income_txn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_replacement_in_purpose_bucket" ADD CONSTRAINT "asset_replacement_in_purpose_bucket_asset_trade_txn_id_fkey" FOREIGN KEY ("asset_trade_txn_id") REFERENCES "asset_trade_txn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
