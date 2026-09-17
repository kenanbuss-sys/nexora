# Registar razlika i otvorenih odluka — FinTrack/HR → Nexora (17.09.2026)

Pravilo: nijedna postojeća poslovna mogućnost FinTracka/HR-a ne izlazi iz obima bez eksplicitne odluke ovdje. Detaljna mapa: `specs/fintrack_hr_coverage_matrix.csv`. Inventar izvora: `docs/implementation/FINTRACK_INVENTORY.md`.

## A. Otvorene odluke (traže odobrenje vlasnika)

| ID | Odluka | Kontekst | Prijedlog | Status |
|---|---|---|---|---|
| ODL-001 | Uvesti statutarni GL (dvojno knjigovodstvo) u Nexoru | `12_FINANCE_BOUNDARY.md` dopušta "until a dedicated accounting localization exists"; FinTrack GL je stvarna potreba | DA — novi FIN-023..FIN-033 kao "BiH accounting localization"; ADR obavezan prije Sprinta 211 | OTVORENO |
| ODL-002 | Model prisutnosti: matrica statusa (FinTrack) vs clock IN/OUT (Nexora HCM-003) | Dva legitimna modela | Podržati OBA: matrica (HCM-015) kao primarna za kancelarijske tenante; clock za pogon; zajednički obračunski izvor | OTVORENO |
| ODL-003 | Lotto | Paralelna mini-evidencija u FinTracku | NE prenositi kao funkciju — modelovati kao zasebno pravno lice/poslovnu jedinicu + aktivacija modula (CORE-002) | PREDLOŽENO |
| ODL-004 | Otvaranje poslovnice (playbook) | Poseban tab u FinTracku | Pokriti postojećim: konfigurabilne checkliste (sprint 172) + PRJ troškovi; bez novog podsistema | PREDLOŽENO |
| ODL-005 | Kompletnost HR inventara | Repo `kenanbuss-sys/xcalltech-hr` nedostupan (nema lokalnog checkouta; PAT bez pristupa) | Vlasnik daje pristup (checkout u `~/` ili proširenje PAT-a); do tada HCM-020 BLOKIRANO — bez implementacije po pretpostavci | BLOKIRANO |
| ODL-006 | Voice + Control Center | Vrijedne ali skupe funkcije | P3 nakon pilota; voice iza STT/TTS adaptera, CC kao BI-016 | PREDLOŽENO |
| ODL-007 | FinTrack "vrsta naloga HISTORIJA" i čišćenja kroz migracije | Produkcijske specifičnosti | NE prenositi; Nexora migracioni alat (ODL-008) pokriva historiju | PREDLOŽENO |
| ODL-008 | Migracija stvarnih FinTrack podataka | Poseban, provjerljiv projekat | Import pipeline: mapiranje→dry-run→izvještaj grešaka→kontrolne zbirove→rollback; NIJE dio ovog zadatka niti Sprinta 211 | OTVORENO (kasnija faza) |

## B. Pravila koja se PRENOSE (obavezno u dizajnu novih sposobnosti)

1. **Tenant ≠ pravno lice ≠ poslovnica ≠ sektor ≠ korisnički opseg.** FinTrack "firma" (Srebrenik/Brčko) = Nexora `LegalEntity` unutar JEDNOG tenanta; poslovnica/sektor = org jedinice; korisnički opseg = permission scope na org jedinicama. GL tabele nose `legalEntityId`, ne novi tenant.
2. **Finansijska izolacija:** knjigovodstvo/PDV/plate iza posebnih permisija (ne rola!); FinTrackov `finance_access` flag → Nexora permisija `finance.ledger` po korisniku.
3. **Plata:** tri nivoa — puni salary krug; contract-scope čitanje (za izradu ugovora, po poslovnicama, bez drugih finansija); management lock kao dodatni restriktivni sloj. Mehanizam: postojeći `FieldPolicyService` + nove permisije; NIKAD UUID/email allowliste u kodu.
4. **Privatnost:** lični dokumenti i radni izvještaji vidljivi autoru/subjektu + upravi; ime u slobodnom tekstu NIKAD nije osnov prava.
5. **Anti-leak:** sastanci/AI/pretraga/notifikacije/dashboardi ne smiju prenijeti finansijske podatke korisnicima bez finansijskih permisija — AI agenda: whitelist izvora + programski filter + red za odobrenje (FinTrack incident 26.08.2026 je dizajn-ulaz).
6. **Knjiženje samo kroz dozvoljene poslovne radnje**; jasno razdvojeno: prijedlog (AI/draft) → odobrenje (pregled, D=P) → izvršenje (posted, nepromjenjiv, storno jedini put).
7. **Trajni identifikatori i numeracija:** brojevi naloga po pravnom licu (sequence), inventarni brojevi nepromjenjivi, storno čuva vezu; datumi kao čisti datumi (bez TZ pomaka); zaokruživanje decimal; valuta uz iznos (BAM/EUR kurs kao config).
8. **QR javni uvid:** isključivo kontrolisana server-side funkcija koja vraća minimalna neosjetljiva polja.
9. **Audit + ispravke:** svaka kritična mutacija audituje staro→novo; ispravke isključivo kompenzacijom/stornom.

## C. Šta se NE prenosi (poznati problemi izvora)

- Monolitni App.jsx (24.806 linija) kao obrazac; UI logika = prezentacija, poslovna pravila server-side.
- Hardkodirane UUID/email allowliste u kodu i duple JS↔SQL liste (INSIGHTS_USERS, WS_SALARY_USERS, SALARY_USERS, FINANCE_USERS…).
- Fail-open admin fallback profila (App.jsx:398-406).
- Tri paralelne evidencije partnera/faktura (nezavršeni F5) — Nexora ima jedan MDM šifrarnik.
- `vehicle_fuel.total_km` korišten kao IZNOS — semantiku razjasniti prije preuzimanja.
- Ručno održavana lista backup tabela (weekly-backup TABLES zaostaje za šemom).
- Per-osoba SQL migracije s imenima u nazivima fajlova.
- CORS `*` na edge funkcijama; publishable ključ u docs-u.
- Kontradikcije docs↔kod (book_payment trigeri, roles-legacy, structure.md brojevi) — važi kod od 08.09./12.09.

## D. Razlike dokumentacija ↔ stvarnost (Nexora)

- `README.md` "475 capabilities" — zastario; stvarnost 512 (katalog+matrica usklađeni). → ažurirati README u docs commitu.
- Izvještaj 08.09. "277/277" — pogrešan denominator (vidi AUDIT_2026-09-17_VERIFIED_STATE.md §2); 18 sposobnosti je i dalje "Partially implemented".
- SPEC_READINESS_REPORT / MANIFEST sha256 za CLAUDE.md — zastarjeli nakon instalacije AGENTS.md paketa (naslijeđeno iz sesije 17.09.; odluka DOC-001 u docs/session/DECISIONS.md).
