-- CreateEnum
CREATE TYPE "transaction_types" AS ENUM ('expense', 'income', 'self_transfer', 'refundable', 'refund', 'asset_trade');

-- CreateEnum
CREATE TYPE "asset_type" AS ENUM ('rupees', 'mf', 'etf', 'other');

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
    "assetId" TEXT NOT NULL,
    "opening_balance" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction" (
    "id" TEXT NOT NULL,
    "description" TEXT,
    "type" "transaction_types",

    CONSTRAINT "transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "income_data" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "to_account_id" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "income_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_data" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "from_account_id" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "purpose_bucket_id" TEXT NOT NULL,

    CONSTRAINT "expense_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "self_transfer_and_refundable_and_refund_data" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "from_account_id" TEXT NOT NULL,
    "to_account_id" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "self_transfer_and_refundable_and_refund_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_trade_data" (
    "id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "debit_account_id" TEXT NOT NULL,
    "debit_quantity" DOUBLE PRECISION NOT NULL,
    "debit_date" TIMESTAMP(3) NOT NULL,
    "credit_account_id" TEXT NOT NULL,
    "credit_quantity" DOUBLE PRECISION NOT NULL,
    "credit_date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_trade_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purpose_bucket" (
    "id" TEXT NOT NULL,
    "name" TEXT,

    CONSTRAINT "purpose_bucket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "allocation_to_purpose_bucket" (
    "id" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "purpose_bucket_id" TEXT NOT NULL,
    "income_data_id" TEXT NOT NULL,

    CONSTRAINT "allocation_to_purpose_bucket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_replacement_in_purpose_bucket" (
    "id" TEXT NOT NULL,
    "asset_trade_data_id" TEXT NOT NULL,
    "old_asset_quantity" DOUBLE PRECISION NOT NULL,
    "new_asset_quantity" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "asset_replacement_in_purpose_bucket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purpose_bucket_reallocation" (
    "id" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "debit_purpose_bucket_id" TEXT NOT NULL,
    "credit_purpose_bucket_id" TEXT NOT NULL,

    CONSTRAINT "purpose_bucket_reallocation_pkey" PRIMARY KEY ("id")
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
CREATE UNIQUE INDEX "transaction_id_key" ON "transaction"("id");

-- CreateIndex
CREATE UNIQUE INDEX "income_data_id_key" ON "income_data"("id");

-- CreateIndex
CREATE UNIQUE INDEX "income_data_transaction_id_key" ON "income_data"("transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "expense_data_id_key" ON "expense_data"("id");

-- CreateIndex
CREATE UNIQUE INDEX "expense_data_transaction_id_key" ON "expense_data"("transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "self_transfer_and_refundable_and_refund_data_id_key" ON "self_transfer_and_refundable_and_refund_data"("id");

-- CreateIndex
CREATE UNIQUE INDEX "self_transfer_and_refundable_and_refund_data_transaction_id_key" ON "self_transfer_and_refundable_and_refund_data"("transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "asset_trade_data_id_key" ON "asset_trade_data"("id");

-- CreateIndex
CREATE UNIQUE INDEX "asset_trade_data_transaction_id_key" ON "asset_trade_data"("transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "purpose_bucket_id_key" ON "purpose_bucket"("id");

-- CreateIndex
CREATE UNIQUE INDEX "allocation_to_purpose_bucket_id_key" ON "allocation_to_purpose_bucket"("id");

-- CreateIndex
CREATE UNIQUE INDEX "asset_replacement_in_purpose_bucket_id_key" ON "asset_replacement_in_purpose_bucket"("id");

-- CreateIndex
CREATE UNIQUE INDEX "purpose_bucket_reallocation_id_key" ON "purpose_bucket_reallocation"("id");

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "income_data" ADD CONSTRAINT "income_data_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "income_data" ADD CONSTRAINT "income_data_to_account_id_fkey" FOREIGN KEY ("to_account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_data" ADD CONSTRAINT "expense_data_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_data" ADD CONSTRAINT "expense_data_from_account_id_fkey" FOREIGN KEY ("from_account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_data" ADD CONSTRAINT "expense_data_purpose_bucket_id_fkey" FOREIGN KEY ("purpose_bucket_id") REFERENCES "purpose_bucket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "self_transfer_and_refundable_and_refund_data" ADD CONSTRAINT "self_transfer_and_refundable_and_refund_data_transaction_i_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "self_transfer_and_refundable_and_refund_data" ADD CONSTRAINT "self_transfer_and_refundable_and_refund_data_from_account__fkey" FOREIGN KEY ("from_account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "self_transfer_and_refundable_and_refund_data" ADD CONSTRAINT "self_transfer_and_refundable_and_refund_data_to_account_id_fkey" FOREIGN KEY ("to_account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_trade_data" ADD CONSTRAINT "asset_trade_data_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_trade_data" ADD CONSTRAINT "asset_trade_data_debit_account_id_fkey" FOREIGN KEY ("debit_account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_trade_data" ADD CONSTRAINT "asset_trade_data_credit_account_id_fkey" FOREIGN KEY ("credit_account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocation_to_purpose_bucket" ADD CONSTRAINT "allocation_to_purpose_bucket_purpose_bucket_id_fkey" FOREIGN KEY ("purpose_bucket_id") REFERENCES "purpose_bucket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocation_to_purpose_bucket" ADD CONSTRAINT "allocation_to_purpose_bucket_income_data_id_fkey" FOREIGN KEY ("income_data_id") REFERENCES "income_data"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_replacement_in_purpose_bucket" ADD CONSTRAINT "asset_replacement_in_purpose_bucket_asset_trade_data_id_fkey" FOREIGN KEY ("asset_trade_data_id") REFERENCES "asset_trade_data"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purpose_bucket_reallocation" ADD CONSTRAINT "purpose_bucket_reallocation_debit_purpose_bucket_id_fkey" FOREIGN KEY ("debit_purpose_bucket_id") REFERENCES "purpose_bucket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purpose_bucket_reallocation" ADD CONSTRAINT "purpose_bucket_reallocation_credit_purpose_bucket_id_fkey" FOREIGN KEY ("credit_purpose_bucket_id") REFERENCES "purpose_bucket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
