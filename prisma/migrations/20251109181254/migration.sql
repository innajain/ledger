-- CreateEnum
CREATE TYPE "transaction_type" AS ENUM ('expense', 'income', 'self_transfer', 'refundable', 'refund', 'asset_trade');

-- CreateEnum
CREATE TYPE "asset_type" AS ENUM ('rupees', 'mf', 'etf', 'other');

-- CreateEnum
CREATE TYPE "manual_allocation_type" AS ENUM ('allocate', 'deallocate');

-- CreateTable
CREATE TABLE "asset" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "asset_type" NOT NULL,
    "code" TEXT,

    CONSTRAINT "asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opening_balance" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "account_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,

    CONSTRAINT "opening_balance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "type" "transaction_type",

    CONSTRAINT "transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "income_txn" (
    "id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "income_txn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "allocation_to_purpose_bucket" (
    "id" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "purpose_bucket_id" TEXT NOT NULL,
    "income_txn_id" TEXT,
    "opening_balance_id" TEXT,

    CONSTRAINT "allocation_to_purpose_bucket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_txn" (
    "id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "purpose_bucket_id" TEXT NOT NULL,

    CONSTRAINT "expense_txn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "self_transfer_or_refundable_or_refund_txn" (
    "id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "from_account_id" TEXT NOT NULL,
    "to_account_id" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "self_transfer_or_refundable_or_refund_txn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_trade_txn" (
    "id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "debit_asset_id" TEXT NOT NULL,
    "debit_account_id" TEXT NOT NULL,
    "debit_quantity" DOUBLE PRECISION NOT NULL,
    "credit_asset_id" TEXT NOT NULL,
    "credit_account_id" TEXT NOT NULL,
    "credit_quantity" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "asset_trade_txn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_replacement_in_purpose_bucket" (
    "id" TEXT NOT NULL,
    "purpose_bucket_id" TEXT NOT NULL,
    "asset_trade_txn_id" TEXT NOT NULL,
    "debit_quantity" DOUBLE PRECISION NOT NULL,
    "credit_quantity" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "asset_replacement_in_purpose_bucket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purpose_bucket" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "purpose_bucket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_reallocation_between_purpose_buckets" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "from_purpose_bucket_id" TEXT NOT NULL,
    "to_purpose_bucket_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "asset_reallocation_between_purpose_buckets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "asset_id_key" ON "asset"("id");

-- CreateIndex
CREATE UNIQUE INDEX "asset_name_key" ON "asset"("name");

-- CreateIndex
CREATE UNIQUE INDEX "account_id_key" ON "account"("id");

-- CreateIndex
CREATE UNIQUE INDEX "account_name_key" ON "account"("name");

-- CreateIndex
CREATE UNIQUE INDEX "opening_balance_id_key" ON "opening_balance"("id");

-- CreateIndex
CREATE UNIQUE INDEX "opening_balance_account_id_asset_id_key" ON "opening_balance"("account_id", "asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "transaction_id_key" ON "transaction"("id");

-- CreateIndex
CREATE UNIQUE INDEX "income_txn_id_key" ON "income_txn"("id");

-- CreateIndex
CREATE UNIQUE INDEX "income_txn_transaction_id_key" ON "income_txn"("transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "allocation_to_purpose_bucket_id_key" ON "allocation_to_purpose_bucket"("id");

-- CreateIndex
CREATE UNIQUE INDEX "allocation_to_purpose_bucket_purpose_bucket_id_income_txn_i_key" ON "allocation_to_purpose_bucket"("purpose_bucket_id", "income_txn_id");

-- CreateIndex
CREATE UNIQUE INDEX "allocation_to_purpose_bucket_purpose_bucket_id_opening_bala_key" ON "allocation_to_purpose_bucket"("purpose_bucket_id", "opening_balance_id");

-- CreateIndex
CREATE UNIQUE INDEX "expense_txn_id_key" ON "expense_txn"("id");

-- CreateIndex
CREATE UNIQUE INDEX "expense_txn_transaction_id_key" ON "expense_txn"("transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "self_transfer_or_refundable_or_refund_txn_id_key" ON "self_transfer_or_refundable_or_refund_txn"("id");

-- CreateIndex
CREATE UNIQUE INDEX "self_transfer_or_refundable_or_refund_txn_transaction_id_key" ON "self_transfer_or_refundable_or_refund_txn"("transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "asset_trade_txn_id_key" ON "asset_trade_txn"("id");

-- CreateIndex
CREATE UNIQUE INDEX "asset_trade_txn_transaction_id_key" ON "asset_trade_txn"("transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "asset_replacement_in_purpose_bucket_id_key" ON "asset_replacement_in_purpose_bucket"("id");

-- CreateIndex
CREATE UNIQUE INDEX "purpose_bucket_id_key" ON "purpose_bucket"("id");

-- CreateIndex
CREATE UNIQUE INDEX "purpose_bucket_name_key" ON "purpose_bucket"("name");

-- CreateIndex
CREATE UNIQUE INDEX "asset_reallocation_between_purpose_buckets_id_key" ON "asset_reallocation_between_purpose_buckets"("id");

-- AddForeignKey
ALTER TABLE "opening_balance" ADD CONSTRAINT "opening_balance_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_balance" ADD CONSTRAINT "opening_balance_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "income_txn" ADD CONSTRAINT "income_txn_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "income_txn" ADD CONSTRAINT "income_txn_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "income_txn" ADD CONSTRAINT "income_txn_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocation_to_purpose_bucket" ADD CONSTRAINT "allocation_to_purpose_bucket_purpose_bucket_id_fkey" FOREIGN KEY ("purpose_bucket_id") REFERENCES "purpose_bucket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocation_to_purpose_bucket" ADD CONSTRAINT "allocation_to_purpose_bucket_income_txn_id_fkey" FOREIGN KEY ("income_txn_id") REFERENCES "income_txn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocation_to_purpose_bucket" ADD CONSTRAINT "allocation_to_purpose_bucket_opening_balance_id_fkey" FOREIGN KEY ("opening_balance_id") REFERENCES "opening_balance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_txn" ADD CONSTRAINT "expense_txn_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_txn" ADD CONSTRAINT "expense_txn_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_txn" ADD CONSTRAINT "expense_txn_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_txn" ADD CONSTRAINT "expense_txn_purpose_bucket_id_fkey" FOREIGN KEY ("purpose_bucket_id") REFERENCES "purpose_bucket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "self_transfer_or_refundable_or_refund_txn" ADD CONSTRAINT "self_transfer_or_refundable_or_refund_txn_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "self_transfer_or_refundable_or_refund_txn" ADD CONSTRAINT "self_transfer_or_refundable_or_refund_txn_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "self_transfer_or_refundable_or_refund_txn" ADD CONSTRAINT "self_transfer_or_refundable_or_refund_txn_from_account_id_fkey" FOREIGN KEY ("from_account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "self_transfer_or_refundable_or_refund_txn" ADD CONSTRAINT "self_transfer_or_refundable_or_refund_txn_to_account_id_fkey" FOREIGN KEY ("to_account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_trade_txn" ADD CONSTRAINT "asset_trade_txn_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_trade_txn" ADD CONSTRAINT "asset_trade_txn_debit_asset_id_fkey" FOREIGN KEY ("debit_asset_id") REFERENCES "asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_trade_txn" ADD CONSTRAINT "asset_trade_txn_debit_account_id_fkey" FOREIGN KEY ("debit_account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_trade_txn" ADD CONSTRAINT "asset_trade_txn_credit_asset_id_fkey" FOREIGN KEY ("credit_asset_id") REFERENCES "asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_trade_txn" ADD CONSTRAINT "asset_trade_txn_credit_account_id_fkey" FOREIGN KEY ("credit_account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_replacement_in_purpose_bucket" ADD CONSTRAINT "asset_replacement_in_purpose_bucket_purpose_bucket_id_fkey" FOREIGN KEY ("purpose_bucket_id") REFERENCES "purpose_bucket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_replacement_in_purpose_bucket" ADD CONSTRAINT "asset_replacement_in_purpose_bucket_asset_trade_txn_id_fkey" FOREIGN KEY ("asset_trade_txn_id") REFERENCES "asset_trade_txn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_reallocation_between_purpose_buckets" ADD CONSTRAINT "asset_reallocation_between_purpose_buckets_from_purpose_bu_fkey" FOREIGN KEY ("from_purpose_bucket_id") REFERENCES "purpose_bucket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_reallocation_between_purpose_buckets" ADD CONSTRAINT "asset_reallocation_between_purpose_buckets_to_purpose_buck_fkey" FOREIGN KEY ("to_purpose_bucket_id") REFERENCES "purpose_bucket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_reallocation_between_purpose_buckets" ADD CONSTRAINT "asset_reallocation_between_purpose_buckets_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
