-- MULTIPLICA Phase 6 — Capacitación Destino RLS
-- Apply AFTER 0007 schema migration.

ALTER TABLE training_completion_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_cycle_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_requirement_overrides ENABLE ROW LEVEL SECURITY;

ALTER TABLE training_completion_requirements FORCE ROW LEVEL SECURITY;
ALTER TABLE training_cycle_staff FORCE ROW LEVEL SECURITY;
ALTER TABLE training_requirement_overrides FORCE ROW LEVEL SECURITY;

-- Requirements catalog: authenticated read
DROP POLICY IF EXISTS training_completion_requirements_select_authenticated ON training_completion_requirements;
CREATE POLICY training_completion_requirements_select_authenticated
  ON training_completion_requirements FOR SELECT TO authenticated
  USING (true);

-- Cycle staff: self, assigned cycle ministry, or superadmin
DROP POLICY IF EXISTS training_cycle_staff_select_scoped ON training_cycle_staff;
CREATE POLICY training_cycle_staff_select_scoped
  ON training_cycle_staff FOR SELECT TO authenticated
  USING (
    public.is_superadmin()
    OR user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM training_cycles c
      WHERE c.id = cycle_id
        AND (
          c.ministry_id IS NULL
          OR c.ministry_id IN (SELECT public.user_ministry_ids())
          OR public.is_leader_general_for_ministry(c.ministry_id)
        )
    )
  );

-- Overrides: scoped by person process / tree
DROP POLICY IF EXISTS training_requirement_overrides_select_scoped ON training_requirement_overrides;
CREATE POLICY training_requirement_overrides_select_scoped
  ON training_requirement_overrides FOR SELECT TO authenticated
  USING (
    public.is_superadmin()
    OR (
      public.user_person_id() IS NOT NULL
      AND (
        person_id = public.user_person_id()
        OR public.is_leadership_descendant(public.user_person_id(), person_id)
      )
    )
    OR EXISTS (
      SELECT 1 FROM person_process_progress p
      WHERE p.person_id = training_requirement_overrides.person_id
        AND public.is_leader_general_for_ministry(p.ministry_id)
    )
  );

-- Deny-by-default writes (no INSERT/UPDATE/DELETE policies for authenticated).
-- Mutations go through server-side service role.

COMMENT ON TABLE training_completion_requirements IS
  'Configurable Destino/UDV completion requirements (academic vs pastoral).';
COMMENT ON TABLE training_cycle_staff IS
  'Authorized teachers/coordinators per training cycle.';
COMMENT ON TABLE training_requirement_overrides IS
  'Audited exceptional requirement overrides — never silent.';
