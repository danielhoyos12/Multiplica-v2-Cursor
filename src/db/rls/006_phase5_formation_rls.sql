-- MULTIPLICA Phase 5 — Escalera / Consolidar / UDV RLS
-- Apply AFTER 0006 schema migration.

ALTER TABLE person_process_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE person_process_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_attendance ENABLE ROW LEVEL SECURITY;

ALTER TABLE person_process_progress FORCE ROW LEVEL SECURITY;
ALTER TABLE person_process_events FORCE ROW LEVEL SECURITY;
ALTER TABLE training_programs FORCE ROW LEVEL SECURITY;
ALTER TABLE training_modules FORCE ROW LEVEL SECURITY;
ALTER TABLE training_cycles FORCE ROW LEVEL SECURITY;
ALTER TABLE training_enrollments FORCE ROW LEVEL SECURITY;
ALTER TABLE training_attendance FORCE ROW LEVEL SECURITY;

-- Catalogs readable by authenticated
DROP POLICY IF EXISTS training_programs_select_authenticated ON training_programs;
CREATE POLICY training_programs_select_authenticated
  ON training_programs FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS training_modules_select_authenticated ON training_modules;
CREATE POLICY training_modules_select_authenticated
  ON training_modules FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS training_cycles_select_scoped ON training_cycles;
CREATE POLICY training_cycles_select_scoped
  ON training_cycles FOR SELECT TO authenticated
  USING (
    public.is_superadmin()
    OR ministry_id IS NULL
    OR ministry_id IN (SELECT public.user_ministry_ids())
    OR public.is_leader_general_for_ministry(ministry_id)
  );

DROP POLICY IF EXISTS person_process_progress_select_scoped ON person_process_progress;
CREATE POLICY person_process_progress_select_scoped
  ON person_process_progress FOR SELECT TO authenticated
  USING (
    public.is_superadmin()
    OR public.is_leader_general_for_ministry(ministry_id)
    OR (
      public.user_person_id() IS NOT NULL
      AND (
        person_id = public.user_person_id()
        OR assigned_leader_person_id = public.user_person_id()
        OR public.is_leadership_descendant(public.user_person_id(), person_id)
      )
    )
  );

DROP POLICY IF EXISTS person_process_events_select_scoped ON person_process_events;
CREATE POLICY person_process_events_select_scoped
  ON person_process_events FOR SELECT TO authenticated
  USING (
    public.is_superadmin()
    OR EXISTS (
      SELECT 1 FROM person_process_progress p
      WHERE p.id = progress_id
        AND (
          public.is_leader_general_for_ministry(p.ministry_id)
          OR (
            public.user_person_id() IS NOT NULL
            AND (
              p.person_id = public.user_person_id()
              OR p.assigned_leader_person_id = public.user_person_id()
              OR public.is_leadership_descendant(public.user_person_id(), p.person_id)
            )
          )
        )
    )
  );

DROP POLICY IF EXISTS training_enrollments_select_scoped ON training_enrollments;
CREATE POLICY training_enrollments_select_scoped
  ON training_enrollments FOR SELECT TO authenticated
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
      WHERE p.person_id = training_enrollments.person_id
        AND public.is_leader_general_for_ministry(p.ministry_id)
    )
  );

DROP POLICY IF EXISTS training_attendance_select_scoped ON training_attendance;
CREATE POLICY training_attendance_select_scoped
  ON training_attendance FOR SELECT TO authenticated
  USING (
    public.is_superadmin()
    OR EXISTS (
      SELECT 1 FROM training_enrollments e
      WHERE e.id = enrollment_id
        AND (
          (
            public.user_person_id() IS NOT NULL
            AND (
              e.person_id = public.user_person_id()
              OR public.is_leadership_descendant(public.user_person_id(), e.person_id)
            )
          )
          OR EXISTS (
            SELECT 1 FROM person_process_progress p
            WHERE p.person_id = e.person_id
              AND public.is_leader_general_for_ministry(p.ministry_id)
          )
        )
    )
  );

COMMENT ON TABLE person_process_progress IS 'Escalera del Éxito progress. References persons.id only.';
COMMENT ON TABLE training_enrollments IS 'UDV (and future programs) enrollments — no person duplication.';
