-- MULTIPLICA Phase 3 — Cells / memberships / attendance RLS
-- Apply AFTER 0003 schema migration.
-- Mutations go through server services; anonymous DENY by default.

ALTER TABLE cells ENABLE ROW LEVEL SECURITY;
ALTER TABLE cell_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE cell_attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cell_attendance ENABLE ROW LEVEL SECURITY;

ALTER TABLE cells FORCE ROW LEVEL SECURITY;
ALTER TABLE cell_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE cell_attendance_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE cell_attendance FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cells_select_scoped ON cells;
CREATE POLICY cells_select_scoped
  ON cells FOR SELECT TO authenticated
  USING (
    public.is_superadmin()
    OR ministry_id IN (SELECT public.user_ministry_ids())
  );

DROP POLICY IF EXISTS cell_memberships_select_scoped ON cell_memberships;
CREATE POLICY cell_memberships_select_scoped
  ON cell_memberships FOR SELECT TO authenticated
  USING (
    public.is_superadmin()
    OR EXISTS (
      SELECT 1 FROM cells c
      WHERE c.id = cell_id
        AND c.ministry_id IN (SELECT public.user_ministry_ids())
    )
  );

DROP POLICY IF EXISTS cell_attendance_sessions_select_scoped ON cell_attendance_sessions;
CREATE POLICY cell_attendance_sessions_select_scoped
  ON cell_attendance_sessions FOR SELECT TO authenticated
  USING (
    public.is_superadmin()
    OR EXISTS (
      SELECT 1 FROM cells c
      WHERE c.id = cell_id
        AND c.ministry_id IN (SELECT public.user_ministry_ids())
    )
  );

DROP POLICY IF EXISTS cell_attendance_select_scoped ON cell_attendance;
CREATE POLICY cell_attendance_select_scoped
  ON cell_attendance FOR SELECT TO authenticated
  USING (
    public.is_superadmin()
    OR EXISTS (
      SELECT 1
      FROM cell_attendance_sessions s
      JOIN cells c ON c.id = s.cell_id
      WHERE s.id = session_id
        AND c.ministry_id IN (SELECT public.user_ministry_ids())
    )
  );

COMMENT ON TABLE cells IS 'Phase 3 operational cells. Scoped SELECT by ministry. Mutations via server services.';
COMMENT ON TABLE cell_memberships IS 'Historical cell memberships referencing persons. No person duplication.';
COMMENT ON TABLE cell_attendance_sessions IS 'Weekly attendance sessions per cell.';
COMMENT ON TABLE cell_attendance IS 'Per-person attendance rows for a session.';
