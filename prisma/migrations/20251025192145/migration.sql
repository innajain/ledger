/*
  Warnings:

  - A unique constraint covering the columns `[purpose_bucket_id,income_data_id]` on the table `allocation_to_purpose_bucket` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[purpose_bucket_id,opening_balance_id]` on the table `allocation_to_purpose_bucket` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "allocation_to_purpose_bucket_purpose_bucket_id_income_data__key" ON "allocation_to_purpose_bucket"("purpose_bucket_id", "income_data_id");

-- CreateIndex
CREATE UNIQUE INDEX "allocation_to_purpose_bucket_purpose_bucket_id_opening_bala_key" ON "allocation_to_purpose_bucket"("purpose_bucket_id", "opening_balance_id");
