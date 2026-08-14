# MULTIPLICA — Domain invariants (critical)

These invariants condition all future development. Application code, RLS, and migrations must not violate them. Hiding a button is not security.

1. **Una persona = un registro maestro.** Ganar is the identity entry point and source of truth.
2. Other processes reference `person_id`; they do not duplicate persons.
3. The ladder is: Ganar → Consolidar → Discipular, while Enviar starts from Re-Encuentro/anointing and continues in parallel.
4. **Ungido ≠ líder activado.**
5. An active leader requires a valid activation **and** their own cell.
6. Only an active leader with a cell counts within the 12.
7. An evangelistic cell may have any number of attendees.
8. Reaching 12 active leaders with cells enables/requests conversion to Célula de 12.
9. The Célula de 12 is closed and contains leaders.
10. A leader may have at most two direct cells: one evangelistic and one of 12.
11. A reassignment never creates a third cell.
12. Escuela de Líderes graduation requires complete academic requirements + minimum 12 **members** in their cell; those 12 need not be leaders.
13. Each Capacitación Destino and Escuela Ministerial level contains Doctrina + Seminario, 10 classes per module, advancing in parallel.
14. States `cursando`, `apto`, `completado` and KPIs are **derived** from data; they are not manual counters.
15. Visibility is downward: a leader sees their node and authorized descendants; never superiors or lateral branches by default.
16. Hombres may manage Hombres and Jóvenes; Mujeres, Mujeres and Jóvenes; Jóvenes, only Jóvenes.
17. Changing Red or Ministerio does not create a new person and does not erase history.
18. People under a leader are never lost because of exit, transfer, or reassignment.
19. Critical actions must be audited.
20. Critical restrictions are enforced in backend and database when reasonable.

## Modeling notes

- Do **not** use a single `persons.status` field for the whole journey.
- Model independent domain states and compute a journey summary view for UI.
- Prefer transactions for composite operations (e.g. activate leader + credentials + leadership + open cell).
- Soft-delete / historical rows where hard deletes would destroy traceability.

## Open pastoral decisions

Do not invent business rules. When ambiguity would change domain behavior, stop that slice, document the question, and continue only with independent work.
