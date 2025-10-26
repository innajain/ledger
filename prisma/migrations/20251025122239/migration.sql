/*
  Warnings:

  - You are about to drop the `self_transfer_and_refundable_and_refund_txn` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."self_transfer_and_refundable_and_refund_txn" DROP CONSTRAINT "self_transfer_and_refundable_and_refund_txn_asset_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."self_transfer_and_refundable_and_refund_txn" DROP CONSTRAINT "self_transfer_and_refundable_and_refund_txn_from_account_i_fkey";

-- DropForeignKey
ALTER TABLE "public"."self_transfer_and_refundable_and_refund_txn" DROP CONSTRAINT "self_transfer_and_refundable_and_refund_txn_to_account_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."self_transfer_and_refundable_and_refund_txn" DROP CONSTRAINT "self_transfer_and_refundable_and_refund_txn_transaction_id_fkey";

-- DropTable
DROP TABLE "public"."self_transfer_and_refundable_and_refund_txn";

-- CreateTable
CREATE TABLE "self_transfer_or_refundable_or_refund_txn" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "from_account_id" TEXT NOT NULL,
    "to_account_id" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "self_transfer_or_refundable_or_refund_txn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "self_transfer_or_refundable_or_refund_txn_id_key" ON "self_transfer_or_refundable_or_refund_txn"("id");

-- CreateIndex
CREATE UNIQUE INDEX "self_transfer_or_refundable_or_refund_txn_transaction_id_key" ON "self_transfer_or_refundable_or_refund_txn"("transaction_id");

-- AddForeignKey
ALTER TABLE "self_transfer_or_refundable_or_refund_txn" ADD CONSTRAINT "self_transfer_or_refundable_or_refund_txn_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "self_transfer_or_refundable_or_refund_txn" ADD CONSTRAINT "self_transfer_or_refundable_or_refund_txn_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "self_transfer_or_refundable_or_refund_txn" ADD CONSTRAINT "self_transfer_or_refundable_or_refund_txn_from_account_id_fkey" FOREIGN KEY ("from_account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "self_transfer_or_refundable_or_refund_txn" ADD CONSTRAINT "self_transfer_or_refundable_or_refund_txn_to_account_id_fkey" FOREIGN KEY ("to_account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
