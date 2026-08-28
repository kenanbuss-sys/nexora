# Open Decisions

No open decision blocks Sprint 000.

The following remain intentionally deployment/release-specific and are selected by ADR when needed:
- production cloud/hosting provider
- production OIDC identity provider
- production object-storage provider
- email/SMS/push providers
- country fiscal/eInvoice/accounting providers
- courier/marketplace connectors
- reference handheld/printer vendors beyond adapter contracts
- analytical warehouse technology when OLTP projections are no longer sufficient
- Kubernetes/microservices only if measured scale/operations justify them

Claude Code must not choose a permanent provider merely for convenience during a generic core sprint.
