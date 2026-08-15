-- MULTIPLICA Phase 1 — Ministry-scoped RLS helpers and policies
-- Apply AFTER 0001 schema migration. Deny-by-default remains for sensitive tables.
-- Mutations for admin flows go through server services after domain authorization.

CREATE OR REPLACE FUNCTION public.is_superadmin()
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
      AND r.code = 'superadmin'
  );
$$;

CREATE OR REPLACE FUNCTION public.user_ministry_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ura.ministry_id
  FROM user_role_assignments ura
  WHERE ura.user_id = auth.uid()
    AND ura.ends_at IS NULL
    AND ura.ministry_id IS NOT NULL
  UNION
  SELECT m.id
  FROM ministries m
  WHERE m.responsible_user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.is_superadmin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_ministry_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_superadmin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_ministry_ids() TO authenticated;

-- Replace broad ministry catalog read with scoped isolation
DROP POLICY IF EXISTS ministries_select_authenticated ON ministries;

CREATE POLICY ministries_select_scoped
  ON ministries FOR SELECT TO authenticated
  USING (
    public.is_superadmin()
    OR id IN (SELECT public.user_ministry_ids())
  );

-- Superadmin (and self) can read users for admin assignment UI
DROP POLICY IF EXISTS users_select_own ON users;

CREATE POLICY users_select_self_or_superadmin
  ON users FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_superadmin());

-- Role assignments: own rows or superadmin
DROP POLICY IF EXISTS user_role_assignments_select_own ON user_role_assignments;

CREATE POLICY user_role_assignments_select_self_or_superadmin
  ON user_role_assignments FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_superadmin());

-- Audit: superadmin may read via PostgREST; inserts still service-role/server only
DROP POLICY IF EXISTS audit_logs_select_superadmin ON audit_logs;
CREATE POLICY audit_logs_select_superadmin
  ON audit_logs FOR SELECT TO authenticated
  USING (public.is_superadmin());

COMMENT ON FUNCTION public.is_superadmin() IS 'Phase 1 authz helper: true when actor has active superadmin role.';
COMMENT ON FUNCTION public.user_ministry_ids() IS 'Phase 1 authz helper: ministry UUIDs from assignments or responsible_user_id.';
