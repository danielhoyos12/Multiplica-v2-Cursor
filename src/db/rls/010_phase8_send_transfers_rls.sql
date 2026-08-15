-- Phase 8 RLS — pastoral transfer requests + history tables
-- Uses helpers from earlier phases: is_superadmin(), user_ministry_ids(), user_person_id()

ALTER TABLE pastoral_transfer_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE pastoral_transfer_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE leadership_relationship_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE leadership_relationship_history FORCE ROW LEVEL SECURITY;
ALTER TABLE cell_leadership_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE cell_leadership_history FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pastoral_transfer_requests_select ON pastoral_transfer_requests;
CREATE POLICY pastoral_transfer_requests_select ON pastoral_transfer_requests
  FOR SELECT TO authenticated
  USING (
    public.is_superadmin()
    OR requested_by_user_id = auth.uid()
    OR approved_by_user_id = auth.uid()
    OR source_ministry_id IN (SELECT public.user_ministry_ids())
    OR destination_ministry_id IN (SELECT public.user_ministry_ids())
    OR person_id = public.user_person_id()
    OR proposed_direct_leader_person_id = public.user_person_id()
    OR (
      public.user_person_id() IS NOT NULL
      AND public.is_leadership_descendant(public.user_person_id(), person_id)
    )
  );

DROP POLICY IF EXISTS pastoral_transfer_requests_insert ON pastoral_transfer_requests;
CREATE POLICY pastoral_transfer_requests_insert ON pastoral_transfer_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_superadmin()
    OR requested_by_user_id = auth.uid()
  );

DROP POLICY IF EXISTS pastoral_transfer_requests_update ON pastoral_transfer_requests;
CREATE POLICY pastoral_transfer_requests_update ON pastoral_transfer_requests
  FOR UPDATE TO authenticated
  USING (
    public.is_superadmin()
    OR source_ministry_id IN (SELECT public.user_ministry_ids())
    OR destination_ministry_id IN (SELECT public.user_ministry_ids())
    OR requested_by_user_id = auth.uid()
  )
  WITH CHECK (
    public.is_superadmin()
    OR source_ministry_id IN (SELECT public.user_ministry_ids())
    OR destination_ministry_id IN (SELECT public.user_ministry_ids())
    OR requested_by_user_id = auth.uid()
  );

DROP POLICY IF EXISTS leadership_relationship_history_select ON leadership_relationship_history;
CREATE POLICY leadership_relationship_history_select ON leadership_relationship_history
  FOR SELECT TO authenticated
  USING (
    public.is_superadmin()
    OR ministry_id IN (SELECT public.user_ministry_ids())
    OR person_id = public.user_person_id()
    OR (
      public.user_person_id() IS NOT NULL
      AND public.is_leadership_descendant(public.user_person_id(), person_id)
    )
  );

DROP POLICY IF EXISTS leadership_relationship_history_insert ON leadership_relationship_history;
CREATE POLICY leadership_relationship_history_insert ON leadership_relationship_history
  FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin() OR actor_user_id = auth.uid());

DROP POLICY IF EXISTS cell_leadership_history_select ON cell_leadership_history;
CREATE POLICY cell_leadership_history_select ON cell_leadership_history
  FOR SELECT TO authenticated
  USING (
    public.is_superadmin()
    OR EXISTS (
      SELECT 1 FROM cells c
      WHERE c.id = cell_leadership_history.cell_id
        AND c.ministry_id IN (SELECT public.user_ministry_ids())
    )
  );

DROP POLICY IF EXISTS cell_leadership_history_insert ON cell_leadership_history;
CREATE POLICY cell_leadership_history_insert ON cell_leadership_history
  FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin() OR actor_user_id = auth.uid());

COMMENT ON TABLE pastoral_transfer_requests IS
  'RLS: Superadmin global; LG ministry scoped; requester/approver; tree-scoped leaders. Anonymous DENY.';
