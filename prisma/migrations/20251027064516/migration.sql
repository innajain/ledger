-- DropForeignKey
ALTER TABLE "public"."allocation_to_purpose_bucket" DROP CONSTRAINT "allocation_to_purpose_bucket_income_txn_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."allocation_to_purpose_bucket" DROP CONSTRAINT "allocation_to_purpose_bucket_opening_balance_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."asset_replacement_in_purpose_bucket" DROP CONSTRAINT "asset_replacement_in_purpose_bucket_asset_trade_txn_id_fkey";

-- AddForeignKey
ALTER TABLE "allocation_to_purpose_bucket" ADD CONSTRAINT "allocation_to_purpose_bucket_income_txn_id_fkey" FOREIGN KEY ("income_txn_id") REFERENCES "income_txn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocation_to_purpose_bucket" ADD CONSTRAINT "allocation_to_purpose_bucket_opening_balance_id_fkey" FOREIGN KEY ("opening_balance_id") REFERENCES "opening_balance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_replacement_in_purpose_bucket" ADD CONSTRAINT "asset_replacement_in_purpose_bucket_asset_trade_txn_id_fkey" FOREIGN KEY ("asset_trade_txn_id") REFERENCES "asset_trade_txn"("id") ON DELETE CASCADE ON UPDATE CASCADE;
