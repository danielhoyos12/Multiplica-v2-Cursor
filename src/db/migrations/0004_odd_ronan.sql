CREATE TYPE "public"."cell_membership_role" AS ENUM('member', 'twelve_team');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "cell_memberships" ADD COLUMN "role" "cell_membership_role" DEFAULT 'member' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_uidx" ON "users" USING btree ("username");