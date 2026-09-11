-- DropForeignKey
ALTER TABLE "oauth_accounts" DROP CONSTRAINT "oauth_accounts_user_id_fkey";

-- DropForeignKey
ALTER TABLE "password_reset_tokens" DROP CONSTRAINT "password_reset_tokens_user_id_fkey";

-- DropForeignKey
ALTER TABLE "permission_member" DROP CONSTRAINT "permission_member_member_id_fkey";

-- DropForeignKey
ALTER TABLE "permission_member" DROP CONSTRAINT "permission_member_permission_id_fkey";

-- DropForeignKey
ALTER TABLE "permission_role" DROP CONSTRAINT "permission_role_permission_id_fkey";

-- DropForeignKey
ALTER TABLE "permission_role" DROP CONSTRAINT "permission_role_role_id_fkey";

-- DropForeignKey
ALTER TABLE "permissions" DROP CONSTRAINT "permissions_created_by_fkey";

-- DropForeignKey
ALTER TABLE "permissions" DROP CONSTRAINT "permissions_deleted_by_fkey";

-- DropForeignKey
ALTER TABLE "permissions" DROP CONSTRAINT "permissions_updated_by_fkey";

-- DropForeignKey
ALTER TABLE "role_member" DROP CONSTRAINT "role_member_member_id_fkey";

-- DropForeignKey
ALTER TABLE "role_member" DROP CONSTRAINT "role_member_role_id_fkey";

-- DropForeignKey
ALTER TABLE "roles" DROP CONSTRAINT "roles_created_by_fkey";

-- DropForeignKey
ALTER TABLE "roles" DROP CONSTRAINT "roles_deleted_by_fkey";

-- DropForeignKey
ALTER TABLE "roles" DROP CONSTRAINT "roles_updated_by_fkey";

-- DropForeignKey
ALTER TABLE "roles" DROP CONSTRAINT "roles_workspace_id_fkey";

-- DropForeignKey
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_created_by_fkey";

-- DropForeignKey
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_deleted_by_fkey";

-- DropForeignKey
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_revoked_by_fkey";

-- DropForeignKey
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_updated_by_fkey";

-- DropForeignKey
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_user_id_fkey";

-- DropForeignKey
ALTER TABLE "two_factor_backup_codes" DROP CONSTRAINT "two_factor_backup_codes_user_id_fkey";

-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_created_by_fkey";

-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_deleted_by_fkey";

-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_updated_by_fkey";

-- DropForeignKey
ALTER TABLE "workspace_members" DROP CONSTRAINT "workspace_members_user_id_fkey";

-- DropForeignKey
ALTER TABLE "workspace_members" DROP CONSTRAINT "workspace_members_workspace_id_fkey";

-- DropForeignKey
ALTER TABLE "workspaces" DROP CONSTRAINT "workspaces_created_by_fkey";

-- DropForeignKey
ALTER TABLE "workspaces" DROP CONSTRAINT "workspaces_deleted_by_fkey";

-- DropForeignKey
ALTER TABLE "workspaces" DROP CONSTRAINT "workspaces_updated_by_fkey";

-- AlterTable
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_pkey",
ADD COLUMN     "uuid" TEXT NOT NULL,
DROP COLUMN "id",
ADD COLUMN     "id" BIGSERIAL NOT NULL,
DROP COLUMN "workspace_id",
ADD COLUMN     "workspace_id" BIGINT,
DROP COLUMN "user_id",
ADD COLUMN     "user_id" BIGINT,
ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "oauth_accounts" DROP CONSTRAINT "oauth_accounts_pkey",
ADD COLUMN     "uuid" TEXT NOT NULL,
DROP COLUMN "id",
ADD COLUMN     "id" BIGSERIAL NOT NULL,
DROP COLUMN "user_id",
ADD COLUMN     "user_id" BIGINT NOT NULL,
ADD CONSTRAINT "oauth_accounts_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "password_reset_tokens" DROP CONSTRAINT "password_reset_tokens_pkey",
ADD COLUMN     "uuid" TEXT NOT NULL,
DROP COLUMN "id",
ADD COLUMN     "id" BIGSERIAL NOT NULL,
DROP COLUMN "user_id",
ADD COLUMN     "user_id" BIGINT NOT NULL,
ADD CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "permission_member" DROP CONSTRAINT "permission_member_pkey",
DROP COLUMN "member_id",
ADD COLUMN     "member_id" BIGINT NOT NULL,
DROP COLUMN "permission_id",
ADD COLUMN     "permission_id" BIGINT NOT NULL,
ADD CONSTRAINT "permission_member_pkey" PRIMARY KEY ("member_id", "permission_id");

-- AlterTable
ALTER TABLE "permission_role" DROP CONSTRAINT "permission_role_pkey",
DROP COLUMN "permission_id",
ADD COLUMN     "permission_id" BIGINT NOT NULL,
DROP COLUMN "role_id",
ADD COLUMN     "role_id" BIGINT NOT NULL,
ADD CONSTRAINT "permission_role_pkey" PRIMARY KEY ("permission_id", "role_id");

-- AlterTable
ALTER TABLE "permissions" DROP CONSTRAINT "permissions_pkey",
ADD COLUMN     "uuid" TEXT NOT NULL,
DROP COLUMN "id",
ADD COLUMN     "id" BIGSERIAL NOT NULL,
DROP COLUMN "created_by",
ADD COLUMN     "created_by" BIGINT,
DROP COLUMN "deleted_by",
ADD COLUMN     "deleted_by" BIGINT,
DROP COLUMN "updated_by",
ADD COLUMN     "updated_by" BIGINT,
ADD CONSTRAINT "permissions_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "role_member" DROP CONSTRAINT "role_member_pkey",
DROP COLUMN "member_id",
ADD COLUMN     "member_id" BIGINT NOT NULL,
DROP COLUMN "role_id",
ADD COLUMN     "role_id" BIGINT NOT NULL,
ADD CONSTRAINT "role_member_pkey" PRIMARY KEY ("member_id", "role_id");

-- AlterTable
ALTER TABLE "roles" DROP CONSTRAINT "roles_pkey",
ADD COLUMN     "uuid" TEXT NOT NULL,
DROP COLUMN "id",
ADD COLUMN     "id" BIGSERIAL NOT NULL,
DROP COLUMN "workspace_id",
ADD COLUMN     "workspace_id" BIGINT NOT NULL,
DROP COLUMN "created_by",
ADD COLUMN     "created_by" BIGINT,
DROP COLUMN "deleted_by",
ADD COLUMN     "deleted_by" BIGINT,
DROP COLUMN "updated_by",
ADD COLUMN     "updated_by" BIGINT,
ADD CONSTRAINT "roles_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_pkey",
ADD COLUMN     "uuid" TEXT NOT NULL,
DROP COLUMN "id",
ADD COLUMN     "id" BIGSERIAL NOT NULL,
DROP COLUMN "user_id",
ADD COLUMN     "user_id" BIGINT NOT NULL,
DROP COLUMN "revoked_by",
ADD COLUMN     "revoked_by" BIGINT,
DROP COLUMN "created_by",
ADD COLUMN     "created_by" BIGINT,
DROP COLUMN "updated_by",
ADD COLUMN     "updated_by" BIGINT,
DROP COLUMN "deleted_by",
ADD COLUMN     "deleted_by" BIGINT,
ADD CONSTRAINT "sessions_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "two_factor_backup_codes" DROP CONSTRAINT "two_factor_backup_codes_pkey",
ADD COLUMN     "uuid" TEXT NOT NULL,
DROP COLUMN "id",
ADD COLUMN     "id" BIGSERIAL NOT NULL,
DROP COLUMN "user_id",
ADD COLUMN     "user_id" BIGINT NOT NULL,
ADD CONSTRAINT "two_factor_backup_codes_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "users" DROP CONSTRAINT "users_pkey",
ADD COLUMN     "uuid" TEXT NOT NULL,
DROP COLUMN "id",
ADD COLUMN     "id" BIGSERIAL NOT NULL,
DROP COLUMN "created_by",
ADD COLUMN     "created_by" BIGINT,
DROP COLUMN "deleted_by",
ADD COLUMN     "deleted_by" BIGINT,
DROP COLUMN "updated_by",
ADD COLUMN     "updated_by" BIGINT,
ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "workspace_members" DROP CONSTRAINT "workspace_members_pkey",
ADD COLUMN     "uuid" TEXT NOT NULL,
DROP COLUMN "id",
ADD COLUMN     "id" BIGSERIAL NOT NULL,
DROP COLUMN "user_id",
ADD COLUMN     "user_id" BIGINT NOT NULL,
DROP COLUMN "workspace_id",
ADD COLUMN     "workspace_id" BIGINT NOT NULL,
ADD CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "workspaces" DROP CONSTRAINT "workspaces_pkey",
ADD COLUMN     "uuid" TEXT NOT NULL,
DROP COLUMN "id",
ADD COLUMN     "id" BIGSERIAL NOT NULL,
DROP COLUMN "created_by",
ADD COLUMN     "created_by" BIGINT,
DROP COLUMN "deleted_by",
ADD COLUMN     "deleted_by" BIGINT,
DROP COLUMN "updated_by",
ADD COLUMN     "updated_by" BIGINT,
ADD CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id");

-- CreateIndex
CREATE UNIQUE INDEX "audit_logs_uuid_key" ON "audit_logs"("uuid");

-- CreateIndex
CREATE INDEX "audit_logs_workspace_created_idx" ON "audit_logs"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_user_created_idx" ON "audit_logs"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_accounts_uuid_key" ON "oauth_accounts"("uuid");

-- CreateIndex
CREATE INDEX "oauth_accounts_user_id_idx" ON "oauth_accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_uuid_key" ON "password_reset_tokens"("uuid");

-- CreateIndex
CREATE INDEX "permission_member_permission_id_idx" ON "permission_member"("permission_id");

-- CreateIndex
CREATE INDEX "permission_role_role_id_idx" ON "permission_role"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_uuid_key" ON "permissions"("uuid");

-- CreateIndex
CREATE INDEX "role_member_role_id_idx" ON "role_member"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_uuid_key" ON "roles"("uuid");

-- CreateIndex
CREATE INDEX "roles_workspace_default_idx" ON "roles"("workspace_id", "is_default");

-- CreateIndex
CREATE UNIQUE INDEX "roles_workspace_id_slug_key" ON "roles"("workspace_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "roles_workspace_id_name_key" ON "roles"("workspace_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_uuid_key" ON "sessions"("uuid");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_user_active_idx" ON "sessions"("user_id", "is_revoked", "expires_at");

-- CreateIndex
CREATE INDEX "sessions_revoked_by_idx" ON "sessions"("revoked_by");

-- CreateIndex
CREATE UNIQUE INDEX "two_factor_backup_codes_uuid_key" ON "two_factor_backup_codes"("uuid");

-- CreateIndex
CREATE INDEX "two_factor_backup_codes_user_id_idx" ON "two_factor_backup_codes"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_uuid_key" ON "users"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_members_uuid_key" ON "workspace_members"("uuid");

-- CreateIndex
CREATE INDEX "workspace_members_workspace_id_idx" ON "workspace_members"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_members_user_id_workspace_id_key" ON "workspace_members"("user_id", "workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_uuid_key" ON "workspaces"("uuid");

-- AddForeignKey
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_member" ADD CONSTRAINT "role_member_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "workspace_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_member" ADD CONSTRAINT "role_member_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permission_role" ADD CONSTRAINT "permission_role_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permission_role" ADD CONSTRAINT "permission_role_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permission_member" ADD CONSTRAINT "permission_member_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "workspace_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permission_member" ADD CONSTRAINT "permission_member_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "two_factor_backup_codes" ADD CONSTRAINT "two_factor_backup_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_revoked_by_fkey" FOREIGN KEY ("revoked_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

