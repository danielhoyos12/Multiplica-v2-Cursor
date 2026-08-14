-- MULTIPLICA Phase 2 — Persons / org-history scoped RLS for GANAR
-- Apply AFTER 0002 schema migration.
-- Anonymous: no policies → deny all.
-- Mutations for GANAR go through server services (domain authz), not open client inserts.

-- Current ministry helper for a person (open history row)
CREATE OR REPLACE FUNCTION public.person_current_ministry_id(p_person_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT poh.ministry_id
  FROM person_organization_history poh
  WHERE poh.person_id = p_person_id
    AND poh.effective_to IS NULL
  ORDER BY poh.effective_from DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.person_current_ministry_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.person_current_ministry_id(uuid) TO authenticated;

DROP POLICY IF EXISTS persons_select_scoped ON persons;
CREATE POLICY persons_select_scoped
  ON persons FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      public.is_superadmin()
      OR public.person_current_ministry_id(id) IN (SELECT public.user_ministry_ids())
    )
  );

DROP POLICY IF EXISTS person_organization_history_select_scoped ON person_organization_history;
CREATE POLICY person_organization_history_select_scoped
  ON person_organization_history FOR SELECT TO authenticated
  USING (
    public.is_superadmin()
    OR ministry_id IN (SELECT public.user_ministry_ids())
  );

-- Intake events: superadmin read only (telemetry)
ALTER TABLE person_intake_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE person_intake_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS person_intake_events_select_superadmin ON person_intake_events;
CREATE POLICY person_intake_events_select_superadmin
  ON person_intake_events FOR SELECT TO authenticated
  USING (public.is_superadmin());

COMMENT ON TABLE persons IS 'GANAR master identity. Scoped SELECT by current ministry. No anonymous access. Mutations via server services.';
COMMENT ON TABLE person_organization_history IS 'Temporal ministry/network membership. Scoped SELECT. Mutations via server services.';
COMMENT ON TABLE person_intake_events IS 'Public/internal intake telemetry. No prayer text. Deny-by-default except superadmin SELECT.';
