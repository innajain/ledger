/*
  Warnings:

  - A unique constraint covering the columns `[user_id,idempotency_key]` on the table `transaction` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "transaction" ADD COLUMN     "external_ref" TEXT,
ADD COLUMN     "idempotency_key" TEXT;

-- CreateIndex
CREATE INDEX "transaction_user_id_external_ref_idx" ON "transaction"("user_id", "external_ref");

-- CreateIndex
CREATE UNIQUE INDEX "transaction_user_id_idempotency_key_key" ON "transaction"("user_id", "idempotency_key");
