-- CreateTable
CREATE TABLE "mcp_attachment_upload" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mcp_attachment_upload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mcp_attachment_upload_token_hash_key" ON "mcp_attachment_upload"("token_hash");

-- CreateIndex
CREATE INDEX "mcp_attachment_upload_user_id_idx" ON "mcp_attachment_upload"("user_id");

-- CreateIndex
CREATE INDEX "mcp_attachment_upload_transaction_id_idx" ON "mcp_attachment_upload"("transaction_id");

-- CreateIndex
CREATE INDEX "mcp_attachment_upload_expires_at_idx" ON "mcp_attachment_upload"("expires_at");

-- AddForeignKey
ALTER TABLE "mcp_attachment_upload" ADD CONSTRAINT "mcp_attachment_upload_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_attachment_upload" ADD CONSTRAINT "mcp_attachment_upload_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
