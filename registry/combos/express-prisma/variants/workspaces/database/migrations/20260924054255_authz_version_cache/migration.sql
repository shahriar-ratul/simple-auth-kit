-- CreateTable
CREATE TABLE "authz_version" (
    "id" SMALLINT NOT NULL,
    "version" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "authz_version_pkey" PRIMARY KEY ("id")
);
