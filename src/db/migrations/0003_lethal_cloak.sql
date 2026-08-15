CREATE TYPE "public"."attendance_session_status" AS ENUM('open', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."attendance_status" AS ENUM('present', 'absent', 'excused');--> statement-breakpoint
CREATE TYPE "public"."cell_membership_status" AS ENUM('active', 'left', 'transferred');--> statement-breakpoint
CREATE TYPE "public"."cell_status" AS ENUM('active', 'inactive', 'closed');--> statement-breakpoint
CREATE TYPE "public"."cell_type" AS ENUM('evangelistic', 'twelve');--> statement-breakpoint
CREATE TYPE "public"."day_of_week" AS ENUM('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday');--> statement-breakpoint
CREATE TABLE "cell_attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"membership_id" uuid,
	"status" "attendance_status" NOT NULL,
	"notes" text,
	"recorded_by_user_id" uuid,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cell_attendance_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cell_id" uuid NOT NULL,
	"session_date" date NOT NULL,
	"scheduled_at" timestamp with time zone,
	"status" "attendance_session_status" DEFAULT 'open' NOT NULL,
	"notes" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cell_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cell_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"status" "cell_membership_status" DEFAULT 'active' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	"leave_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cells" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text,
	"name" text NOT NULL,
	"type" "cell_type" NOT NULL,
	"ministry_id" uuid NOT NULL,
	"network_id" uuid NOT NULL,
	"responsible_person_id" uuid,
	"responsible_user_id" uuid,
	"day_of_week" "day_of_week" NOT NULL,
	"start_time" time NOT NULL,
	"timezone" text DEFAULT 'America/Lima' NOT NULL,
	"address" text,
	"district_id" uuid,
	"status" "cell_status" DEFAULT 'active' NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cell_attendance" ADD CONSTRAINT "cell_attendance_session_id_cell_attendance_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."cell_attendance_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cell_attendance" ADD CONSTRAINT "cell_attendance_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cell_attendance" ADD CONSTRAINT "cell_attendance_membership_id_cell_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."cell_memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cell_attendance" ADD CONSTRAINT "cell_attendance_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cell_attendance_sessions" ADD CONSTRAINT "cell_attendance_sessions_cell_id_cells_id_fk" FOREIGN KEY ("cell_id") REFERENCES "public"."cells"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cell_attendance_sessions" ADD CONSTRAINT "cell_attendance_sessions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cell_memberships" ADD CONSTRAINT "cell_memberships_cell_id_cells_id_fk" FOREIGN KEY ("cell_id") REFERENCES "public"."cells"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cell_memberships" ADD CONSTRAINT "cell_memberships_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cells" ADD CONSTRAINT "cells_ministry_id_ministries_id_fk" FOREIGN KEY ("ministry_id") REFERENCES "public"."ministries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cells" ADD CONSTRAINT "cells_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cells" ADD CONSTRAINT "cells_responsible_person_id_persons_id_fk" FOREIGN KEY ("responsible_person_id") REFERENCES "public"."persons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cells" ADD CONSTRAINT "cells_responsible_user_id_users_id_fk" FOREIGN KEY ("responsible_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cells" ADD CONSTRAINT "cells_district_id_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cell_attendance_session_person_uidx" ON "cell_attendance" USING btree ("session_id","person_id");--> statement-breakpoint
CREATE INDEX "cell_attendance_session_id_idx" ON "cell_attendance" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "cell_attendance_person_id_idx" ON "cell_attendance" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "cell_attendance_status_idx" ON "cell_attendance" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "cell_attendance_sessions_cell_date_uidx" ON "cell_attendance_sessions" USING btree ("cell_id","session_date");--> statement-breakpoint
CREATE INDEX "cell_attendance_sessions_cell_id_idx" ON "cell_attendance_sessions" USING btree ("cell_id");--> statement-breakpoint
CREATE INDEX "cell_attendance_sessions_date_idx" ON "cell_attendance_sessions" USING btree ("session_date");--> statement-breakpoint
CREATE INDEX "cell_memberships_cell_id_idx" ON "cell_memberships" USING btree ("cell_id");--> statement-breakpoint
CREATE INDEX "cell_memberships_person_id_idx" ON "cell_memberships" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "cell_memberships_status_idx" ON "cell_memberships" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cell_memberships_active_person_idx" ON "cell_memberships" USING btree ("person_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "cells_code_uidx" ON "cells" USING btree ("code");--> statement-breakpoint
CREATE INDEX "cells_ministry_id_idx" ON "cells" USING btree ("ministry_id");--> statement-breakpoint
CREATE INDEX "cells_network_id_idx" ON "cells" USING btree ("network_id");--> statement-breakpoint
CREATE INDEX "cells_responsible_person_id_idx" ON "cells" USING btree ("responsible_person_id");--> statement-breakpoint
CREATE INDEX "cells_responsible_user_id_idx" ON "cells" USING btree ("responsible_user_id");--> statement-breakpoint
CREATE INDEX "cells_status_idx" ON "cells" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cells_type_idx" ON "cells" USING btree ("type");