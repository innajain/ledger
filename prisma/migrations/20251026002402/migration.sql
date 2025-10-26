/*
  Warnings:

  - You are about to drop the `purpose_bucket_reallocation` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "manual_allocation_type" AS ENUM ('allocate', 'deallocate');

-- DropForeignKey
ALTER TABLE "public"."purpose_bucket_reallocation" DROP CONSTRAINT "purpose_bucket_reallocation_credit_purpose_bucket_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."purpose_bucket_reallocation" DROP CONSTRAINT "purpose_bucket_reallocation_debit_purpose_bucket_id_fkey";

-- DropTable
DROP TABLE "public"."purpose_bucket_reallocation";

-- CreateTable
CREATE TABLE "purpose_bucket_manual_allocation_deallocation" (
    "id" TEXT NOT NULL,
    "type" "manual_allocation_type" NOT NULL,
    "purpose_bucket_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "asset_id" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "purpose_bucket_manual_allocation_deallocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "purpose_bucket_manual_allocation_deallocation_id_key" ON "purpose_bucket_manual_allocation_deallocation"("id");

-- AddForeignKey
ALTER TABLE "purpose_bucket_manual_allocation_deallocation" ADD CONSTRAINT "purpose_bucket_manual_allocation_deallocation_purpose_buck_fkey" FOREIGN KEY ("purpose_bucket_id") REFERENCES "purpose_bucket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purpose_bucket_manual_allocation_deallocation" ADD CONSTRAINT "purpose_bucket_manual_allocation_deallocation_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
