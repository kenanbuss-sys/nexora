# HANDOFF — 03.10.2026 (Sprintovi 232–235)

Stanje: grana `claude/lucid-dijkstra-qywmaw` (osnova `docs/software-factory-md-v1` @ 88988f1; main netaknut).
- **232 FIN-028** KUF/KIF + PDV, UI /vat; **233 FIN-033** prijedlozi knjiženja (samo nacrt); **234 HCM-015** šihtarica (ODL-002 oba modela).
- **235 HCM-013/014** plate: permisije `hcm.salary.read/contract/manage/management` (samo tenant-wide grant; tenant-admin ih NEMA — salary krug dodijeliti ulogom), upravljačko zaključavanje važi i za historiju, obračun iz zaključane šihtarice, potvrda nepromjenjiva + `payroll.confirmed` bez iznosa, listići; UI /payroll. Security review: 6 nalaza ispravljeno.
- Migracije 232–235 aditivne (233 = parcijalni unique indeksi, čuvati pri regeneraciji).

Provjere: sprint232 14/14, 233 8/8, 234 10/10, 235 10/10; regresija 211–214/222/203/072 zelena; typecheck/lint/build — CURRENT_SPRINT.

Mac: `git fetch && git checkout claude/lucid-dijkstra-qywmaw && bash scripts/mac-dev.sh`.

Otvoreno: browser provjera /vat, /ledger prijedloga, /hr Šihtarice, /payroll; porezi/doprinosi plata; AI-016 provider; FIN-021. Sljedeće: Faza 2 red 8 — HCM-016 ugovori iz šablona + isticanje + dokumenti radnika.
