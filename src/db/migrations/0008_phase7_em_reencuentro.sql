-- MULTIPLICA Phase 7 — Escuela Ministerial + Re-Encuentro
-- Extends process_type only; reuses training_* / person_process_* (no person silos).

ALTER TYPE "public"."process_type" ADD VALUE IF NOT EXISTS 'escuela_ministerial';
ALTER TYPE "public"."process_type" ADD VALUE IF NOT EXISTS 'reencuentro';
