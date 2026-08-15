CREATE TYPE "public"."process_status" AS ENUM('pending', 'in_progress', 'completed', 'paused', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."process_type" AS ENUM('consolidar', 'udv', 'destino');--> statement-breakpoint
CREATE TYPE "public"."training_attendance_status" AS ENUM('present', 'absent', 'excused', 'recovered');--> statement-breakpoint
CREATE TYPE "public"."training_cycle_status" AS ENUM('planned', 'active', 'closed');--> statement-breakpoint
CREATE TYPE "public"."training_enrollment_status" AS ENUM('enrolled', 'in_progress', 'completed', 'paused');--> statement-breakpoint
CREATE TABLE "person_process_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"progress_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"process_type" "process_type" NOT NULL,
	"event_type" text NOT NULL,
	"from_status" "process_status",
	"to_status" "process_status",
	"actor_user_id" uuid,
	"note" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "person_process_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"process_type" "process_type" NOT NULL,
	"stage" text,
	"status" "process_status" DEFAULT 'pending' NOT NULL,
	"current_step" text,
	"ministry_id" uuid NOT NULL,
	"network_id" uuid,
	"assigned_leader_person_id" uuid,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"completed_by_user_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"module_id" uuid NOT NULL,
	"attendance_date" date NOT NULL,
	"status" "training_attendance_status" NOT NULL,
	"recorded_by_user_id" uuid,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recovery_authorized_by_user_id" uuid,
	"recovery_authorized_at" timestamp with time zone,
	"recovery_note" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "training_cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"name" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" "training_cycle_status" DEFAULT 'planned' NOT NULL,
	"ministry_id" uuid,
	"created_by_user_id" uuid,
	"activated_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"status" "training_enrollment_status" DEFAULT 'enrolled' NOT NULL,
	"enrolled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"completed_by_user_id" uuid,
	"paused_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_modules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_required" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "person_process_events" ADD CONSTRAINT "person_process_events_progress_id_person_process_progress_id_fk" FOREIGN KEY ("progress_id") REFERENCES "public"."person_process_progress"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_process_events" ADD CONSTRAINT "person_process_events_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_process_events" ADD CONSTRAINT "person_process_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_process_progress" ADD CONSTRAINT "person_process_progress_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_process_progress" ADD CONSTRAINT "person_process_progress_ministry_id_ministries_id_fk" FOREIGN KEY ("ministry_id") REFERENCES "public"."ministries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_process_progress" ADD CONSTRAINT "person_process_progress_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_process_progress" ADD CONSTRAINT "person_process_progress_assigned_leader_person_id_persons_id_fk" FOREIGN KEY ("assigned_leader_person_id") REFERENCES "public"."persons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_process_progress" ADD CONSTRAINT "person_process_progress_completed_by_user_id_users_id_fk" FOREIGN KEY ("completed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_attendance" ADD CONSTRAINT "training_attendance_enrollment_id_training_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."training_enrollments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_attendance" ADD CONSTRAINT "training_attendance_module_id_training_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."training_modules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_attendance" ADD CONSTRAINT "training_attendance_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_attendance" ADD CONSTRAINT "training_attendance_recovery_authorized_by_user_id_users_id_fk" FOREIGN KEY ("recovery_authorized_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_cycles" ADD CONSTRAINT "training_cycles_program_id_training_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."training_programs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_cycles" ADD CONSTRAINT "training_cycles_ministry_id_ministries_id_fk" FOREIGN KEY ("ministry_id") REFERENCES "public"."ministries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_cycles" ADD CONSTRAINT "training_cycles_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_enrollments" ADD CONSTRAINT "training_enrollments_cycle_id_training_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."training_cycles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_enrollments" ADD CONSTRAINT "training_enrollments_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_enrollments" ADD CONSTRAINT "training_enrollments_completed_by_user_id_users_id_fk" FOREIGN KEY ("completed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_modules" ADD CONSTRAINT "training_modules_program_id_training_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."training_programs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "person_process_events_progress_id_idx" ON "person_process_events" USING btree ("progress_id");--> statement-breakpoint
CREATE INDEX "person_process_events_person_id_idx" ON "person_process_events" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "person_process_events_type_idx" ON "person_process_events" USING btree ("process_type","event_type");--> statement-breakpoint
CREATE UNIQUE INDEX "person_process_progress_person_type_uidx" ON "person_process_progress" USING btree ("person_id","process_type");--> statement-breakpoint
CREATE INDEX "person_process_progress_person_id_idx" ON "person_process_progress" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "person_process_progress_type_status_idx" ON "person_process_progress" USING btree ("process_type","status");--> statement-breakpoint
CREATE INDEX "person_process_progress_ministry_id_idx" ON "person_process_progress" USING btree ("ministry_id");--> statement-breakpoint
CREATE INDEX "person_process_progress_assigned_leader_idx" ON "person_process_progress" USING btree ("assigned_leader_person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "training_attendance_enrollment_module_uidx" ON "training_attendance" USING btree ("enrollment_id","module_id");--> statement-breakpoint
CREATE INDEX "training_attendance_enrollment_id_idx" ON "training_attendance" USING btree ("enrollment_id");--> statement-breakpoint
CREATE INDEX "training_attendance_module_id_idx" ON "training_attendance" USING btree ("module_id");--> statement-breakpoint
CREATE INDEX "training_attendance_status_idx" ON "training_attendance" USING btree ("status");--> statement-breakpoint
CREATE INDEX "training_cycles_program_id_idx" ON "training_cycles" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "training_cycles_status_idx" ON "training_cycles" USING btree ("status");--> statement-breakpoint
CREATE INDEX "training_cycles_ministry_id_idx" ON "training_cycles" USING btree ("ministry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "training_enrollments_cycle_person_uidx" ON "training_enrollments" USING btree ("cycle_id","person_id");--> statement-breakpoint
CREATE INDEX "training_enrollments_person_id_idx" ON "training_enrollments" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "training_enrollments_status_idx" ON "training_enrollments" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "training_modules_program_code_uidx" ON "training_modules" USING btree ("program_id","code");--> statement-breakpoint
CREATE INDEX "training_modules_program_order_idx" ON "training_modules" USING btree ("program_id","order_index");--> statement-breakpoint
CREATE UNIQUE INDEX "training_programs_code_uidx" ON "training_programs" USING btree ("code");