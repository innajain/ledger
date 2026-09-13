-- AlterTable
ALTER TABLE "transaction" ADD COLUMN     "is_future" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "transaction_user_id_is_future_datetime_idx" ON "transaction"("user_id", "is_future", "datetime");
