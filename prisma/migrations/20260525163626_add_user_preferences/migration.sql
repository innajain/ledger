-- AlterTable
ALTER TABLE "user" ADD COLUMN     "graphs_visible" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mask_threshold" INTEGER NOT NULL DEFAULT 50000,
ADD COLUMN     "masking_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "theme" TEXT NOT NULL DEFAULT 'system';
