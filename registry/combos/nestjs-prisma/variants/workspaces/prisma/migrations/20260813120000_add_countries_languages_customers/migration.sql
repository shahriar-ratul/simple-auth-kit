-- CreateTable
CREATE TABLE "countries" (
    "id" BIGSERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "workspace_id" BIGINT NOT NULL,
    "code" VARCHAR(10) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "emoji" VARCHAR(10) NOT NULL,
    "phone_code" VARCHAR(10) NOT NULL,
    "currency" VARCHAR(10) NOT NULL,
    "currency_name" VARCHAR(100) NOT NULL,
    "iso_code" VARCHAR(10) NOT NULL,
    "flag" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" BIGINT,
    "updated_by" BIGINT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMPTZ(6),
    "deleted_by" BIGINT,
    "deleted_reason" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "countries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "languages" (
    "id" BIGSERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "workspace_id" BIGINT NOT NULL,
    "code" VARCHAR(10) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "native_name" VARCHAR(100) NOT NULL,
    "direction" VARCHAR(3) NOT NULL DEFAULT 'ltr',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" BIGINT,
    "updated_by" BIGINT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMPTZ(6),
    "deleted_by" BIGINT,
    "deleted_reason" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "languages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" BIGSERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "workspace_id" BIGINT NOT NULL,
    "first_name" VARCHAR(100),
    "last_name" VARCHAR(100),
    "username" VARCHAR(100),
    "email" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(100),
    "dob" DATE,
    "gender" VARCHAR(10),
    "joined_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "photo" TEXT,
    "is_email_verified" BOOLEAN NOT NULL DEFAULT false,
    "is_phone_verified" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" BIGINT,
    "updated_by" BIGINT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMPTZ(6),
    "deleted_by" BIGINT,
    "deleted_reason" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "countries_uuid_key" ON "countries"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "countries_workspace_id_code_key" ON "countries"("workspace_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "countries_workspace_id_iso_code_key" ON "countries"("workspace_id", "iso_code");

-- CreateIndex
CREATE INDEX "countries_is_active_idx" ON "countries"("is_active");

-- CreateIndex
CREATE INDEX "countries_is_deleted_idx" ON "countries"("is_deleted");

-- CreateIndex
CREATE UNIQUE INDEX "languages_uuid_key" ON "languages"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "languages_workspace_id_code_key" ON "languages"("workspace_id", "code");

-- CreateIndex
CREATE INDEX "languages_is_active_idx" ON "languages"("is_active");

-- CreateIndex
CREATE INDEX "languages_is_deleted_idx" ON "languages"("is_deleted");

-- CreateIndex
CREATE UNIQUE INDEX "customers_uuid_key" ON "customers"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "customers_workspace_id_username_key" ON "customers"("workspace_id", "username");

-- CreateIndex
CREATE UNIQUE INDEX "customers_workspace_id_email_key" ON "customers"("workspace_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "customers_workspace_id_phone_key" ON "customers"("workspace_id", "phone");

-- CreateIndex
CREATE INDEX "customers_is_active_idx" ON "customers"("is_active");

-- CreateIndex
CREATE INDEX "customers_is_deleted_idx" ON "customers"("is_deleted");

-- AddForeignKey
ALTER TABLE "countries" ADD CONSTRAINT "countries_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "countries" ADD CONSTRAINT "countries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "countries" ADD CONSTRAINT "countries_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "countries" ADD CONSTRAINT "countries_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "languages" ADD CONSTRAINT "languages_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "languages" ADD CONSTRAINT "languages_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "languages" ADD CONSTRAINT "languages_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "languages" ADD CONSTRAINT "languages_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
