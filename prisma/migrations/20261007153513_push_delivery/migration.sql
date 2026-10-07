-- CreateTable
CREATE TABLE "push_delivery" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "recipient_id" TEXT NOT NULL,
    "sender_id" TEXT,
    "kind" TEXT NOT NULL,
    "subscription_id" TEXT,
    "sent_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "failed_status" INTEGER,
    "delivered_at" TIMESTAMP(3),
    "opened_at" TIMESTAMP(3),

    CONSTRAINT "push_delivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "push_delivery_token_key" ON "push_delivery"("token");

-- CreateIndex
CREATE INDEX "push_delivery_sender_id_recipient_id_sent_at_idx" ON "push_delivery"("sender_id", "recipient_id", "sent_at");

-- CreateIndex
CREATE INDEX "push_delivery_recipient_id_sent_at_idx" ON "push_delivery"("recipient_id", "sent_at");

-- AddForeignKey
ALTER TABLE "push_delivery" ADD CONSTRAINT "push_delivery_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_delivery" ADD CONSTRAINT "push_delivery_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "push_subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
