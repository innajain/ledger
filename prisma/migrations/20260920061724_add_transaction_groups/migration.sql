-- CreateTable
CREATE TABLE "transaction_group" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transaction_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_group_member" (
    "transaction_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transaction_group_member_pkey" PRIMARY KEY ("transaction_id","group_id")
);

-- CreateIndex
CREATE INDEX "transaction_group_user_id_idx" ON "transaction_group"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "transaction_group_name_user_id_key" ON "transaction_group"("name", "user_id");

-- CreateIndex
CREATE INDEX "transaction_group_member_group_id_idx" ON "transaction_group_member"("group_id");

-- AddForeignKey
ALTER TABLE "transaction_group" ADD CONSTRAINT "transaction_group_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_group_member" ADD CONSTRAINT "transaction_group_member_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_group_member" ADD CONSTRAINT "transaction_group_member_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "transaction_group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
