# MULTIPLICA — Domain invariants (critical)

These invariants condition all future development. Application code, RLS, and migrations must not violate them. Hiding a button is not security.

1. **Una persona = un registro maestro.** Ganar is the identity entry point and source of truth.
2. Other processes reference `person_id`; they do not duplicate persons.
3. The official pastoral ladder is:
   **Ganar → Consolidar (Pre-Encuentro → Encuentro → Post-Encuentro) → Discipular (CD1 → CD2 → Re-Encuentro → CD3 → EM1 → EM2 → EM3) → Enviar.**
   UDV is **not** a gate between Post-Encuentro and CD1. Re-Encuentro sits between CD2 and CD3 (not after Escuela Ministerial).
   Ordinary entry to Enviar requires **EM3 completed**. Completing Enviar does **not** auto-activate leadership or create cells.
4. **Ungido ≠ líder activado.** Ungimiento reuses `person_leadership.status = eligible`. Activation remains Phase 4 (`active` + cell + credentials when required).
5. An active leader requires a valid activation **and** their own cell.
6. Only an active leader with a cell counts within the 12.
7. An evangelistic cell may have any number of attendees.
8. Reaching 12 active leaders with cells enables/requests conversion to Célula de 12.
9. The Célula de 12 is closed and contains leaders.
10. A leader may have at most two direct cells: one evangelistic and one of 12.
11. A reassignment never creates a third cell.
12. Pastoral cell-member requirements (e.g. 12 active members) are configurable per program via `training_completion_requirements` and are distinct from G12 leaders. Do not hardcode unverified 12-person gates on every CD/EM level.
13. Each Capacitación Destino and Escuela Ministerial level contains Doctrina + Seminario, 10 classes per component, names configurable (no invented doctrinal titles).
14. States `cursando`, `apto`, `completado` and KPIs are **derived** from data; they are not manual counters.
15. Visibility is downward: a leader sees their node and authorized descendants; never superiors or lateral branches by default.
16. Hombres may manage Hombres and Jóvenes; Mujeres, Mujeres and Jóvenes; Jóvenes, only Jóvenes.
17. Changing Red or Ministerio does not create a new person and does not erase history. Close the current `person_organization_history` row (`effective_to`) and open a new one.
18. People under a leader are never lost because of exit, transfer, or reassignment (**no-orphan**). Deactivation with structure requires an explicit plan (`leader_deactivation`).
19. Critical actions must be audited.
20. Critical restrictions are enforced in backend and database when reasonable.
21. Completing any formation stage does **not** auto-activate leadership, create cells, or create credentials.
22. `eligible ≠ enrolled` — aptitude never auto-enrolls.
23. Pastoral transfers use `pastoral_transfer_requests` (draft → pending → approved → executed). Executed transfers are idempotent; concurrent execute is guarded; failures rollback.
24. Subtree moves travel with descendants; rebuild `leadership_closure` transactionally; cycles and 13th direct child are blocked. Closure is current-state, not history — use `leadership_relationship_history`.
25. Cross-ministry moves require approval; never unilateral lateral moves.
26. Username / `human_leader_code` / auth identity are stable across transfers; scopes update, identities do not duplicate.
## Modeling notes

- Do **not** use a single `persons.status` field for the whole journey.
- Model independent domain states and compute a journey summary view for UI.
- Prefer transactions for composite operations (e.g. activate leader + credentials + leadership + open cell).
- Soft-delete / historical rows where hard deletes would destroy traceability.

## Open pastoral decisions

Do not invent business rules. When ambiguity would change domain behavior, stop that slice, document the question, and continue only with independent work.
