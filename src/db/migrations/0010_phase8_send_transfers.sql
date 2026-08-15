-- MULTIPLICA Phase 8 — Enviar + pastoral transfers + leadership history
-- Preserves all existing data. Additive only.

ALTER TYPE "public"."process_type" ADD VALUE IF NOT EXISTS 'enviar';

DO $$ BEGIN
  CREATE TYPE "public"."transfer_type" AS ENUM (
    'network_change',
    'ministry_change',
    'cell_membership_transfer',
    'direct_leader_change',
    'subtree_move',
    'cell_reassignment',
    'leader_deactivation'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."transfer_status" AS ENUM (
    'draft',
    'pending',
    'approved',
    'rejected',
    'executed',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."transfer_structure_mode" AS ENUM (
    'move_with_structure',
    'move_person_only_and_reassign_structure',
    'not_applicable'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "pastoral_transfer_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "person_id" uuid NOT NULL REFERENCES "persons"("id") ON DELETE RESTRICT,
  "transfer_type" "transfer_type" NOT NULL,
  "structure_mode" "transfer_structure_mode" NOT NULL DEFAULT 'not_applicable',
  "status" "transfer_status" NOT NULL DEFAULT 'draft',
  "requested_by_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "source_ministry_id" uuid REFERENCES "ministries"("id") ON DELETE RESTRICT,
  "source_network_id" uuid REFERENCES "networks"("id") ON DELETE RESTRICT,
  "destination_ministry_id" uuid REFERENCES "ministries"("id") ON DELETE RESTRICT,
  "destination_network_id" uuid REFERENCES "networks"("id") ON DELETE RESTRICT,
  "proposed_direct_leader_person_id" uuid REFERENCES "persons"("id") ON DELETE RESTRICT,
  "target_cell_id" uuid REFERENCES "cells"("id") ON DELETE RESTRICT,
  "reason" text NOT NULL,
  "plan" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "approved_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "approved_at" timestamptz,
  "rejected_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "rejected_at" timestamptz,
  "rejection_reason" text,
  "executed_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "executed_at" timestamptz,
  "cancelled_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "cancelled_at" timestamptz,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "pastoral_transfer_requests_person_idx"
  ON "pastoral_transfer_requests" ("person_id");
CREATE INDEX IF NOT EXISTS "pastoral_transfer_requests_status_idx"
  ON "pastoral_transfer_requests" ("status");
CREATE INDEX IF NOT EXISTS "pastoral_transfer_requests_type_idx"
  ON "pastoral_transfer_requests" ("transfer_type");
CREATE INDEX IF NOT EXISTS "pastoral_transfer_requests_source_ministry_idx"
  ON "pastoral_transfer_requests" ("source_ministry_id");
CREATE INDEX IF NOT EXISTS "pastoral_transfer_requests_dest_ministry_idx"
  ON "pastoral_transfer_requests" ("destination_ministry_id");
CREATE INDEX IF NOT EXISTS "pastoral_transfer_requests_requested_by_idx"
  ON "pastoral_transfer_requests" ("requested_by_user_id");
CREATE INDEX IF NOT EXISTS "pastoral_transfer_requests_approved_by_idx"
  ON "pastoral_transfer_requests" ("approved_by_user_id");

CREATE TABLE IF NOT EXISTS "leadership_relationship_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "person_id" uuid NOT NULL REFERENCES "persons"("id") ON DELETE RESTRICT,
  "old_direct_leader_person_id" uuid REFERENCES "persons"("id") ON DELETE SET NULL,
  "new_direct_leader_person_id" uuid REFERENCES "persons"("id") ON DELETE SET NULL,
  "ministry_id" uuid REFERENCES "ministries"("id") ON DELETE SET NULL,
  "reason" text,
  "transfer_request_id" uuid REFERENCES "pastoral_transfer_requests"("id") ON DELETE SET NULL,
  "actor_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "changed_at" timestamptz DEFAULT now() NOT NULL,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS "leadership_relationship_history_person_idx"
  ON "leadership_relationship_history" ("person_id");
CREATE INDEX IF NOT EXISTS "leadership_relationship_history_changed_idx"
  ON "leadership_relationship_history" ("changed_at");

CREATE TABLE IF NOT EXISTS "cell_leadership_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "cell_id" uuid NOT NULL REFERENCES "cells"("id") ON DELETE RESTRICT,
  "old_responsible_person_id" uuid REFERENCES "persons"("id") ON DELETE SET NULL,
  "new_responsible_person_id" uuid REFERENCES "persons"("id") ON DELETE SET NULL,
  "reason" text,
  "transfer_request_id" uuid REFERENCES "pastoral_transfer_requests"("id") ON DELETE SET NULL,
  "actor_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "changed_at" timestamptz DEFAULT now() NOT NULL,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS "cell_leadership_history_cell_idx"
  ON "cell_leadership_history" ("cell_id");
CREATE INDEX IF NOT EXISTS "cell_leadership_history_changed_idx"
  ON "cell_leadership_history" ("changed_at");

COMMENT ON TABLE pastoral_transfer_requests IS
  'Phase 8 pastoral transfer engine: draft→pending→approved→executed. Idempotent once executed.';
COMMENT ON TABLE leadership_relationship_history IS
  'Historical direct-leader changes. leadership_closure remains current-state only.';
COMMENT ON TABLE cell_leadership_history IS
  'Historical cell responsible changes.';
