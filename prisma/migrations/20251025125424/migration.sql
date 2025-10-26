/*
  Warnings:

  - You are about to drop the column `new_asset_quantity` on the `asset_replacement_in_purpose_bucket` table. All the data in the column will be lost.
  - You are about to drop the column `old_asset_quantity` on the `asset_replacement_in_purpose_bucket` table. All the data in the column will be lost.
  - Added the required column `credit_quantity` to the `asset_replacement_in_purpose_bucket` table without a default value. This is not possible if the table is not empty.
  - Added the required column `debit_quantity` to the `asset_replacement_in_purpose_bucket` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "asset_replacement_in_purpose_bucket" DROP COLUMN "new_asset_quantity",
DROP COLUMN "old_asset_quantity",
ADD COLUMN     "credit_quantity" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "debit_quantity" DOUBLE PRECISION NOT NULL;
