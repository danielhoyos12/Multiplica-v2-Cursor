CREATE TYPE "public"."leadership_status" AS ENUM('none', 'eligible', 'active', 'inactive');--> statement-breakpoint
CREATE TABLE "leadership_closure" (
	"ancestor_person_id" uuid NOT NULL,
	"descendant_person_id" uuid NOT NULL,
	"depth" integer NOT NULL,
	"ministry_id" uuid NOT NULL,
	CONSTRAINT "leadership_closure_ancestor_person_id_descendant_person_id_pk" PRIMARY KEY("ancestor_person_id","descendant_person_id")
);
--> statement-breakpoint
CREATE TABLE "person_leadership" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"status" "leadership_status" DEFAULT 'none' NOT NULL,
	"ministry_id" uuid NOT NULL,
	"network_id" uuid NOT NULL,
	"direct_leader_person_id" uuid,
	"primary_cell_id" uuid,
	"human_leader_code" text,
	"is_ministry_root" boolean DEFAULT false NOT NULL,
	"eligible_at" timestamp with time zone,
	"eligible_by_user_id" uuid,
	"activated_at" timestamp with time zone,
	"activated_by_user_id" uuid,
	"deactivated_at" timestamp with time zone,
	"deactivated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leadership_closure" ADD CONSTRAINT "leadership_closure_ancestor_person_id_persons_id_fk" FOREIGN KEY ("ancestor_person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leadership_closure" ADD CONSTRAINT "leadership_closure_descendant_person_id_persons_id_fk" FOREIGN KEY ("descendant_person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leadership_closure" ADD CONSTRAINT "leadership_closure_ministry_id_ministries_id_fk" FOREIGN KEY ("ministry_id") REFERENCES "public"."ministries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_leadership" ADD CONSTRAINT "person_leadership_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_leadership" ADD CONSTRAINT "person_leadership_ministry_id_ministries_id_fk" FOREIGN KEY ("ministry_id") REFERENCES "public"."ministries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_leadership" ADD CONSTRAINT "person_leadership_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_leadership" ADD CONSTRAINT "person_leadership_direct_leader_person_id_persons_id_fk" FOREIGN KEY ("direct_leader_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_leadership" ADD CONSTRAINT "person_leadership_primary_cell_id_cells_id_fk" FOREIGN KEY ("primary_cell_id") REFERENCES "public"."cells"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_leadership" ADD CONSTRAINT "person_leadership_eligible_by_user_id_users_id_fk" FOREIGN KEY ("eligible_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_leadership" ADD CONSTRAINT "person_leadership_activated_by_user_id_users_id_fk" FOREIGN KEY ("activated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_leadership" ADD CONSTRAINT "person_leadership_deactivated_by_user_id_users_id_fk" FOREIGN KEY ("deactivated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "leadership_closure_descendant_idx" ON "leadership_closure" USING btree ("descendant_person_id");--> statement-breakpoint
CREATE INDEX "leadership_closure_ministry_idx" ON "leadership_closure" USING btree ("ministry_id");--> statement-breakpoint
CREATE INDEX "leadership_closure_ancestor_depth_idx" ON "leadership_closure" USING btree ("ancestor_person_id","depth");--> statement-breakpoint
CREATE UNIQUE INDEX "person_leadership_person_id_uidx" ON "person_leadership" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "person_leadership_human_code_uidx" ON "person_leadership" USING btree ("human_leader_code");--> statement-breakpoint
CREATE INDEX "person_leadership_status_idx" ON "person_leadership" USING btree ("status");--> statement-breakpoint
CREATE INDEX "person_leadership_ministry_id_idx" ON "person_leadership" USING btree ("ministry_id");--> statement-breakpoint
CREATE INDEX "person_leadership_network_id_idx" ON "person_leadership" USING btree ("network_id");--> statement-breakpoint
CREATE INDEX "person_leadership_direct_leader_idx" ON "person_leadership" USING btree ("direct_leader_person_id");--> statement-breakpoint
CREATE INDEX "person_leadership_primary_cell_idx" ON "person_leadership" USING btree ("primary_cell_id");