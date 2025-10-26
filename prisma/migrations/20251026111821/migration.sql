/*
  Warnings:

  - A unique constraint covering the columns `[name]` on the table `purpose_bucket` will be added. If there are existing duplicate values, this will fail.
  - Made the column `name` on table `purpose_bucket` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "purpose_bucket" ALTER COLUMN "name" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "purpose_bucket_name_key" ON "purpose_bucket"("name");
