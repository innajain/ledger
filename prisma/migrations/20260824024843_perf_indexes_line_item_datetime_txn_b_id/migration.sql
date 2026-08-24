-- CreateIndex
CREATE INDEX "line_item_datetime_idx" ON "line_item"("datetime");

-- CreateIndex
CREATE INDEX "transaction_link_txn_b_id_idx" ON "transaction_link"("txn_b_id");
