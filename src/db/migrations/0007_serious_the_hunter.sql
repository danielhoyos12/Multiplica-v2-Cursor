CREATE TYPE "public"."training_cycle_staff_role" AS ENUM('teacher', 'coordinator', 'assistant');--> statement-breakpoint
CREATE TYPE "public"."training_requirement_type" AS ENUM('modules_completed', 'attendance', 'active_cell_members', 'leadership_status', 'manual_approval');--> statement-breakpoint
ALTER TYPE "public"."process_status" ADD VALUE 'eligible' BEFORE 'in_progress';--> statement-breakpoint
ALTER TYPE "public"."process_status" ADD VALUE 'academic_completed' BEFORE 'completed';--> statement-breakpoint
ALTER TYPE "public"."process_type" ADD VALUE 'destino_n1';--> statement-breakpoint
ALTER TYPE "public"."process_type" ADD VALUE 'destino_n2';--> statement-breakpoint
ALTER TYPE "public"."process_type" ADD VALUE 'destino_n3';--> statement-breakpoint
ALTER TYPE "public"."training_enrollment_status" ADD VALUE 'academic_completed' BEFORE 'completed';--> statement-breakpoint
CREATE TABLE "training_completion_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"requirement_type" "training_requirement_type" NOT NULL,
	"numeric_value" integer,
	"is_required" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"category" text DEFAULT 'pastoral' NOT NULL,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_cycle_staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "training_cycle_staff_role" DEFAULT 'teacher' NOT NULL,
	"can_take_attendance" boolean DEFAULT true NOT NULL,
	"can_authorize_recovery" boolean DEFAULT true NOT NULL,
	"can_complete_academic" boolean DEFAULT true NOT NULL,
	"can_complete_level" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_requirement_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"requirement_id" uuid,
	"reason" text NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "training_programs" ADD COLUMN "level" integer;--> statement-breakpoint
ALTER TABLE "training_programs" ADD COLUMN "family" text;--> statement-breakpoint
ALTER TABLE "training_completion_requirements" ADD CONSTRAINT "training_completion_requirements_program_id_training_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."training_programs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_cycle_staff" ADD CONSTRAINT "training_cycle_staff_cycle_id_training_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."training_cycles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_cycle_staff" ADD CONSTRAINT "training_cycle_staff_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_requirement_overrides" ADD CONSTRAINT "training_requirement_overrides_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_requirement_overrides" ADD CONSTRAINT "training_requirement_overrides_program_id_training_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."training_programs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_requirement_overrides" ADD CONSTRAINT "training_requirement_overrides_requirement_id_training_completion_requirements_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."training_completion_requirements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_requirement_overrides" ADD CONSTRAINT "training_requirement_overrides_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "training_completion_requirements_program_idx" ON "training_completion_requirements" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "training_completion_requirements_type_idx" ON "training_completion_requirements" USING btree ("requirement_type");--> statement-breakpoint
CREATE UNIQUE INDEX "training_cycle_staff_cycle_user_uidx" ON "training_cycle_staff" USING btree ("cycle_id","user_id");--> statement-breakpoint
CREATE INDEX "training_cycle_staff_user_id_idx" ON "training_cycle_staff" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "training_requirement_overrides_person_idx" ON "training_requirement_overrides" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "training_requirement_overrides_program_idx" ON "training_requirement_overrides" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "training_programs_family_level_idx" ON "training_programs" USING btree ("family","level");