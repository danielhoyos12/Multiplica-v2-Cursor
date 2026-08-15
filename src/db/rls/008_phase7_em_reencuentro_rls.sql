-- MULTIPLICA Phase 7 — EM / Re-Encuentro RLS notes
-- No new tables. Existing person_process_* and training_* policies cover new process_type values.
-- Deny-by-default writes remain; mutations via server-side service role.

COMMENT ON TYPE process_type IS
  'Pastoral ladder: consolidar, udv, destino*, escuela_ministerial, reencuentro';
