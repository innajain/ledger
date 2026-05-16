/*
  Warnings:

  - Added the required column `url` to the `transaction_attachment` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "transaction_attachment" ADD COLUMN     "url" TEXT NOT NULL;
