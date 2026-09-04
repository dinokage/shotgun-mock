CREATE TABLE "sequence_team_members" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"sequence_id" text NOT NULL,
	"user_id" text NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sequence_team_members_sequence_id_user_id_unique" UNIQUE("sequence_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "sequence_team_members" ADD CONSTRAINT "sequence_team_members_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_team_members" ADD CONSTRAINT "sequence_team_members_sequence_id_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."sequences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_team_members" ADD CONSTRAINT "sequence_team_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;