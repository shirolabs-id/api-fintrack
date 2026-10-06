-- AlterEnum
BEGIN;
CREATE TYPE "AccountType_new" AS ENUM ('cash', 'bank', 'ewallet', 'credit_card', 'investment', 'other');
ALTER TABLE "Account" ALTER COLUMN "type" TYPE "AccountType_new" USING ("type"::text::"AccountType_new");
ALTER TYPE "AccountType" RENAME TO "AccountType_old";
ALTER TYPE "AccountType_new" RENAME TO "AccountType";
DROP TYPE "public"."AccountType_old";
COMMIT;

-- align AccountType enum with frontend contract
