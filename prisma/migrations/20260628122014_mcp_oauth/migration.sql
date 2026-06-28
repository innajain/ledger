-- CreateTable
CREATE TABLE "mcp_oauth_client" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "client_secret" TEXT,
    "client_name" TEXT,
    "redirect_uris" TEXT[],
    "scope" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mcp_oauth_client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mcp_oauth_code" (
    "id" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "redirect_uri" TEXT NOT NULL,
    "code_challenge" TEXT NOT NULL,
    "code_challenge_method" TEXT NOT NULL,
    "scope" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mcp_oauth_code_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mcp_access_token" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "refresh_token_hash" TEXT,
    "client_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "scope" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "refresh_expires_at" TIMESTAMP(3),
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),

    CONSTRAINT "mcp_access_token_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mcp_oauth_client_client_id_key" ON "mcp_oauth_client"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "mcp_oauth_code_code_hash_key" ON "mcp_oauth_code"("code_hash");

-- CreateIndex
CREATE INDEX "mcp_oauth_code_client_id_idx" ON "mcp_oauth_code"("client_id");

-- CreateIndex
CREATE INDEX "mcp_oauth_code_user_id_idx" ON "mcp_oauth_code"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "mcp_access_token_token_hash_key" ON "mcp_access_token"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "mcp_access_token_refresh_token_hash_key" ON "mcp_access_token"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "mcp_access_token_client_id_idx" ON "mcp_access_token"("client_id");

-- CreateIndex
CREATE INDEX "mcp_access_token_user_id_idx" ON "mcp_access_token"("user_id");

-- AddForeignKey
ALTER TABLE "mcp_oauth_code" ADD CONSTRAINT "mcp_oauth_code_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "mcp_oauth_client"("client_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_oauth_code" ADD CONSTRAINT "mcp_oauth_code_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_access_token" ADD CONSTRAINT "mcp_access_token_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "mcp_oauth_client"("client_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_access_token" ADD CONSTRAINT "mcp_access_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
