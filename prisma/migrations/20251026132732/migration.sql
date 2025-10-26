-- CreateTable
CREATE TABLE "asset_reallocation_between_purpose_buckets" (
    "id" TEXT NOT NULL,
    "from_purpose_bucket_id" TEXT NOT NULL,
    "to_purpose_bucket_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_reallocation_between_purpose_buckets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "asset_reallocation_between_purpose_buckets_id_key" ON "asset_reallocation_between_purpose_buckets"("id");

-- AddForeignKey
ALTER TABLE "asset_reallocation_between_purpose_buckets" ADD CONSTRAINT "asset_reallocation_between_purpose_buckets_from_purpose_bu_fkey" FOREIGN KEY ("from_purpose_bucket_id") REFERENCES "purpose_bucket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_reallocation_between_purpose_buckets" ADD CONSTRAINT "asset_reallocation_between_purpose_buckets_to_purpose_buck_fkey" FOREIGN KEY ("to_purpose_bucket_id") REFERENCES "purpose_bucket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_reallocation_between_purpose_buckets" ADD CONSTRAINT "asset_reallocation_between_purpose_buckets_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
