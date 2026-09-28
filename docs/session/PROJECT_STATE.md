# nexora state
Ažurirano: 17.09.2026 · grana `docs/software-factory-md-v1` (main @ a914c71).

**Aplikacija:** 512 sposobnosti u katalogu+matrici (usklađeni); 494 označene implementiranima (backend + integracioni testovi), 18 "Partially implemented" (re-verifikacija u backlogu). Svježe provjereno na a914c71: 196 test fajlova / 772 testa zeleno; E2E tok prijem→otprema 7/7 (uklj. authz/cross-tenant/idempotencija). CI zelen (06feb0b, 08.09.). UI: 28 sekcija / ~35 ekrana — tanak sloj. Adapteri: identitet/potpis/banka/OCR/AI/konektori su DEV ili noop → pilot blokatori.

**Novi obavezni zahtjev (17.09.):** Nexora pokriva sve poslovne mogućnosti FinTracka i HR platforme — kao vlastita implementacija (konfiguracija/permisije/adapteri), bez zavisnosti od tih aplikacija. FinTrack inventarisan (docs/implementation/FINTRACK_INVENTORY.md); mapa pokrića specs/fintrack_hr_coverage_matrix.csv (24 nova capability ID-a, PLANNED); registar odluka docs/implementation/FINTRACK_HR_GAP_REGISTER.md. **HR repo (kenanbuss-sys/xcalltech-hr) nedostupan — HCM-020 BLOKIRANO (ODL-005).**

**Sprint 211 (GL jezgro) ZAVRŠEN 17.09.:** FIN-023..026 DONE (backend + UI /ledger + testovi 9/9, ADR-0001, permisije finance.ledger.*). **Sprint 212 ZAVRŠEN 17.09.:** FIN-027 + FIN-029 DONE (read-only izvještaji + UI tabovi + 6/6 testova); mac-auto sync više ne odbacuje lokalni rad. Grana docs/software-factory-md-v1 pushana na GitHub (bez merge u main). **Sljedeće:** potvrda Sprinta 213 (FIN-030/031 + AI-016). Uslovi staging/pilot: AUDIT_2026-09-17_VERIFIED_STATE.md §4.

**Sprintovi 213–231 ZAVRŠENI 17.09.** (detalji: CURRENT_SPRINT.md). **Sprint 232 ZAVRŠEN 28.09.:** FIN-028 DONE (KUF/KIF + PDV period/prijava/uplata, paket accounting-bih kao podaci, UI /vat, migracije 232/233, sprint232 14/14) na grani `claude/lucid-dijkstra-qywmaw`. **Sprint 233 ZAVRŠEN 28.09.:** FIN-033 DONE (prijedlozi knjiženja iz presedana, samo nacrt, sigurnost pravilom; sprint233 8/8). Faza 1 backloga (finansijsko jezgro) završena osim produkcijskog AI-016 providera; sljedeće: Faza 2 (HCM-015 šihtarica — ODL-002 otvoren).

**Konfiguracija:** AGENTS.md + CLAUDE.md wrapper instalirani; rules/agents/skills netaknuti; ugniježdeni klon `nexora/` (88aef4f) netaknut, van gita.
