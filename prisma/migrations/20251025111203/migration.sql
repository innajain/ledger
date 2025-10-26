/*
  Warnings:

  - You are about to drop the column `assetId` on the `account` table. All the data in the column will be lost.
  - You are about to drop the column `opening_balance` on the `account` table. All the data in the column will be lost.
  - You are about to drop the `asset_trade_data` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `expense_data` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `income_data` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `self_transfer_and_refundable_and_refund_data` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `purpose_bucket_id` to the `asset_replacement_in_purpose_bucket` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."account" DROP CONSTRAINT "account_assetId_fkey";

-- DropForeignKey
ALTER TABLE "public"."allocation_to_purpose_bucket" DROP CONSTRAINT "allocation_to_purpose_bucket_income_data_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."asset_replacement_in_purpose_bucket" DROP CONSTRAINT "asset_replacement_in_purpose_bucket_asset_trade_data_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."asset_trade_data" DROP CONSTRAINT "asset_trade_data_credit_account_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."asset_trade_data" DROP CONSTRAINT "asset_trade_data_debit_account_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."asset_trade_data" DROP CONSTRAINT "asset_trade_data_transaction_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."expense_data" DROP CONSTRAINT "expense_data_from_account_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."expense_data" DROP CONSTRAINT "expense_data_purpose_bucket_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."expense_data" DROP CONSTRAINT "expense_data_transaction_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."income_data" DROP CONSTRAINT "income_data_to_account_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."income_data" DROP CONSTRAINT "income_data_transaction_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."self_transfer_and_refundable_and_refund_data" DROP CONSTRAINT "self_transfer_and_refundable_and_refund_data_from_account__fkey";

-- DropForeignKey
ALTER TABLE "public"."self_transfer_and_refundable_and_refund_data" DROP CONSTRAINT "self_transfer_and_refundable_and_refund_data_to_account_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."self_transfer_and_refundable_and_refund_data" DROP CONSTRAINT "self_transfer_and_refundable_and_refund_data_transaction_i_fkey";

-- AlterTable
ALTER TABLE "account" DROP COLUMN "assetId",
DROP COLUMN "opening_balance";

-- AlterTable
ALTER TABLE "asset_replacement_in_purpose_bucket" ADD COLUMN     "purpose_bucket_id" TEXT NOT NULL;

-- DropTable
DROP TABLE "public"."asset_trade_data";

-- DropTable
DROP TABLE "public"."expense_data";

-- DropTable
DROP TABLE "public"."income_data";

-- DropTable
DROP TABLE "public"."self_transfer_and_refundable_and_refund_data";

-- CreateTable
CREATE TABLE "opening_balance" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "opening_balance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "income_txn" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "income_txn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_txn" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "purpose_bucket_id" TEXT NOT NULL,

    CONSTRAINT "expense_txn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "self_transfer_and_refundable_and_refund_txn" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "from_account_id" TEXT NOT NULL,
    "to_account_id" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "self_transfer_and_refundable_and_refund_txn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_trade_txn" (
    "id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "debit_asset_id" TEXT NOT NULL,
    "debit_account_id" TEXT NOT NULL,
    "debit_quantity" DOUBLE PRECISION NOT NULL,
    "debit_date" TIMESTAMP(3) NOT NULL,
    "credit_asset_id" TEXT NOT NULL,
    "credit_account_id" TEXT NOT NULL,
    "credit_quantity" DOUBLE PRECISION NOT NULL,
    "credit_date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_trade_txn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "opening_balance_id_key" ON "opening_balance"("id");

-- CreateIndex
CREATE UNIQUE INDEX "opening_balance_account_id_asset_id_key" ON "opening_balance"("account_id", "asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "income_txn_id_key" ON "income_txn"("id");

-- CreateIndex
CREATE UNIQUE INDEX "income_txn_transaction_id_key" ON "income_txn"("transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "expense_txn_id_key" ON "expense_txn"("id");

-- CreateIndex
CREATE UNIQUE INDEX "expense_txn_transaction_id_key" ON "expense_txn"("transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "self_transfer_and_refundable_and_refund_txn_id_key" ON "self_transfer_and_refundable_and_refund_txn"("id");

-- CreateIndex
CREATE UNIQUE INDEX "self_transfer_and_refundable_and_refund_txn_transaction_id_key" ON "self_transfer_and_refundable_and_refund_txn"("transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "asset_trade_txn_id_key" ON "asset_trade_txn"("id");

-- CreateIndex
CREATE UNIQUE INDEX "asset_trade_txn_transaction_id_key" ON "asset_trade_txn"("transaction_id");

-- AddForeignKey
ALTER TABLE "opening_balance" ADD CONSTRAINT "opening_balance_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_balance" ADD CONSTRAINT "opening_balance_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "income_txn" ADD CONSTRAINT "income_txn_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "income_txn" ADD CONSTRAINT "income_txn_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "income_txn" ADD CONSTRAINT "income_txn_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_txn" ADD CONSTRAINT "expense_txn_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_txn" ADD CONSTRAINT "expense_txn_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_txn" ADD CONSTRAINT "expense_txn_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_txn" ADD CONSTRAINT "expense_txn_purpose_bucket_id_fkey" FOREIGN KEY ("purpose_bucket_id") REFERENCES "purpose_bucket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "self_transfer_and_refundable_and_refund_txn" ADD CONSTRAINT "self_transfer_and_refundable_and_refund_txn_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "self_transfer_and_refundable_and_refund_txn" ADD CONSTRAINT "self_transfer_and_refundable_and_refund_txn_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "self_transfer_and_refundable_and_refund_txn" ADD CONSTRAINT "self_transfer_and_refundable_and_refund_txn_from_account_i_fkey" FOREIGN KEY ("from_account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "self_transfer_and_refundable_and_refund_txn" ADD CONSTRAINT "self_transfer_and_refundable_and_refund_txn_to_account_id_fkey" FOREIGN KEY ("to_account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_trade_txn" ADD CONSTRAINT "asset_trade_txn_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_trade_txn" ADD CONSTRAINT "asset_trade_txn_debit_asset_id_fkey" FOREIGN KEY ("debit_asset_id") REFERENCES "asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_trade_txn" ADD CONSTRAINT "asset_trade_txn_debit_account_id_fkey" FOREIGN KEY ("debit_account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_trade_txn" ADD CONSTRAINT "asset_trade_txn_credit_asset_id_fkey" FOREIGN KEY ("credit_asset_id") REFERENCES "asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_trade_txn" ADD CONSTRAINT "asset_trade_txn_credit_account_id_fkey" FOREIGN KEY ("credit_account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocation_to_purpose_bucket" ADD CONSTRAINT "allocation_to_purpose_bucket_income_data_id_fkey" FOREIGN KEY ("income_data_id") REFERENCES "income_txn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_replacement_in_purpose_bucket" ADD CONSTRAINT "asset_replacement_in_purpose_bucket_purpose_bucket_id_fkey" FOREIGN KEY ("purpose_bucket_id") REFERENCES "purpose_bucket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_replacement_in_purpose_bucket" ADD CONSTRAINT "asset_replacement_in_purpose_bucket_asset_trade_data_id_fkey" FOREIGN KEY ("asset_trade_data_id") REFERENCES "asset_trade_txn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
