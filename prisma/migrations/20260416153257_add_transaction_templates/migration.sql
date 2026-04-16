-- CreateTable
CREATE TABLE "transaction_template" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "transaction_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "line_item_template" (
    "id" TEXT NOT NULL,
    "description" TEXT,
    "transaction_template_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "quantity" DECIMAL(14,4),
    "book_value" DECIMAL(14,4),

    CONSTRAINT "line_item_template_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transaction_template_user_id_idx" ON "transaction_template"("user_id");

-- CreateIndex
CREATE INDEX "line_item_template_transaction_template_id_idx" ON "line_item_template"("transaction_template_id");

-- CreateIndex
CREATE INDEX "line_item_template_account_id_idx" ON "line_item_template"("account_id");

-- CreateIndex
CREATE INDEX "line_item_template_asset_id_idx" ON "line_item_template"("asset_id");

-- AddForeignKey
ALTER TABLE "transaction_template" ADD CONSTRAINT "transaction_template_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "line_item_template" ADD CONSTRAINT "line_item_template_transaction_template_id_fkey" FOREIGN KEY ("transaction_template_id") REFERENCES "transaction_template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "line_item_template" ADD CONSTRAINT "line_item_template_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "line_item_template" ADD CONSTRAINT "line_item_template_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
