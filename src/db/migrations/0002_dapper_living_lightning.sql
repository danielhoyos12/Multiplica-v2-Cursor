CREATE TYPE "public"."person_source" AS ENUM('internal_form', 'public_form');--> statement-breakpoint
CREATE TABLE "person_intake_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid,
	"ministry_id" uuid,
	"network_id" uuid,
	"source" "person_source" NOT NULL,
	"outcome" text NOT NULL,
	"ip_hash" text,
	"user_agent_hash" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "persons" ADD COLUMN "phone_normalized" text;--> statement-breakpoint
ALTER TABLE "persons" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "persons" ADD COLUMN "prayer_request" text;--> statement-breakpoint
ALTER TABLE "persons" ADD COLUMN "source" "person_source" DEFAULT 'internal_form' NOT NULL;--> statement-breakpoint
ALTER TABLE "persons" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "persons" ADD COLUMN "registered_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "person_intake_events" ADD CONSTRAINT "person_intake_events_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_intake_events" ADD CONSTRAINT "person_intake_events_ministry_id_ministries_id_fk" FOREIGN KEY ("ministry_id") REFERENCES "public"."ministries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_intake_events" ADD CONSTRAINT "person_intake_events_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "person_intake_events_created_at_idx" ON "person_intake_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "person_intake_events_ip_hash_idx" ON "person_intake_events" USING btree ("ip_hash");--> statement-breakpoint
CREATE INDEX "person_intake_events_person_id_idx" ON "person_intake_events" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "persons_phone_normalized_idx" ON "persons" USING btree ("phone_normalized");--> statement-breakpoint
CREATE INDEX "persons_registered_at_idx" ON "persons" USING btree ("registered_at");--> statement-breakpoint
CREATE INDEX "persons_source_idx" ON "persons" USING btree ("source");--> statement-breakpoint
CREATE INDEX "persons_is_active_idx" ON "persons" USING btree ("is_active");