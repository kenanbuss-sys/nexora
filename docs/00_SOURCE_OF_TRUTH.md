# Source of Truth

## Mandatory global documents
1. `CLAUDE.md`
2. `docs/01_PRODUCT_VISION_AND_PRINCIPLES.md`
3. `docs/02_MASTER_CAPABILITY_CATALOG.md`
4. `docs/architecture/00_DECISIONS_LOCKED.md`
5. `docs/architecture/01_DOMAIN_MAP.md`
6. `docs/architecture/02_CANONICAL_DATA_MODEL.md`
7. `docs/architecture/03_EVENT_ARCHITECTURE.md`
8. `docs/architecture/04_STATE_MACHINES.md`
9. `docs/architecture/05_WORKFLOW_RULES_AUTOMATION.md`
10. `docs/architecture/06_TENANCY_WHITE_LABEL.md`
11. `docs/architecture/07_API_CONVENTIONS.md`
12. `docs/architecture/08_CONCURRENCY_IDEMPOTENCY.md`
13. `docs/architecture/09_INTEGRATION_HUB.md`
14. `docs/architecture/10_DEVICE_EDGE_OFFLINE.md`
15. `docs/architecture/11_REFERENCE_FLOWS.md`
16. `docs/architecture/12_FINANCE_BOUNDARY.md`
17. `docs/architecture/13_ANALYTICS_ARCHITECTURE.md`
18. `docs/architecture/14_AI_GOVERNANCE.md`
19. `docs/architecture/15_EXTENSION_ARCHITECTURE.md`
20. `docs/architecture/16_REPOSITORY_TECHNICAL_BLUEPRINT.md`
21. `docs/architecture/17_NON_FUNCTIONAL_REQUIREMENTS.md`
22. `docs/architecture/18_OPEN_DECISIONS.md`
23. `docs/architecture/19_DOMAIN_DEPENDENCY_GRAPH.md`
24. `docs/security/01_SECURITY_BASELINE.md`
25. `docs/security/02_THREAT_MODEL.md`
26. `docs/security/03_AUDIT_SPEC.md`
27. `docs/security/04_PERMISSION_MODEL.md`
28. `docs/data/01_DATA_GOVERNANCE.md`
29. `docs/data/02_MIGRATION_LEGACY_COEXISTENCE.md`
30. `docs/data/03_NUMERIC_TIME_NUMBERING.md`
31. `docs/operations/01_OBSERVABILITY_SLO.md`
32. `docs/operations/02_TESTING_STRATEGY.md`
33. `docs/operations/03_CI_CD_RELEASES.md`
34. `docs/operations/04_BACKUP_DR.md`
35. `docs/implementation/ROADMAP.md`
36. `docs/implementation/RELEASE_GATES.md`
37. `docs/implementation/DEFINITION_OF_DONE.md`
38. `docs/implementation/CLAUDE_CODE_OPERATING_MODEL.md`

Before implementing a domain, read its file under `docs/domains/`. For UX, read relevant `docs/ux/` files.

## Machine-readable specs
`specs/capabilities.json`, `specs/domain_ownership.csv`, `specs/domain_dependencies.json`, `specs/events.json`, `specs/state_machines.json`, `specs/permissions.csv`, `specs/implementation_matrix.csv`.

## Precedence
Accepted ADR > CLAUDE absolute rules > security/tenant isolation > domain ownership/invariants > state machines/events > domain specs > UX specs > sprint plan.

If documents conflict, stop and propose an ADR; never choose silently.
