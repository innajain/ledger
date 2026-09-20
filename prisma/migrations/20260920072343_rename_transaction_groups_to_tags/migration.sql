/*
  Warnings:

  - You are about to drop the `transaction_group` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `transaction_group_member` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "transaction_group" DROP CONSTRAINT "transaction_group_user_id_fkey";

-- DropForeignKey
ALTER TABLE "transaction_group_member" DROP CONSTRAINT "transaction_group_member_group_id_fkey";

-- DropForeignKey
ALTER TABLE "transaction_group_member" DROP CONSTRAINT "transaction_group_member_transaction_id_fkey";

-- DropTable
DROP TABLE "transaction_group";

-- DropTable
DROP TABLE "transaction_group_member";

-- CreateTable
CREATE TABLE "transaction_tag" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transaction_tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_tag_member" (
    "transaction_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transaction_tag_member_pkey" PRIMARY KEY ("transaction_id","tag_id")
);

-- CreateIndex
CREATE INDEX "transaction_tag_user_id_idx" ON "transaction_tag"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "transaction_tag_name_user_id_key" ON "transaction_tag"("name", "user_id");

-- CreateIndex
CREATE INDEX "transaction_tag_member_tag_id_idx" ON "transaction_tag_member"("tag_id");

-- AddForeignKey
ALTER TABLE "transaction_tag" ADD CONSTRAINT "transaction_tag_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_tag_member" ADD CONSTRAINT "transaction_tag_member_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_tag_member" ADD CONSTRAINT "transaction_tag_member_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "transaction_tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
