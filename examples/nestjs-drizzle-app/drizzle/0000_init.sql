CREATE TABLE "audit_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"uuid" text NOT NULL,
	"user_id" bigint,
	"name" text NOT NULL,
	"action" text NOT NULL,
	"info" jsonb NOT NULL,
	"remarks" text,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "denylisted_access_tokens" (
	"jti" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp (6) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_accounts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"uuid" text NOT NULL,
	"user_id" bigint NOT NULL,
	"provider" varchar(100) NOT NULL,
	"provider_account_id" text NOT NULL,
	"email" text,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"uuid" text NOT NULL,
	"user_id" bigint NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp (6) with time zone NOT NULL,
	"consumed_at" timestamp (6) with time zone,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permission_role" (
	"permission_id" bigint NOT NULL,
	"role_id" bigint NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "permission_role_pkey" PRIMARY KEY("permission_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "permission_user" (
	"user_id" bigint NOT NULL,
	"permission_id" bigint NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "permission_user_pkey" PRIMARY KEY("user_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"uuid" text NOT NULL,
	"slug" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"display_name" varchar(255) NOT NULL,
	"description" text,
	"group" varchar(255) DEFAULT 'General' NOT NULL,
	"group_order" integer DEFAULT 0 NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" bigint,
	"updated_by" bigint,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp (6) with time zone,
	"deleted_by" bigint,
	"deleted_reason" varchar(255),
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_user" (
	"user_id" bigint NOT NULL,
	"role_id" bigint NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_user_pkey" PRIMARY KEY("user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"uuid" text NOT NULL,
	"slug" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"display_name" varchar(255) NOT NULL,
	"description" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" bigint,
	"updated_by" bigint,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp (6) with time zone,
	"deleted_by" bigint,
	"deleted_reason" varchar(255),
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"uuid" text NOT NULL,
	"user_id" bigint NOT NULL,
	"session_version" integer DEFAULT 0 NOT NULL,
	"current_refresh_jti" text NOT NULL,
	"provider" varchar(100),
	"user_agent" text,
	"ip" varchar(100),
	"expires_at" timestamp (6) with time zone NOT NULL,
	"is_revoked" boolean DEFAULT false NOT NULL,
	"revoked_at" timestamp (6) with time zone,
	"revoked_by" bigint,
	"revoked_ip" varchar(100),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" bigint,
	"updated_by" bigint,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp (6) with time zone,
	"deleted_by" bigint,
	"deleted_reason" varchar(255),
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "two_factor_backup_codes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"uuid" text NOT NULL,
	"user_id" bigint NOT NULL,
	"code_hash" text NOT NULL,
	"used_at" timestamp (6) with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"uuid" text NOT NULL,
	"email" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"display_name" text,
	"phone" text,
	"username" text,
	"photo" text,
	"last_login" timestamp (6) with time zone,
	"password_hash" text,
	"blocked" boolean DEFAULT false NOT NULL,
	"two_factor_enabled" boolean DEFAULT false NOT NULL,
	"two_factor_secret" text,
	"created_by" bigint,
	"updated_by" bigint,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp (6) with time zone,
	"deleted_by" bigint,
	"deleted_reason" varchar(255),
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_role" ADD CONSTRAINT "permission_role_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_role" ADD CONSTRAINT "permission_role_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_user" ADD CONSTRAINT "permission_user_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_user" ADD CONSTRAINT "permission_user_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_user" ADD CONSTRAINT "role_user_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_user" ADD CONSTRAINT "role_user_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factor_backup_codes" ADD CONSTRAINT "two_factor_backup_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "audit_logs_uuid_key" ON "audit_logs" USING btree ("uuid");--> statement-breakpoint
CREATE INDEX "audit_logs_user_created_idx" ON "audit_logs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_accounts_uuid_key" ON "oauth_accounts" USING btree ("uuid");--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_accounts_provider_provider_account_id_key" ON "oauth_accounts" USING btree ("provider","provider_account_id");--> statement-breakpoint
CREATE INDEX "oauth_accounts_user_id_idx" ON "oauth_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "password_reset_tokens_uuid_key" ON "password_reset_tokens" USING btree ("uuid");--> statement-breakpoint
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "permission_role_role_id_idx" ON "permission_role" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "permission_user_permission_id_idx" ON "permission_user" USING btree ("permission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "permissions_uuid_key" ON "permissions" USING btree ("uuid");--> statement-breakpoint
CREATE UNIQUE INDEX "permissions_slug_key" ON "permissions" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "permissions_is_active_idx" ON "permissions" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "permissions_group_order_idx" ON "permissions" USING btree ("group","group_order","order");--> statement-breakpoint
CREATE INDEX "permissions_is_deleted_idx" ON "permissions" USING btree ("is_deleted");--> statement-breakpoint
CREATE INDEX "role_user_role_id_idx" ON "role_user" USING btree ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_uuid_key" ON "roles" USING btree ("uuid");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_slug_key" ON "roles" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "roles_is_default_idx" ON "roles" USING btree ("is_default");--> statement-breakpoint
CREATE INDEX "roles_active_order_idx" ON "roles" USING btree ("is_active","order");--> statement-breakpoint
CREATE INDEX "roles_is_deleted_idx" ON "roles" USING btree ("is_deleted");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_uuid_key" ON "sessions" USING btree ("uuid");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_is_revoked_idx" ON "sessions" USING btree ("is_revoked");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "sessions_user_active_idx" ON "sessions" USING btree ("user_id","is_revoked","expires_at");--> statement-breakpoint
CREATE INDEX "sessions_revoked_by_idx" ON "sessions" USING btree ("revoked_by");--> statement-breakpoint
CREATE UNIQUE INDEX "two_factor_backup_codes_uuid_key" ON "two_factor_backup_codes" USING btree ("uuid");--> statement-breakpoint
CREATE INDEX "two_factor_backup_codes_user_id_idx" ON "two_factor_backup_codes" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_uuid_key" ON "users" USING btree ("uuid");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_first_name_key" ON "users" USING btree ("first_name");--> statement-breakpoint
CREATE UNIQUE INDEX "users_last_name_key" ON "users" USING btree ("last_name");--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_key" ON "users" USING btree ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_key" ON "users" USING btree ("username");--> statement-breakpoint
CREATE INDEX "users_is_deleted_idx" ON "users" USING btree ("is_deleted");