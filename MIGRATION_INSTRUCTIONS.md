# Database Migration Instructions

A new migration has been created to add the `is_active` field to `account` and `asset` tables.

## Migration Location
`prisma/migrations/20260111135205_add_is_active_field/migration.sql`

## To Apply the Migration

Run the following command with your production database URL:

```bash
export DATABASE_URL="your-production-database-url-here"
pnpm prisma migrate deploy
```

Or if the environment cannot connect to the database, you can manually run the SQL:

```sql
ALTER TABLE "account" ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "asset" ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;
```

Then mark the migration as applied:
```bash
pnpm prisma migrate resolve --applied add_is_active_field
```

## What This Migration Does
- Adds `is_active` boolean column to `account` table with default value `true`
- Adds `is_active` boolean column to `asset` table with default value `true`
- All existing records will have `is_active = true` by default
