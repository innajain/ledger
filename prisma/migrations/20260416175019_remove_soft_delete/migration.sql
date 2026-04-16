/*
  Warnings:

  - You are about to drop the column `deleted_at` on the `transaction` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "transaction" DROP COLUMN "deleted_at";
