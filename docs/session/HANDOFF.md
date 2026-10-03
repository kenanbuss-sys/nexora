# HANDOFF — 03.10.2026 (Sprintovi 232–236)

Stanje: grana `claude/lucid-dijkstra-qywmaw` (osnova `docs/software-factory-md-v1` @ 88988f1; main netaknut).
- **232 FIN-028** KUF/KIF + PDV (/vat); **233 FIN-033** prijedlozi knjiženja (samo nacrt); **234 HCM-015** šihtarica (ODL-002 oba modela).
- **235 HCM-013/014** plate (/payroll): `hcm.salary.read/contract/manage/management`, samo tenant-wide grant, tenant-admin ih NEMA.
- **236 HCM-016** ugovori o radu iz DOC šablona (whitelist polja, tekst zamrznut, plata + iznos slovima samo uz salary contract scope), isticanje → jedan zadatak po ugovoru, dokumenti radnika kao PRIVATNI collab tip (`hcm.docs.read/manage`, audit čitanja). Upravljačko zaključavanje (`employee.salaryLocked`) pokriva plate, ugovore i dokumente. UI /hr „Ugovori".
- Migracije 232–236 aditivne (233 = parcijalni unique indeksi, čuvati pri regeneraciji).

Provjere: sprint232 14/14, 233 8/8, 234 10/10, 235 10/10, 236 8/8; regresija FIN/HCM/collab zelena; typecheck/lint/build — CURRENT_SPRINT.

Mac: `git fetch && git checkout claude/lucid-dijkstra-qywmaw && bash scripts/mac-dev.sh`.

Otvoreno: browser provjera /vat, /ledger, /hr (Šihtarica, Ugovori), /payroll; porezi/doprinosi; PDF ugovora; AI-016 provider; FIN-021. Sljedeće: Faza 2 red 9 — HCM-017 bonusi/lige/checkliste/coaching (trener-scope server-side).
