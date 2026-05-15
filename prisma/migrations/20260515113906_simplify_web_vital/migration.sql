/*
  Warnings:

  - You are about to drop the column `request_id` on the `web_vital` table. All the data in the column will be lost.
  - Added the required column `route` to the `web_vital` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "web_vital" DROP CONSTRAINT "web_vital_request_id_fkey";

-- DropIndex
DROP INDEX "web_vital_name_created_at_idx";

-- DropIndex
DROP INDEX "web_vital_request_id_idx";

-- AlterTable
ALTER TABLE "web_vital" DROP COLUMN "request_id",
ADD COLUMN     "route" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "web_vital_route_name_created_at_idx" ON "web_vital"("route", "name", "created_at");

-- CreateIndex
CREATE INDEX "web_vital_created_at_idx" ON "web_vital"("created_at");
