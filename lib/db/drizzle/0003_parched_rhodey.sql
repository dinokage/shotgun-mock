ALTER TABLE "versions" DROP CONSTRAINT "versions_task_id_tasks_id_fk";
--> statement-breakpoint
ALTER TABLE "versions" ALTER COLUMN "task_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "versions" ADD COLUMN "entity_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "versions" ADD COLUMN "entity_type" text NOT NULL;--> statement-breakpoint
ALTER TABLE "versions" ADD COLUMN "version_number" text DEFAULT 'v001' NOT NULL;--> statement-breakpoint
ALTER TABLE "versions" ADD COLUMN "notes" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "versions" ADD COLUMN "thumbnail" text;--> statement-breakpoint
ALTER TABLE "versions" ADD COLUMN "derived_from_id" text;--> statement-breakpoint
ALTER TABLE "versions" ADD COLUMN "file_size" text DEFAULT '0MB' NOT NULL;--> statement-breakpoint
ALTER TABLE "versions" ADD COLUMN "created_by_id" text;--> statement-breakpoint
ALTER TABLE "versions" ADD CONSTRAINT "versions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "versions" ADD CONSTRAINT "versions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;