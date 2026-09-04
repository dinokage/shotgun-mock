CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"recipient_user_id" text NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"action_url" text,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "punched_in_at" timestamp;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;