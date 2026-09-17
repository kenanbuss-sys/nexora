# nexora state
Ažurirano: 17.09.2026 · grana `docs/software-factory-md-v1` (main @ a914c71).

**Aplikacija:** 512 sposobnosti u katalogu+matrici (usklađeni); 494 označene implementiranima (backend + integracioni testovi), 18 "Partially implemented" (re-verifikacija u backlogu). Svježe provjereno na a914c71: 196 test fajlova / 772 testa zeleno; E2E tok prijem→otprema 7/7 (uklj. authz/cross-tenant/idempotencija). CI zelen (06feb0b, 08.09.). UI: 28 sekcija / ~35 ekrana — tanak sloj. Adapteri: identitet/potpis/banka/OCR/AI/konektori su DEV ili noop → pilot blokatori.

**Novi obavezni zahtjev (17.09.):** Nexora pokriva sve poslovne mogućnosti FinTracka i HR platforme — kao vlastita implementacija (konfiguracija/permisije/adapteri), bez zavisnosti od tih aplikacija. FinTrack inventarisan (docs/implementation/FINTRACK_INVENTORY.md); mapa pokrića specs/fintrack_hr_coverage_matrix.csv (24 nova capability ID-a, PLANNED); registar odluka docs/implementation/FINTRACK_HR_GAP_REGISTER.md. **HR repo (kenanbuss-sys/xcalltech-hr) nedostupan — HCM-020 BLOKIRANO (ODL-005).**

**Sprint 211 (GL jezgro) ZAVRŠEN 17.09.:** FIN-023..026 DONE (backend + UI /ledger + testovi 9/9, ADR-0001, permisije finance.ledger.*). **Sljedeće:** potvrda obima Sprinta 212 (FIN-027 kartice + FIN-029 bruto bilans) iz BACKLOG_DOPUNA faze 1. Uslovi staging/pilot: AUDIT_2026-09-17_VERIFIED_STATE.md §4.

**Konfiguracija:** AGENTS.md + CLAUDE.md wrapper instalirani; rules/agents/skills netaknuti; ugniježdeni klon `nexora/` (88aef4f) netaknut, van gita.
