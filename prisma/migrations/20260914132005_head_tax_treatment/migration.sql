-- CreateEnum
CREATE TYPE "tax_treatment" AS ENUM ('salary_17_1', 'perquisite_17_2', 'exempt', 'other_sources', 'stcg_slab', 'stcg_111a', 'ltcg_112a', 'gift_56_2_x', 'tax_paid', 'not_income');

-- AlterTable
ALTER TABLE "accounting_head" ADD COLUMN     "tax_treatment" "tax_treatment";
