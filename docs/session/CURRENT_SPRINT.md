# Active sprint — Sprint 212 (prijedlog): GL kartice + bruto bilans (FIN-027, FIN-029)

Prethodni **Sprint 211 (GL jezgro) — ZAVRŠEN 17.09.2026**, commit `feat(fin): Sprint 211`:
- [x] FIN-023 nalozi draft→posted, D=P invarijanta, numeracija po pravnom licu, idempotentan post
- [x] FIN-024 kontni plan (8 cifara) po pravnom licu + kopiranje + system accounts + lijena partner analitika (MDM)
- [x] FIN-025 datum početnog stanja (guard) + zaključavanje perioda
- [x] FIN-026 zrcalni storno kao jedina ispravka; posted nepromjenjiv (draft DELETE 409 poslije knjiženja)
- [x] Permisije finance.ledger.read/post/manage (per-user, u tenant-admin baseline)
- [x] UI /ledger: Nalozi (draft forma s D=P pregledom, proknjiži, storno) + Kontni plan
- [x] Testovi sprint211: 9/9 (uklj. cross-tenant, bez permisije, opening/lock guardovi, audit)
- [x] ADR-0001 evidentiran; docs/architecture/12_FINANCE_BOUNDARY.md usklađen
- [x] Migracija 20260917000211_sprint_211_gl_core + lokalni Prisma regen; puna API suita zelena

Lokalna provjera: `cd apps/api && DATABASE_URL=postgresql://app:app@localhost:5432/enterprise_os REDIS_URL=redis://localhost:6379 INTEGRATION=1 pnpm exec vitest run src/sprint211.integration.test.ts`; UI: web dev server → /ledger (permisija finance.ledger.read).

Sprint 212 obim: BACKLOG_DOPUNA faza 1 red 2 — čeka potvrdu vlasnika.
