-- DropIndex
DROP INDEX "transaction_datetime_idx";

-- DropIndex
DROP INDEX "transaction_user_id_idx";

-- CreateIndex
CREATE INDEX "transaction_user_id_datetime_idx" ON "transaction"("user_id", "datetime");
