# START HERE — First Claude Code Prompt

Place this entire pack at the root of a new Git repository, start Claude Code from the repository root, and send:

> Read `CLAUDE.md`, then `docs/00_SOURCE_OF_TRUTH.md` and every document it marks mandatory. This repository specifies a new enterprise Business Operating System and is a separate product. Before writing application code: (1) run a documentation consistency review; (2) validate capability IDs, domain ownership, events, state machines, security rules and implementation dependencies; (3) review `docs/architecture/00_DECISIONS_LOCKED.md` and list only decisions that are genuinely blocked or contradictory; (4) create an ADR only if an architectural decision must change; (5) produce a concise implementation plan for **Sprint 000 only** from `docs/implementation/SPRINT_000_FOUNDATION.md`; (6) wait for approval before implementing. Do not attempt later sprints, customer-specific code, or weaken tenant isolation, authorization, audit, ledger, event, integration or device boundaries for speed. Every future code change must reference relevant capability IDs and domain specs.

After Claude reports the review and Sprint 000 plan, review it before authorizing implementation.
