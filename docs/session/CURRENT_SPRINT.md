# Active sprint — Sprint 213 ZAVRŠEN 17.09.2026: bankovni izvodi + zatvaranje (FIN-030/031, AI-016)

- [x] FIN-030 uvoz izvoda: kontrolni zbirovi (PS + Σ stavki = ZS, deklarisani broj stavki), duplikat po pravnom licu → 409, pregled pa **izričita potvrda** (period lock blokira potvrdu), odbacivanje nepotvrđenog uvoza; audit svih koraka
- [x] FIN-031 zatvaranje: alokacija stavke izvoda na fakturu kroz postojeći FIN-014 tok plaćanja (paidAmount) — **bez GL knjiženja**; djelimične alokacije, kontrola prekomjernog (linija i faktura), smjer priliv↔kupac / odliv↔dobavljač, valuta, idempotentan allocationKey (retry ne duplira uplatu)
- [x] AI-016 VisionPort u domain-ai + DevVisionAdapter (providerKind='dev', upozorenje u svakom rezultatu, uključuje se samo uz AI_VISION_DEV=1); /bank/statements/extract vraća isključivo prijedlog; bez providera jasna greška, ručni tok netaknut
- [x] UI /bank: lista i pregled izvoda, potvrda/odbacivanje, forma uvoza s live kontrolnim zbirom, zatvaranje stavki, AI prijedlog s obaveznim pregledom
- [x] Regresija Sprint 212 (cross-period storno): par se skriva SAMO kad su obje polovine u [from..to]; prikaz uvijek usklađen s bruto bilansom; 3 nova regresiona testa
- [x] Testovi: sprint211 9/9, sprint212 9/9, sprint213 10/10; turbo typecheck ✓; lint 0 errors; web build ✓

Prethodni Sprint 212 — ZAVRŠEN 17.09.2026 (FIN-027 kartice, FIN-029 bruto bilans).

Lokalna provjera: `INTEGRATION=1 pnpm exec vitest run src/sprint213.integration.test.ts` (apps/api); UI: /bank.
Migracija: `prisma/migrations/20260917000213_sprint_213_bank_statements` (primijenjena samo lokalno; produkcija netaknuta).

Sljedeći prijedlog: BACKLOG_DOPUNA faza 1 — čeka potvrdu vlasnika.
