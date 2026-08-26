CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"action" text NOT NULL,
	"target_entity_type" text NOT NULL,
	"target_entity_id" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pending_invites" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"email" text NOT NULL,
	"role_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pending_invites_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "platform_users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"hashed_password" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "platform_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"stripe_customer_id" text,
	"logo" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"role_id" text NOT NULL,
	"email" text NOT NULL,
	"hashed_password" text NOT NULL,
	"name" text NOT NULL,
	"title" text,
	"avatar" text,
	"status" text DEFAULT 'active',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"start_date" timestamp,
	"end_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "shots" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"assigned_to" text,
	"status" text DEFAULT 'ready' NOT NULL,
	"start_date" timestamp,
	"due_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "versions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"task_id" text NOT NULL,
	"media_url" text NOT NULL,
	"status" text DEFAULT 'pending_review' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_role_capabilities" (
	"role_id" text NOT NULL,
	"capability_id" text NOT NULL,
	CONSTRAINT "tenant_role_capabilities_role_id_capability_id_pk" PRIMARY KEY("role_id","capability_id")
);
--> statement-breakpoint
CREATE TABLE "tenant_roles" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"is_system_default" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_invites" ADD CONSTRAINT "pending_invites_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_tenant_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."tenant_roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shots" ADD CONSTRAINT "shots_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shots" ADD CONSTRAINT "shots_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "versions" ADD CONSTRAINT "versions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "versions" ADD CONSTRAINT "versions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_role_capabilities" ADD CONSTRAINT "tenant_role_capabilities_role_id_tenant_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."tenant_roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_roles" ADD CONSTRAINT "tenant_roles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;