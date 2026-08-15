-- MULTIPLICA Phase 0 — Foundation RLS
-- Apply AFTER Drizzle schema migrations.
-- Policy: deny by default; authenticated reads only where explicitly allowed.
-- Sensitive mutations go through server-side services using the service role
-- or narrowly scoped policies. Never expose service_role to the browser.

-- Enable RLS on all foundation tables
ALTER TABLE districts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ministries ENABLE ROW LEVEL SECURITY;
ALTER TABLE networks ENABLE ROW LEVEL SECURITY;
ALTER TABLE persons ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_role_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE person_organization_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Force RLS for table owners as well (defense in depth on Supabase)
ALTER TABLE districts FORCE ROW LEVEL SECURITY;
ALTER TABLE ministries FORCE ROW LEVEL SECURITY;
ALTER TABLE networks FORCE ROW LEVEL SECURITY;
ALTER TABLE persons FORCE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE roles FORCE ROW LEVEL SECURITY;
ALTER TABLE permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE role_permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE user_role_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE person_organization_history FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

-- Catalogs: authenticated users can read active rows
DROP POLICY IF EXISTS districts_select_authenticated ON districts;
CREATE POLICY districts_select_authenticated
  ON districts FOR SELECT TO authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS networks_select_authenticated ON networks;
CREATE POLICY networks_select_authenticated
  ON networks FOR SELECT TO authenticated
  USING (is_active = true OR is_configurable = true);

DROP POLICY IF EXISTS ministries_select_authenticated ON ministries;
CREATE POLICY ministries_select_authenticated
  ON ministries FOR SELECT TO authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS roles_select_authenticated ON roles;
CREATE POLICY roles_select_authenticated
  ON roles FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS permissions_select_authenticated ON permissions;
CREATE POLICY permissions_select_authenticated
  ON permissions FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS role_permissions_select_authenticated ON role_permissions;
CREATE POLICY role_permissions_select_authenticated
  ON role_permissions FOR SELECT TO authenticated
  USING (true);

-- Users: can read/update own profile only (Phase 0). Broader access via service role.
DROP POLICY IF EXISTS users_select_own ON users;
CREATE POLICY users_select_own
  ON users FOR SELECT TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS users_update_own ON users;
CREATE POLICY users_update_own
  ON users FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Assignments: user can read own role assignments
DROP POLICY IF EXISTS user_role_assignments_select_own ON user_role_assignments;
CREATE POLICY user_role_assignments_select_own
  ON user_role_assignments FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Persons / org history / audit: NO client policies in Phase 0.
-- Default deny. Server actions/services use service_role after domain authorization.
-- Future phases will add tree-scoped policies carefully.

COMMENT ON TABLE persons IS 'RLS enabled; no authenticated policies in Phase 0 (deny by default). Access via server services.';
COMMENT ON TABLE audit_logs IS 'RLS enabled; deny by default for authenticated clients. Inserts via service role only.';
COMMENT ON TABLE person_organization_history IS 'RLS enabled; deny by default for authenticated clients.';
