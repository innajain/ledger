-- CreateTable
CREATE TABLE "transaction_attachment" (
    "id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "pathname" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "content_type" TEXT,
    "size" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transaction_attachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transaction_attachment_transaction_id_idx" ON "transaction_attachment"("transaction_id");

-- AddForeignKey
ALTER TABLE "transaction_attachment" ADD CONSTRAINT "transaction_attachment_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
