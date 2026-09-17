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

## Dopuna zatvaranja Sprinta 213 (dokazi i ograničenja)

**Implementirani capability ID-evi**: FIN-030, FIN-031, AI-016 (+ regresiona ispravka FIN-027/FIN-029 prikaza). Iz backlog reda 3 NIJE rađen FIN-032 (kompenzacije) — ostaje otvoren.

**Stvarno izvršeni testovi** (cloud okruženje, lokalni PostgreSQL s primijenjenom migracijom 20260917000213; `INTEGRATION=1` vitest u apps/api):
- sprint211.integration.test.ts — 9/9 PASS
- sprint212.integration.test.ts — 9/9 PASS (uklj. 3 nove cross-period regresije)
- sprint213.integration.test.ts — 10/10 PASS
- `pnpm turbo typecheck` PASS (svi paketi); `pnpm lint` 0 errors (35 postojećih warninga); `next build` web PASS. Push NIJE dokaz funkcionalnosti — dokaz su gornji testovi.

**AI adapter — status**: postoji SAMO DevVisionAdapter (providerKind='dev', aktivan isključivo uz `AI_VISION_DEV=1`, parsira već strukturisan JSON). Stvarni produkcijski vision provider NIJE implementiran ni konfigurisan; bez njega /extract vraća jasnu grešku, ručni tok netaknut.

**Preostala ograničenja**:
- Nema poništenja/release alokacije (ispravka pogrešne alokacije nije podržana; payment je append-only).
- Arhiva PDF-a izvoda (FinTrack paritet napomena uz FIN-030) nije pokrivena — nema pohrane originalnog dokumenta.
- Konkurentne alokacije različitim ključevima na istoj liniji: uplata može biti evidentirana, a alokacija odbijena CONFLICT-om; retry ISTIM ključem se samoizliječi (bez dupliranja) — dokumentovano ponašanje.
- Import ograničen na 1000 stavki po izvodu; alokacija poslije zaključanja perioda nije dodatno blokirana (ne knjiži, potvrda izvoda jeste blokirana).
- Testovi 212/213 djelimično zavise od tekućeg datuma (storno ogledalo datira "danas").
- Restart `com.nexora.autodev` NEPOTVRĐEN s macOS hosta (launchctl nedostupan iz VM-a) — čeka read-only provjeru korisnika.

**Sljedeći sprint (backlog Faza 1)**: dovršiti red 3 → **FIN-032 kompenzacije**, zatim red 4 (FIN-028 KUF/KIF + PDV, paket "accounting-bih"). Čeka odobrenje vlasnika.
