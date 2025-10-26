/*
  Warnings:

  - You are about to drop the `purpose_bucket_manual_allocation_deallocation` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."purpose_bucket_manual_allocation_deallocation" DROP CONSTRAINT "purpose_bucket_manual_allocation_deallocation_asset_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."purpose_bucket_manual_allocation_deallocation" DROP CONSTRAINT "purpose_bucket_manual_allocation_deallocation_purpose_buck_fkey";

-- DropTable
DROP TABLE "public"."purpose_bucket_manual_allocation_deallocation";
