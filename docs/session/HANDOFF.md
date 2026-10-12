# HANDOFF — 12.10.2026 (Sprintovi 232–252)

Stanje: grana `claude/lucid-dijkstra-qywmaw` (main netaknut). 232–246 završeni ranije (FIN/HCM/EAM/WMS/PIM/MDM/QMS/PLAN/CSM/WF — vidi PROJECT_STATE).

**247–251: tok „proizvodnja i montaža po mjeri“ (prvi stvarni klijent).** CPQ po mjeri, avans + konačna faktura + auto-KIF, RN iz narudžbe, montaže s ekipom/vozilom, „Moj posao danas“ i Vodič po ulozi; seeder `scripts/seed-made-to-measure.mjs` (privatni profil, `--dry-run`, idempotentan). Runbook: `docs/implementation/MADE_TO_MEASURE_ONBOARDING.md`. Migracije 249/250 (parcijalni unique/CHECK nisu u schema.prisma — čuvati).

**252: vremenska zona tenanta** — `locale.timeZone` (IANA, validirano, default UTC); `@nexora/kernel` zoned-time (DST); periodični zadaci, početna po ulozi i termini seedera po lokalnom vremenu. Bez migracije.

Provjere: sprint252 4/4, 246 5/5, 249 5/5, kernel unit 4/4, xlsx 2/2; typecheck/lint zeleni; puna regresija nakon 251: 954/954.

Blokeri: `~/Downloads/NEXORA 2026/` i Mac localhost nedostupni iz clouda; kolone Bosfor cjenovnika nepotvrđene (`--dry-run` na Macu). Dev Postgres u cloudu pada kad se kontejner uspava → `bash scripts/dev-up.sh`.

Sljedeće: pilot kod klijenta; zatim HCM-018 (samoposluga zaposlenih).
