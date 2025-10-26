-- DropForeignKey
ALTER TABLE "public"."allocation_to_purpose_bucket" DROP CONSTRAINT "allocation_to_purpose_bucket_income_data_id_fkey";

-- AlterTable
ALTER TABLE "allocation_to_purpose_bucket" ADD COLUMN     "account_id" TEXT,
ALTER COLUMN "income_data_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "allocation_to_purpose_bucket" ADD CONSTRAINT "allocation_to_purpose_bucket_income_data_id_fkey" FOREIGN KEY ("income_data_id") REFERENCES "income_data"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocation_to_purpose_bucket" ADD CONSTRAINT "allocation_to_purpose_bucket_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
