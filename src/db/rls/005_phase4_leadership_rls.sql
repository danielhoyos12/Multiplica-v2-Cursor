-- MULTIPLICA Phase 4 — Leadership / G12 tree RLS
-- Apply AFTER 0004 + 0005 schema migrations.
-- Tree scope: self + descendants. Leader General: whole ministry. Superadmin: global.
-- Avoid recursive per-row CTEs; use closure table + SECURITY DEFINER helpers.

ALTER TABLE person_leadership ENABLE ROW LEVEL SECURITY;
ALTER TABLE leadership_closure ENABLE ROW LEVEL SECURITY;
ALTER TABLE person_leadership FORCE ROW LEVEL SECURITY;
ALTER TABLE leadership_closure FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.user_person_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT person_id FROM users WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_leadership_descendant(p_ancestor uuid, p_descendant uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM leadership_closure
    WHERE ancestor_person_id = p_ancestor
      AND descendant_person_id = p_descendant
  );
$$;

CREATE OR REPLACE FUNCTION public.is_leader_general_for_ministry(p_ministry uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM user_role_assignments ura
    JOIN roles r ON r.id = ura.role_id
    WHERE ura.user_id = auth.uid()
      AND ura.ends_at IS NULL
      AND r.code = 'leader_general'
      AND ura.ministry_id = p_ministry
  )
  OR EXISTS (
    SELECT 1 FROM ministries m
    WHERE m.id = p_ministry AND m.responsible_user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.user_person_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_leadership_descendant(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_leader_general_for_ministry(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_person_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_leadership_descendant(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_leader_general_for_ministry(uuid) TO authenticated;

DROP POLICY IF EXISTS person_leadership_select_scoped ON person_leadership;
CREATE POLICY person_leadership_select_scoped
  ON person_leadership FOR SELECT TO authenticated
  USING (
    public.is_superadmin()
    OR public.is_leader_general_for_ministry(ministry_id)
    OR (
      public.user_person_id() IS NOT NULL
      AND public.is_leadership_descendant(public.user_person_id(), person_id)
    )
  );

DROP POLICY IF EXISTS leadership_closure_select_scoped ON leadership_closure;
CREATE POLICY leadership_closure_select_scoped
  ON leadership_closure FOR SELECT TO authenticated
  USING (
    public.is_superadmin()
    OR public.is_leader_general_for_ministry(ministry_id)
    OR (
      public.user_person_id() IS NOT NULL
      AND (
        ancestor_person_id = public.user_person_id()
        OR descendant_person_id = public.user_person_id()
        OR public.is_leadership_descendant(public.user_person_id(), ancestor_person_id)
        OR public.is_leadership_descendant(public.user_person_id(), descendant_person_id)
      )
    )
  );

-- Dual active memberships (member + twelve_team) for G12 leaders.
DROP INDEX IF EXISTS cell_memberships_active_person_role_uidx;
CREATE UNIQUE INDEX cell_memberships_active_person_role_uidx
  ON cell_memberships (person_id, role)
  WHERE status = 'active';

-- Active pastoral leader must own a primary cell.
ALTER TABLE person_leadership DROP CONSTRAINT IF EXISTS person_leadership_active_requires_cell;
ALTER TABLE person_leadership
  ADD CONSTRAINT person_leadership_active_requires_cell
  CHECK (status <> 'active' OR primary_cell_id IS NOT NULL);

COMMENT ON TABLE person_leadership IS 'Pastoral leadership state. Active requires own cell. Distinct from RBAC.';
COMMENT ON TABLE leadership_closure IS 'Closure table for G12 descendant queries. depth=0 is self.';
COMMENT ON FUNCTION public.is_leadership_descendant(uuid, uuid) IS 'True when ancestor reaches descendant via closure (includes self).';
COMMENT ON FUNCTION public.is_leader_general_for_ministry(uuid) IS 'True when actor is leader_general scoped to ministry or ministry.responsible_user_id.';
