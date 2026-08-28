# Claude Code Operating Model

Claude Code implements; it is not product owner. `CLAUDE.md` stays concise, detailed topic rules live in `.claude/rules`, repeatable workflows in skills, independent reviews in agents.

Session: read source -> plan one bounded task -> user approval -> implement -> checks -> independent review when risk justifies -> update docs/matrix -> review/commit.

Never ask for whole platform in one session. Architecture conflict -> stop, explain, ADR, wait. Use focused read-only subagents; major release gate may use architecture + security + data reviewers independently.
