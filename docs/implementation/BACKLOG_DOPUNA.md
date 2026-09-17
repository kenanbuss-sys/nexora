# Prioritizovan backlog dopune — nakon audita 17.09.2026

Jedan objedinjeni backlog: (a) nedostaci postojeće vizije, (b) FinTrack pokriće, (c) HR pokriće, (d) UI/adapteri/pilot. Organizovan u POTPUNE poslovne tokove — svaki sprint daje upotrebljiv rezultat (UI + backend + dozvole + testovi). Novi capability ID-evi su dodani u katalog i matricu (status PLANNED).

## Faza 1 — Finansijsko jezgro (FinTrack paritet, najveća vrijednost)

| # | Tok / sprint kandidat | Capability IDs | Napomena |
|---|---|---|---|
| 1 | **Sprint 211: Glavna knjiga — jezgro** (detalji u docs/session/CURRENT_SPRINT.md) | FIN-023, FIN-024, FIN-025, FIN-026 | ADR za ODL-001 prije početka; šema → CI regen tok |
| 2 | Kartice + bruto bilans + GL izvještaji (UI uključen) | FIN-027, FIN-029 | zavisi od 1 |
| 3 | Bankovni izvodi + zatvaranje + kompenzacije | FIN-030, FIN-031, FIN-032, AI-016 | AI port za vision; DevBankFeed zamjena po banci kasnije |
| 4 | KUF/KIF + PDV (BiH lokalizacioni paket) | FIN-028 | config paket "accounting-bih" |
| 5 | AI unos faktura + AI prijedlozi knjiženja (draft-only) | AI-016, FIN-033 | prijedlog→approval→izvršenje obrazac postoji |

## Faza 2 — HR/radna snaga paritet

| # | Tok | Capability IDs | Napomena |
|---|---|---|---|
| 6 | Šihtarica-matrica + audit izmjena + presjek | HCM-015 | ODL-002: koegzistencija s clock modelom |
| 7 | Obračun plata + listići + salary permisije | HCM-013, HCM-014 | FieldPolicy + nove permisije; bez UUID lista |
| 8 | Ugovori iz šablona + isticanje + dokumenti radnika UI | HCM-016 (+DOC-007 reuse) | object storage za dokumente |
| 9 | Bonusi/lige/checkliste/coaching | HCM-017 | trener-scope server-side |
| 10 | Zadaci multi-assignee/periodični + sastanci s carry-over | WF-013, WF-014 | AI agenda sigurnosni filter obavezan |
| 11 | Employee self-service portal | HCM-018 | plata zabranjena po dizajnu |
| 12 | HR platforma paritet | HCM-020 | **BLOKIRANO** do pristupa repou (ODL-005) |

## Faza 3 — Oprema/vozila/operativa

| # | Tok | Capability IDs |
|---|---|---|
| 13 | Zaduženja opreme + reversi + QR naljepnice + javni uvid | EAM-015, EAM-016 |
| 14 | Vozni park (fleet ops) | EAM-017 |
| 15 | Push notifikacije (web-push adapter) + dnevni podsjetnici | postojeće CORE + adapter |
| 16 | Klijentski error log + per-tenant backup export | OPS-019 + postojeće |

## Faza 4 — UI produbljivanje + pilot spremnost (paralelno s fazama 1-3)

- Svaki gornji sprint NOSI svoj UI (pravilo od Sprinta 211 — bez backend-only sprintova).
- Re-verifikacija 18 "Partially implemented" sposobnosti (lista u AUDIT_2026-09-17 §2) — po jedan mini-zadatak po domenu.
- Stvarni adapteri po pilot obimu: OIDC provider, e-mail/web-push, AI provider (Claude API), fiskalni BiH, bankovni format(i).
- Staging → pilot uslovi: AUDIT_2026-09-17_VERIFIED_STATE.md §4 (autentikacija, tajne, migracije, backup proba, monitoring, onboarding).

## Faza 5 — Kasnije (P3, poslije pilota)

Voice asistent (AI-015), Control Center (BI-016), AI Direktor UI, uputstva u aplikaciji (DOC-013), registar odluka kroz GRC, playbook kroz checkliste (ODL-004), migracija stvarnih podataka (ODL-008 — poseban projekat s dry-run/kontrolne zbirove/rollback).

Ne planiramo stotine sprintova unaprijed: obavezan je samo Sprint 211 (definisan); redoslijed faza 1→2→3 potvrditi nakon ODL-001/002/005.
