/*
  Warnings:

  - The `type` column on the `transaction` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Added the required column `date` to the `opening_balance` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "transaction_type" AS ENUM ('expense', 'income', 'self_transfer', 'refundable', 'refund', 'asset_trade');

-- AlterTable
ALTER TABLE "opening_balance" ADD COLUMN     "date" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "transaction" DROP COLUMN "type",
ADD COLUMN     "type" "transaction_type";

-- DropEnum
DROP TYPE "public"."transaction_types";
