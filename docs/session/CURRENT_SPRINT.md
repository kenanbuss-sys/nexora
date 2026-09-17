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

# Sprint 214 — ZAVRŠEN 17.09.2026: kompenzacije (FIN-032)

- [x] Tok: otvorene stavke partnera (obje strane) → nacrt s djelimičnim iznosima (strane jednake, prekomjerno → 400) → pregled → **izričita potvrda**: zatvaranje kroz FIN-014 uplate (idempotentno po liniji, bez dupliranja) + **tačno jedan** povezani COMPENSATION nalog (duguje partner-dobavljač 4320*, potražuje partner-kupac 2110*) → dokument za štampu → **kontrolisano poništenje** s razlogom: release uplata + storno naloga + audit
- [x] Minimalni zajednički release mehanizam: `FinanceService.releasePayment` — append-only NEGATIVNO ogledalo uplate, unique (tenant, reversesPaymentId) onemogućava dvostruki release; status fakture se ponovo izvodi
- [x] Sigurnost/integritet: period-lock pre-check PRIJE ikakvog efekta; potvrda/poništenje step-idempotentni (retry dovršava, nikad ne duplira); konkurentna potvrda ne duplira (CAS na paidAmount); tenant granice + permisije (finance.read/pay)
- [x] Matrica: AI-016 vraćen na PARTIAL (samo dev adapter — produkcijska vision integracija NIJE završena); ograničenja Sprinta 213 zadržana
- [x] Deterministički datumi u sprint212 testovima (granice izvedene iz TODAY; bez zavisnosti od kalendarskog mjeseca)
- [x] Testovi (INTEGRATION=1, lokalni PG s migracijom 20260917000214): sprint211 9/9, sprint212 9/9, sprint213 10/10, **sprint214 10/10** (prekomjerno zatvaranje, ponovljena i konkurentna potvrda, poništenje + ponovljeno poništenje, period lock bez polovičnih efekata, dokument, authz/cross-tenant); turbo typecheck ✓; lint 0 errors; web build ✓ (/compensations)
- Ograničenja: loan settlements (dio FIN-032 naslova) nisu pokriveni; poništenje kompenzacije u zaključanom periodu odbija storno kroz ledger guard; UI print koristi window.open (bez DOC šablona)

**Sljedeći sprint — PRIJEDLOG (bez implementacije): FIN-028 KUF/KIF + PDV (BiH lokalizacioni paket)**: knjige ulaznih/izlaznih faktura nad postojećim Invoice + GL (entryType KUF/KIF postoje), PDV stope/period status/prijava kao config paket "accounting-bih" (tenant konfiguracija, ne kod), izvještaji read-only usklađeni s knjigom; zavisi od odobrenja vlasnika.

# Sprint 215 — ZAVRŠEN 17.09.2026: user-friendly frontend (postojeća aplikacija, bez novog stacka)

**UI (provjereno kroz browser, Playwright + screenshots):**
- [x] Okvir: navigacija grupisana po poslovnim oblastima (Početna/Prodaja/Roba i skladište/Proizvodnja/Finansije/Partneri/Analitika/Sistem), bosanski nazivi (tenant vocabulary i dalje nadjačava); topbar s putanjom (oblast/stranica), aktivnim tenantom i globalnim izborom pravnog lica (dijeljeni kontekst + localStorage; ledger/bank/kompenzacije ga poštuju); mobilno: off-canvas meni + hamburger, responzivne tabele/kartice
- [x] Kontrolna tabla: stvarni podaci (executive KPI, aging, zadaci, obavještenja) prevedeni + "Brze akcije"; bez izmišljenih KPI-jeva
- [x] Zajedničke komponente (components/ui.tsx): DataTable (pretraga/paginacija/toolbar), Loading/Empty/Error stanja
- [x] **/flow "Tok robe"**: vođeni tok STVARNIM servisima — artikl (product+SKU+publish+activate) → prijem (rekvizicija→auto-odobrenje→narudžbenica→prijem, idempotentan receiptKey) → skladišno stanje (ledger pozicija) → narudžba (quick+confirm) → rezervacija (po liniji) → otprema (fulfill-lines, idempotentan shipKey); paket stage/ship (samo status) jasno odvojen od fulfilmenta; demo podaci označeni DEMO
- [x] Provjere kroz browser: cijeli tok bez terminala (10 prijem → 4 otprema → stanje 6/0/6); nedovoljna zaliha → jasna greška; korisnik bez dozvola → objašnjenje + skrivena navigacija; tenant izolacija (demo2 ne vidi ništa od demo); desktop 1440px i mobilni 390px screenshoti (15 snimaka)
- **Backend izmjene: NEMA** (nijedna API/šema izmjena; postojeće server-side dozvole korištene). Popravke tokom provjere bile su isključivo u UI pozivima (receiptKey, publish/activate, oblik quick-order odgovora).
- Provjere: web typecheck/build ✓; lint 0 errors; turbo typecheck ✓; integracioni testovi netaknuti (backend nepromijenjen)

**Razlike statusa:** UI okvir/dashboard/tok = UI DONE + provjera kroz browser DONE; produkcijska spremnost NIJE tvrđena (bez deploya). Stvarni adapteri nepromijenjeni.

**Otvorene povezane stavke (master backlog, ne nova lista):**
- Preostale stranice još imaju engleske naslove/tekstove (postepena lokalizacija uz CORE-005 EN/BS sloj)
- Enterprise grid iz design-system spec-a (saved views, kolone, virtualizacija, bulk akcije) — DataTable je osnovni; ostaje u backlogu uz UX spec
- DataTable primijenjen ciljano; retrofit svih lista postepeno
- Server-side paginacija/pretraga tamo gdje liste narastu (API danas vraća ograničene liste)

**Lokalni preview (Mac):** `cd ~/nexora && git checkout docs/software-factory-md-v1 && pnpm install`; API: `DATABASE_URL=… REDIS_URL=… PORT=3001 pnpm --filter @nexora/api dev`; web: `API_URL=http://localhost:3001 pnpm --filter web dev` → http://localhost:3000 (login: Advanced sign in, tenant + subjekt). Cloud preview radi u sandboxu i nije dostupan s Maca.

# Sprint 216 — ZAVRŠEN 17.09.2026: moduli Artikli/Partneri/Skladište/Narudžbe kroz zajednički okvir

- [x] /catalog + /catalog/[id]: bosanski UI, lista kroz DataTable (pretraga/paginacija), klik na red → detalj, statusi kroz mape labela, stanja učitavanja/prazno/greška, link na zalihe
- [x] /parties: bosanski UI (uklj. GDPR/saglasnosti/ugovori/zahtjevi za izmjenu/duplikati), imenik kroz DataTable, mape labela za tipove/statuse
- [x] /inventory: bosanski UI, kretanja i rezervacije kroz DataTable (uz zadržane filtere skladište/SKU), tipovi kretanja "KOD · Naziv", link na /flow
- [x] /orders: bosanski UI (svi tokovi zadržani: quick, from-quote, amend, hold/cancel, povrati, promocije, backorderi), lista kroz DataTable + status filter u toolbaru, **jasno razdvojen status paketa od fulfilmenta** (opisi/title uz dugmad)
- [x] Bez backend izmjena; postojeći API-ji i server-side dozvole; bez novih biblioteka/grid sistema; bez fiktivnih podataka i nefunkcionalnih kontrola
- [x] Provjere kroz browser (Playwright, 11 snimaka): sve četiri stranice desktop + mobilno (390px), otvaranje detalja klikom, **promjena pravnog lica u topbaru perzistira preko stranica**, zabranjen pristup (korisnik bez uloga), **regresija /flow kompletna** (prijem 10 → otprema 3); web typecheck/build ✓; lint 0 errors
- Matrica: pogođene backend stavke nepromijenjene (backend nije diran) — izmjene su isključivo UI sloj postojećih DONE sposobnosti (PIM/MDM/WMS/OMS); bez novih capability redova

**Otvorene stavke (master backlog):**
- **Sprint 215 čeka vizuelni pregled vlasnika na Macu — OTVORENO** (upute u sekciji Sprinta 215)
- Preostale stranice još na engleskom: finance, ledger (djelimično), quotes, crm, procurement, operations, ostali moduli — postepeno kroz isti obrazac
- Enterprise grid (saved views, kolone, virtualizacija, bulk) i server-side paginacija — ostaju u backlogu
- LaunchAgent com.nexora.autodev i dalje NEPOTVRĐEN

# Sprint 217 — ZAVRŠEN 17.09.2026: finansijski ekrani na UI standardu 215–216

- [x] Zajednička komponenta **ConfirmDialog** (components/ui.tsx): fakti (pravno lice, period/datum, iznosi) + jasna posljedica prije potvrde; busy blokira dvostruki klik; danger varijanta
- [x] /ledger: bosanski (mape labela za vrste/statuse naloga), Kontni plan i Nalozi kroz DataTable, **Proknjiži** i **Storniraj** kroz dijalog (posljedice: nepromjenjivost / zrcalni storno; razlog min. 5 znakova validiran klijentski), izvještaji označeni "ne mijenja knjigu", kartica→nalog i bilans→kartica klikom (čisto klijentski)
- [x] /bank: statusi kroz labele, lista izvoda kroz DataTable, **Potvrdi/Odbaci izvod** i **Rasporedi** kroz dijalog (posljedica: povezivanje uplate BEZ GL knjiženja; period lock naveden)
- [x] /compensations: lista kroz DataTable, **Potvrdi** (fakti: pravno lice, partner, datum, iznos, stavke; posljedica: tačno jedan COMPENSATION nalog) i **Poništi** (danger; razlog obavezan) kroz dijalog; Nalog GK prikazan
- [x] Sve tri stranice vezane na **globalni izbor pravnog lica u topbaru** (lokalni selecti uklonjeni — jedan kontekst, bez zaostalih podataka pri promjeni)
- [x] Bez backend izmjena; server-side dozvole i računovodstvena pravila netaknuti; bez novih biblioteka; FIN-028 ostaje u backlogu
- [x] Browser provjere (Playwright, 16 snimaka): kompletan tok knjiženja (konta → nacrt → dijalog → POSTED → storno kroz danger dijalog), kompletan tok kompenzacije (nacrt 80/80 → potvrda kroz dijalog → CONFIRMED → poništenje s razlogom → Poništena, otvorene stavke vraćene), kartica i bruto bilans, promjena pravnog lica bez zaostalih podataka, zabranjen pristup, mobilni prikaz; web typecheck/build ✓; lint 0 errors

Otvoreno (master backlog, nepromijenjeno): vizuelni pregled Sprintova 215–217 od vlasnika; LaunchAgent NEPOTVRĐEN; preostale EN stranice; enterprise grid; FIN-028.

# Sprint 218 — ZAVRŠEN 17.09.2026: frontend nabavke na standardu 215–217

- [x] /procurement na zajedničkom okviru: bosanski (mape labela za statuse zahtjeva/narudžbenica/RFQ), dobavljači kroz DataTable, pretraga + status filter narudžbenica, LoadingState/EmptyState, link na skladišno stanje
- [x] Postojeći tok kroz UI: zahtjev (nacrt + stavke) → **predaja kroz ConfirmDialog** (ispod praga auto-odobrenje) → izdavanje narudžbenice iz odobrenog zahtjeva → **prijem kroz ConfirmDialog** (djelimični i završni) → **otkaz kroz danger dijalog**
- [x] Kolone **Naručeno / Primljeno / Preostalo** po stavci narudžbenice; prijem s količinom po stavci
- [x] Dupli unos spriječen: **stabilan receiptKey po otvorenom panelu prijema** (ranije `Date.now()` po kliku — dvostruki klik je mogao duplirati prijem) + busy u dijalogu; server idempotentnost po ključu netaknuta
- [x] Prekomjerni prijem: backend ga namjerno dozvoljava i evidentira kao odstupanje — dijalog to jasno kaže (danger stil) prije potvrde; izvještaj "Odstupanja pri prijemu" preveden
- [x] UX popravka: u zahtjevu se nude samo AKTIVNI SKU-ovi (neaktivan SKU je vodio u izbježivu grešku "Inactive SKU cannot be newly transacted")
- [x] **Globalna ispravka dijaloga**: `page-in` animacija (transform) pravila je containing block za position:fixed — dijalozi su se centrirali na dokument umjesto na viewport; animacija sada samo opacity (popravlja i ledger/bank/kompenzacije dijaloge na skrolovanim stranicama)
- [x] Backend NIJE mijenjan
- [x] Browser provjere (Playwright, 13 snimaka + ciljani dijalozi): zahtjev→odobrenje→narudžbenica→djelimični prijem 2/6→pokušaj prekomjernog (10>4, upozorenje, odustanak)→završni prijem 4 → **PO RECEIVED 6/6 potvrđeno u bazi**; kretanja vidljiva u zalihama; promjena pravnog lica bez zaostalih podataka; zabranjen pristup; kompletna /flow regresija; mobilni prikaz; web typecheck/build ✓; lint 0 errors

Otvoreno (master backlog, nepromijenjeno): vizuelni pregled 215–218 (vlasnik); LaunchAgent NEPOTVRĐEN; FIN-028; HR inventar (ODL-005); stvarni adapteri (vision, banka); preostale EN stranice; enterprise grid.
