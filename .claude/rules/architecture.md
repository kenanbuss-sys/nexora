---
description: Architecture boundaries for all application code
---
# Architecture Rules
- Respect the domain map.
- Cross-domain mutations use owning-domain commands/services.
- Never create customer-specific branches.
- No new infrastructure/microservice without ADR.
- Reliable business events use transactional outbox.
- Provider/vendor code stays in adapters.
