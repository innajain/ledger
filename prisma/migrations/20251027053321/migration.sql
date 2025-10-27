-- DropForeignKey
ALTER TABLE "public"."asset_trade_txn" DROP CONSTRAINT "asset_trade_txn_transaction_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."expense_txn" DROP CONSTRAINT "expense_txn_transaction_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."income_txn" DROP CONSTRAINT "income_txn_transaction_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."self_transfer_or_refundable_or_refund_txn" DROP CONSTRAINT "self_transfer_or_refundable_or_refund_txn_transaction_id_fkey";

-- AddForeignKey
ALTER TABLE "income_txn" ADD CONSTRAINT "income_txn_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_txn" ADD CONSTRAINT "expense_txn_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "self_transfer_or_refundable_or_refund_txn" ADD CONSTRAINT "self_transfer_or_refundable_or_refund_txn_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_trade_txn" ADD CONSTRAINT "asset_trade_txn_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
