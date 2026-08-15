-- MULTIPLICA Phase 7 reconciliation — official pastoral sequence
-- Preserves legacy enums/data. Adds Consolidar stages + EM1–3 + module components.

ALTER TYPE "public"."process_type" ADD VALUE IF NOT EXISTS 'pre_encuentro';
ALTER TYPE "public"."process_type" ADD VALUE IF NOT EXISTS 'encuentro';
ALTER TYPE "public"."process_type" ADD VALUE IF NOT EXISTS 'post_encuentro';
ALTER TYPE "public"."process_type" ADD VALUE IF NOT EXISTS 'em1';
ALTER TYPE "public"."process_type" ADD VALUE IF NOT EXISTS 'em2';
ALTER TYPE "public"."process_type" ADD VALUE IF NOT EXISTS 'em3';

ALTER TABLE "training_modules" ADD COLUMN IF NOT EXISTS "component_code" text;
ALTER TABLE "training_modules" ADD COLUMN IF NOT EXISTS "component_name" text;

CREATE INDEX IF NOT EXISTS "training_modules_component_idx"
  ON "training_modules" USING btree ("program_id", "component_code");

COMMENT ON COLUMN training_modules.component_code IS
  'doctrina | seminario | clase | evento | dia — conceptual group within a program/level';

-- Mark known verify fixtures so they are not treated as pastoral truth for Pre/Enc/Post.
UPDATE person_process_progress p
SET metadata = coalesce(p.metadata, '{}'::jsonb) || jsonb_build_object(
  'legacy_sequence', true,
  'reconciliation', 'fixture_or_legacy_unverified',
  'do_not_auto_equate_to_pre_enc_post', true
)
FROM person_organization_history poh
WHERE poh.person_id = p.person_id
  AND poh.effective_to IS NULL
  AND poh.change_reason IN ('phase5-verify', 'phase6-verify', 'phase7-verify');
