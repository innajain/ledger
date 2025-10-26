/*
  Warnings:

  - You are about to drop the column `account_id` on the `allocation_to_purpose_bucket` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."allocation_to_purpose_bucket" DROP CONSTRAINT "allocation_to_purpose_bucket_account_id_fkey";

-- AlterTable
ALTER TABLE "allocation_to_purpose_bucket" DROP COLUMN "account_id",
ADD COLUMN     "opening_balance_id" TEXT;

-- AddForeignKey
ALTER TABLE "allocation_to_purpose_bucket" ADD CONSTRAINT "allocation_to_purpose_bucket_opening_balance_id_fkey" FOREIGN KEY ("opening_balance_id") REFERENCES "opening_balance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
