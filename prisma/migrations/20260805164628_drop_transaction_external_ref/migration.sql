/*
  Warnings:

  - You are about to drop the column `external_ref` on the `transaction` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "transaction" DROP COLUMN "external_ref";
