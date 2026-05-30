-- CreateEnum
CREATE TYPE "pending_status" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "pending_kind" AS ENUM ('change', 'deletion');

-- AlterTable
ALTER TABLE "accounting_head" ADD COLUMN     "linked_user_id" TEXT;

-- CreateTable
CREATE TABLE "transaction_link" (
    "id" TEXT NOT NULL,
    "user_a_id" TEXT NOT NULL,
    "user_b_id" TEXT NOT NULL,
    "txn_a_id" TEXT,
    "txn_b_id" TEXT,
    "pending_status" "pending_status" NOT NULL DEFAULT 'pending',
    "pending_kind" "pending_kind",
    "pending_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transaction_link_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transaction_link_pending_by_pending_status_idx" ON "transaction_link"("pending_by", "pending_status");

-- CreateIndex
CREATE INDEX "transaction_link_user_a_id_idx" ON "transaction_link"("user_a_id");

-- CreateIndex
CREATE INDEX "transaction_link_user_b_id_idx" ON "transaction_link"("user_b_id");

-- CreateIndex
CREATE UNIQUE INDEX "transaction_link_txn_a_id_user_b_id_key" ON "transaction_link"("txn_a_id", "user_b_id");

-- CreateIndex
CREATE INDEX "accounting_head_user_id_linked_user_id_idx" ON "accounting_head"("user_id", "linked_user_id");

-- AddForeignKey
ALTER TABLE "accounting_head" ADD CONSTRAINT "accounting_head_linked_user_id_fkey" FOREIGN KEY ("linked_user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_link" ADD CONSTRAINT "transaction_link_user_a_id_fkey" FOREIGN KEY ("user_a_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_link" ADD CONSTRAINT "transaction_link_user_b_id_fkey" FOREIGN KEY ("user_b_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_link" ADD CONSTRAINT "transaction_link_txn_a_id_fkey" FOREIGN KEY ("txn_a_id") REFERENCES "transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_link" ADD CONSTRAINT "transaction_link_txn_b_id_fkey" FOREIGN KEY ("txn_b_id") REFERENCES "transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
