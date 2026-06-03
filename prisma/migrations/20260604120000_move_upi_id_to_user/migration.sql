-- Add the user-level UPI handle.
ALTER TABLE "user" ADD COLUMN "upi_id" TEXT;

-- Move any per-account UPI up to the linked user. Under the old model an
-- account linked to user X held X's VPA, so X now owns it on their profile.
-- Takes one value per user (arbitrary if several); UPIs on unlinked accounts
-- have no target user and are dropped with the column below.
UPDATE "user" u
SET "upi_id" = ah."upi_id"
FROM "accounting_head" ah
WHERE ah."linked_user_id" = u."id"
  AND ah."upi_id" IS NOT NULL
  AND u."upi_id" IS NULL;

-- Drop the per-account UPI column (now sourced from the linked user's profile).
ALTER TABLE "accounting_head" DROP COLUMN "upi_id";
