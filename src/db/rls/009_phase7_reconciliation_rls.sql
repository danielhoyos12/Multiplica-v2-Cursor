-- Phase 7 reconciliation RLS — no new tables; existing scoped policies cover new process_type values.

COMMENT ON TYPE process_type IS
  'Official: consolidar aggregate + pre_encuentro/encuentro/post_encuentro + destino_n1|n2 + reencuentro + destino_n3 + em1|em2|em3. Legacy: udv, destino, escuela_ministerial (DEPRECATED).';
