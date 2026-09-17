# Session handoff
Date: 17.09.2026 · Branch: docs/software-factory-md-v1 (from main @ a914c71, not committed, not pushed)

Goal: install Software-Factory-MD-v1 instructions in the canonical Nexora checkout.

Canonical checkout: ~/nexora (HEAD a914c71; the nested ~/nexora/nexora clone is at 88aef4f, an ancestor, clean). Nested clone not touched or deleted.

Done:
- Package MANIFEST.sha256 verified; archive equals previous CLAUDE.md byte-for-byte.
- CLAUDE.md → 5-line wrapper importing AGENTS.md. AGENTS.md contains every original constitution line plus "Session efficiency".
- Added docs/archive/ and docs/session/.
- Unchanged: docs/00_SOURCE_OF_TRUTH.md mandatory chain, .claude/rules (5), agents (5), skills (5), app code, deploy.

Open contradictions: MANIFEST.json sha256 for CLAUDE.md (already 3 other mismatches before), SPEC_READINESS_REPORT "CLAUDE.md lines: 53", code comments "see CLAUDE.md absolute rules" — rules now in AGENTS.md via import. Rules have no paths: frontmatter (always loaded); not changed.

Not verified: tests, typecheck, lint, production, /context numbers.

Next: new session in ~/nexora, /memory + /context, review diff, decide on MANIFEST/report update, commit docs only.
