/*
  Warnings:

  - You are about to drop the column `user_id` on the `asset` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[name]` on the table `asset` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "asset" DROP CONSTRAINT "asset_user_id_fkey";

-- DropIndex
DROP INDEX "asset_name_user_id_key";

-- DropIndex
DROP INDEX "asset_user_id_idx";

-- DropIndex
DROP INDEX "asset_user_id_parent_id_order_index_idx";

-- AlterTable
ALTER TABLE "asset" DROP COLUMN "user_id";

-- CreateIndex
CREATE UNIQUE INDEX "asset_name_key" ON "asset"("name");

-- CreateIndex
CREATE INDEX "asset_parent_id_order_index_idx" ON "asset"("parent_id", "order_index");
