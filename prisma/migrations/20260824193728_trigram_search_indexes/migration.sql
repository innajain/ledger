-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateIndex
CREATE INDEX "line_item_description_idx" ON "line_item" USING GIN ("description" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "transaction_description_idx" ON "transaction" USING GIN ("description" gin_trgm_ops);
