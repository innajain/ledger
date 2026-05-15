-- CreateTable
CREATE TABLE "server_metric" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "route" TEXT NOT NULL,
    "total_ms" INTEGER NOT NULL,
    "db_query_count" INTEGER NOT NULL DEFAULT 0,
    "db_query_ms" INTEGER NOT NULL DEFAULT 0,
    "redis_hits" INTEGER NOT NULL DEFAULT 0,
    "redis_misses" INTEGER NOT NULL DEFAULT 0,
    "redis_ms" INTEGER NOT NULL DEFAULT 0,
    "external_count" INTEGER NOT NULL DEFAULT 0,
    "external_ms" INTEGER NOT NULL DEFAULT 0,
    "compute_ms" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "server_metric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slow_query" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "model" TEXT,
    "action" TEXT,
    "duration_ms" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "slow_query_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "web_vital" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "rating" TEXT,
    "navigation_type" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "web_vital_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "server_metric_created_at_idx" ON "server_metric"("created_at");

-- CreateIndex
CREATE INDEX "server_metric_route_created_at_idx" ON "server_metric"("route", "created_at");

-- CreateIndex
CREATE INDEX "slow_query_request_id_idx" ON "slow_query"("request_id");

-- CreateIndex
CREATE INDEX "slow_query_duration_ms_idx" ON "slow_query"("duration_ms");

-- CreateIndex
CREATE INDEX "slow_query_created_at_idx" ON "slow_query"("created_at");

-- CreateIndex
CREATE INDEX "web_vital_request_id_idx" ON "web_vital"("request_id");

-- CreateIndex
CREATE INDEX "web_vital_name_created_at_idx" ON "web_vital"("name", "created_at");

-- AddForeignKey
ALTER TABLE "slow_query" ADD CONSTRAINT "slow_query_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "server_metric"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web_vital" ADD CONSTRAINT "web_vital_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "server_metric"("id") ON DELETE CASCADE ON UPDATE CASCADE;
