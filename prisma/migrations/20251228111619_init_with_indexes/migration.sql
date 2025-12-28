-- CreateEnum
CREATE TYPE "account_type" AS ENUM ('real', 'nominal', 'allocation');

-- CreateEnum
CREATE TYPE "asset_type" AS ENUM ('rupees', 'mf', 'etf', 'shares', 'other');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "account_type" NOT NULL,
    "parent_id" TEXT,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "asset_type" NOT NULL,
    "ticker" TEXT,
    "parent_id" TEXT,

    CONSTRAINT "asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "datetime" TIMESTAMP(3) NOT NULL,
    "description" TEXT,

    CONSTRAINT "transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "line_item" (
    "id" TEXT NOT NULL,
    "description" TEXT,
    "datetime" TIMESTAMP(3),
    "transaction_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "book_value" DECIMAL(14,4),

    CONSTRAINT "line_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_username_key" ON "user"("username");

-- CreateIndex
CREATE INDEX "account_user_id_type_idx" ON "account"("user_id", "type");

-- CreateIndex
CREATE INDEX "account_parent_id_idx" ON "account"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "account_name_user_id_key" ON "account"("name", "user_id");

-- CreateIndex
CREATE INDEX "asset_user_id_idx" ON "asset"("user_id");

-- CreateIndex
CREATE INDEX "asset_parent_id_idx" ON "asset"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "asset_name_user_id_key" ON "asset"("name", "user_id");

-- CreateIndex
CREATE INDEX "transaction_user_id_idx" ON "transaction"("user_id");

-- CreateIndex
CREATE INDEX "transaction_datetime_idx" ON "transaction"("datetime");

-- CreateIndex
CREATE INDEX "line_item_transaction_id_idx" ON "line_item"("transaction_id");

-- CreateIndex
CREATE INDEX "line_item_account_id_idx" ON "line_item"("account_id");

-- CreateIndex
CREATE INDEX "line_item_asset_id_idx" ON "line_item"("asset_id");

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset" ADD CONSTRAINT "asset_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset" ADD CONSTRAINT "asset_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "line_item" ADD CONSTRAINT "line_item_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "line_item" ADD CONSTRAINT "line_item_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "line_item" ADD CONSTRAINT "line_item_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
