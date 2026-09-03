ALTER TABLE "pending_invites" ADD COLUMN "department_id" text;--> statement-breakpoint
ALTER TABLE "pending_invites" ADD CONSTRAINT "pending_invites_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;
