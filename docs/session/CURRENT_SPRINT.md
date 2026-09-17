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

# Sprint 219 — ZAVRŠEN 17.09.2026: proizvodni frontend (BOM + radni nalozi) na standardu 215–218

**Provjera receiptKey (Sprint 218) — bez izmjena koda:** semantika potvrđena čitanjem koda: ključ se generiše pri otvaranju panela prijema, retry/dvoklik unutar iste operacije koristi ISTI ključ, panel se zatvara nakon uspjeha pa novi legitimni prijem dobija novi ključ. Ciljana regresija NIJE dodana jer već postoji: sprint008.integration.test.ts ("Same receiptKey retried: no double stock"; novi ključ uvećava; prekomjerni poslije RECEIVED → 409). Prekomjerni prijem ostaje po postojećoj politici (evidentira se kao odstupanje) — pravilo nije mijenjano.

- [x] /engineering: bosanski, BOM/rutiranja/izmjene kroz DataTable, detalj normativa (komponenta, količina po jedinici, škart %), **Pusti verziju** kroz ConfirmDialog; link na /production
- [x] /production: bosanski + mape statusa (Planiran/Pušten u rad/U toku/Pauziran/Završen/Otkazan), nalozi kroz DataTable + status filter, planirana i stvarne količine (dobro/škart) u listi i detalju; link na /inventory
- [x] Administrativni status vs stvarna kretanja jasno razdvojeni u dijalozima: **Pusti u rad** (ISSUE materijala po normativu; backflush napomena), **Pokreni/Pauziraj** ("mijenja samo administrativni status — ne knjiži kretanja"), **Završi nalog** (fakti: planirano vs uneseno dobro+škart; RECEIPT gotovog proizvoda), **Otkaži** (danger; kompenzacijski RECEIPT) — pozivi tek iz onConfirm, busy blokira dvostruki klik; prelazi samo oni koje backend podržava
- [x] Backend NIJE mijenjan; bez novih poslovnih funkcija
- [x] Provjere kroz browser + API (Playwright 10 snimaka): normativ FG-219 (komponenta 2×/jed) → radni nalog 5 kom → puštanje (dijalog) → pokretanje → završetak 4 dobro + 1 škart (dijalog) → **ledger potvrđen: komponenta 50−10−10=30, gotov proizvod +4**; ponovljeni complete → 409; nedozvoljen prelaz (complete iz PLANNED) → INVALID_STATE; tenant izolacija (demo2 prazno); zabranjen pristup; mobilni prikaz; regresija zajedničkih dijaloga (centriranje ✓); web typecheck/build ✓; lint 0 errors

Otvoreno (master backlog, nepromijenjeno): vizuelni pregled 215–219 (vlasnik); LaunchAgent NEPOTVRĐEN; FIN-028; HR inventar (ODL-005); stvarni adapteri; preostale EN stranice; enterprise grid.

# Sprint 220 — ZAVRŠEN 17.09.2026: CRM + ponude/CPQ na standardu 215–219

- [x] /crm: bosanski + mape labela; leadovi/kupci/prilike kroz DataTable; 360° detalj kupca s linkovima na /quotes i /orders; kupac se otvara isključivo nad postojećim partnerom (partyId); ConfirmDialog za konverziju leada, diskvalifikaciju (danger) i kreditni profil (danger pri uključenju blokade)
- [x] /quotes: bosanski + mape statusa (Nacrt/Čeka odobrenje/Odobrena/Poslana/Prihvaćena/Odbijena/Istekla); lista kroz DataTable + status filter; stavke s kolonama Količina/Cijena/Popust/Ukupno — **svi iznosi sa servera (cjenovnik/pravila popusta), bez formula u UI-ju**; ConfirmDialog za slanje, prihvatanje, odbijanje (danger)
- [x] **Konverzija u narudžbu** na prihvaćenoj ponudi: izbor skladišta + ConfirmDialog (ponuda, kupac, ukupno, stavke, skladište); POST /orders/from-quote; nakon uspjeha broj narudžbe + link; ponovna konverzija server 409
- [x] Konfigurator u postojećem obimu (cjenovnici s pragovima, pravila popusta, promocije, nova verzija, PDF) — samo prevedeno, ništa dodavano
- [x] Backend NIJE mijenjan
- [x] Provjere (Playwright 15 snimaka + API): lead → konverzija (dijalog); ponuda Q-000003 (kupac, cjenovnik) + stavka FG-219×2 → server total **240 EUR** → predaja → slanje → prihvatanje (dijalozi) → konverzija → **SO-000009 total 240 EUR, linija 2×120 — iznosi preneseni tačno**; **ponovna konverzija → 409 "already converted to order SO-000009", bez duplikata**; nedozvoljen status (accept nacrta) → INVALID_STATE "Quote is not sent"; zabranjen pristup; tenant izolacija (demo2 prazno); mobilno /quotes i /crm; web typecheck/build ✓; lint 0 errors
- Evidentirano (nije rađeno): ponuda zahtijeva objavljeni cjenovnik — bez njega forma jasno traži izbor; seed cjenovnika nije dio UI toka

Otvoreno (master backlog, nepromijenjeno): vizuelni pregled 215–220 (vlasnik); LaunchAgent NEPOTVRĐEN; FIN-028; HR inventar (ODL-005); stvarni adapteri; preostale EN stranice (analytics, operations, hr, ostalo); enterprise grid.

# Sprint 221 — ZAVRŠEN 17.09.2026: B2B portal na standardu 215–220

- [x] /portal: bosanski + mape statusa (narudžbe/fakture/reklamacije); katalog kroz DataTable — **isključivo ugovorni cjenovnik kupca (accountId-vezan), cijene samo sa servera**; bez ugovorne cijene → "Na upit" + onemogućeno dugme (bez izmišljenih cijena); bez ugovornog cjenovnika → pošten fallback (sve "Na upit"); korpa (količina, Ukloni, zbir = jedina lokalna aritmetika količina×server-cijena), predaja kroz ConfirmDialog (kupac, stavke, ukupno; POST tek iz onConfirm, busy blokira dvoklik); vlastite narudžbe + tok; back-office vezivanje portal korisnika (portal.manage); **bez pristupa → jasna poruka** (dopunjeno); dev prijava jasno označena naspram OIDC produkcije
- [x] Backend NIJE mijenjan (portal.service već account-scoped); seed za provjere: ugovorni PL-K1 (FG-219 @110 EUR, accountId AC-00001), rola portal-customer (portal.access), kupac1/kupac2 (drugi račun bez cjenovnika)
- [x] Provjere (Playwright 8 snimaka + API): katalog FG-219 110 EUR → korpa ×3 → dijalog (3×110=330) → **SO-000010 total 330 EUR — server obračun tačan**; **dvoklik na potvrdu blokiran (busy), broj narudžbi +1 bez duplikata**; nedozvoljen artikl (KOMP-219 van ugovora) → 409 INVALID_STATE "not in your contract catalog"; **izolacija dva kupca istog tenanta**: kupac2 vidi 0 narudžbi, tuđi timeline → 404, katalog bez ugovornih cijena; cross-tenant (demo2) → 403 + poruka u UI; mobilno; typecheck/build ✓; lint 0 errors
- Evidentirano (nije rađeno): placeOrder nema server-side idempotency ključ — dvostruka predaja spriječena je UI-jem (busy+dijalog); preporuka za budući sprint: Idempotency-Key na POST /portal/orders

Otvoreno (master backlog, nepromijenjeno): vizuelni pregled 215–221 (vlasnik); LaunchAgent NEPOTVRĐEN; FIN-028; HR inventar (ODL-005); stvarni adapteri; preostale EN stranice; enterprise grid.

# Sprint 222 — ZAVRŠEN 17.09.2026: server-side idempotentnost portal placeOrder

- [x] Postojeći projektni obrazac (kao StockMovement ključ): `requestKey`+`requestHash` na samom redu `sales_order` uz `@@unique([tenantId, requestKey])` — **narudžba i idempotency evidencija su jedan atomski INSERT**; migracija 20260917000222 (rollback u komentaru)
- [x] Ključ vezan za tenant (unique constraint), kupca (namespace `portal:{accountId}:{key}`) i operaciju (portal placeOrder); klijentski ključ 8–64 sigurna znaka (zod)
- [x] Semantika: isti ključ + isti sadržaj (kanonski hash: warehouseId, currency, sortirane linije) → ista narudžba (replay, bez novih efekata); isti ključ + drugačiji sadržaj → 409 CONFLICT; konkurentni duplikati gube trku na constraintu PRIJE ikakvog poslovnog efekta i replayuju pobjednika; bez ključa → staro ponašanje (kompatibilno)
- [x] OMS createOrder proširen opcionim requestKey/requestHash (public interface vlasničkog domena — bez širenja na druge module)
- [x] Frontend: jedan ključ po namjeravanoj narudžbi (useRef + crypto.randomUUID pri predaji), čuva se kroz retry/neizvjestan ishod, poništava se pri svakoj promjeni korpe (nova namjera = novi ključ); busy zaštita ostaje
- [x] Politika trajanja: ključ živi koliko i narudžba (kao ledger idempotencyKey — bez isteka); **dokumentovano ograničenje**: linije se upisuju poslije reda narudžbe, pa pad usred upisa linija ostavlja replayabilan DRAFT s manje linija (vidljiv i uredljiv u OMS-u)
- [x] Testovi (sprint222.integration.test.ts, 5/5 ✓): ponavljanje poslije uspjeha (isti id, 1 narudžba, 1 ORDER_CREATED event); izmijenjeni sadržaj → 409; 3 paralelna zahtjeva → tačno 1 narudžba; isti ključ nezavisan po kupcu i tenantu (3 različite narudžbe, bez probe); bez ključa kompatibilno
- [x] Browser regresija (Playwright): korpa 2×110 → dijalog → dvoklik blokiran → **SO-000003 220 EUR, +1 narudžba**; nova namjerna narudžba → novi ključ (2 različita ključa u mrežnim zahtjevima) → SO-000004 110 EUR; typecheck ✓; lint 0 errors
- Napomena: integracijski testovi TRUNCATE-uju dev bazu — demo tenant ponovo seedovan (scripts/seed-demo.mjs + portal kupci)

Otvoreno (master backlog, nepromijenjeno): vizuelni pregled 215–222 (vlasnik); LaunchAgent NEPOTVRĐEN; FIN-028; HR inventar (ODL-005); stvarni adapteri; preostale EN stranice; enterprise grid.

# Sprint 222 — DOPUNA 17.09.2026: atomska predaja (nema replay-a nepotpunog DRAFT-a)

- [x] Ograničenje iz prvog dijela uklonjeno: novi OMS public metod `createOrderWithLines` — **jedna DB transakcija za zaglavlje + idempotency evidenciju + SVE stavke i iznose + ORDER_CREATED timeline event + audite (uklj. pozivaočev `b2b.portal.order` kroz `extraAudits`) + outbox event**; validacije (račun, skladište, SKU, količine/cijene) prije transakcije; greška poslije zaglavlja poništava cijelu operaciju → siguran retry
- [x] Portal placeOrder koristi novi metod; B2B-007 hold se upisuje **atomski sa zaglavljem** (prag izračunat unaprijed), a zahtjev za odobrenje (WF domen) ide POSLIJE commita — pad tu ostavlja narudžbu sigurno zadržanom; eksterni efekti idu preko postojećeg outbox obrasca (order.created objavljen atomski)
- [x] Replay vraća samo kompletan rezultat: keyed narudžba bez stavki (moguća samo kao legacy zapis prije dopune) → INVALID_STATE s jasnom porukom, bez tihe isporuke i **bez automatskog brisanja**; provjera dev baze: **0 ranijih nepotpunih keyed zapisa**
- [x] Frontend: nakon neizvjesnog ishoda čuvaju se **ključ I poslani sadržaj** (pendingOrderRef) do razrješenja — retry šalje ranije predani sadržaj pod istim ključem; dijalog to eksplicitno prikazuje (naslov "Ponovna predaja", stavke iz pending sadržaja), pa izmjena korpe ne može tiho postati nova narudžba; definitivno odbijanje (4xx) razrješava pending, neizvjestan ishod (mreža/5xx) ga čuva; busy ostaje
- [x] Testovi (sprint222, 6/6 ✓): pad nakon zaglavlja/usred stavki (nevalidan id 2. stavke unutar tx) → **potpun rollback: bez narudžbe, ključa, stavki, eventa** + retry kreira jednu kompletnu narudžbu (2 stavke, total 150); izgubljen odgovor poslije commita → replay identičan + **tačne stavke/iznosi (2×50=100), 1 event, 1 outbox, 1 audit**; 3 paralelna → 1 kompletna narudžba (4×50=200); konflikt sadržaja; izolacija; bez ključa; regresija sprint 080/095/122 (9/9 ✓)
- [x] Browser regresija: 2×110 → SO-000003 220 EUR (dvoklik blokiran, +1); nova namjera → novi ključ → SO-000004 110 EUR; DB: obje narudžbe kompletne (stavke + outbox 1/1); typecheck ✓; build ✓; lint 0 errors

# Sprint 222 — ZATVARANJE 17.09.2026: pravilo razrješenja ključa + isporuka

- [x] „4xx razrješava" precizirano: ključ i poslani sadržaj uklanjaju se SAMO na poslovno nedvosmislenom odbijanju (`VALIDATION_FAILED`, `INVALID_STATE`, `NOT_FOUND` — server atomski odbio, narudžba ne postoji); `CONFLICT`, 401/403, 429, nepoznati kodovi, 5xx i mrežne greške čuvaju ključ+sadržaj za siguran nastavak — bez automatske nove namjere (helper `submissionResolvedByError`, lib/idempotency.ts)
- [x] Server: P2002 bez vidljivog pobjednika (konkurentna predaja još u transakciji) → 409 CONFLICT „retry with the same key" umjesto sirove greške — klijent bezbedno nastavlja istim ključem
- [x] Ciljani test za nepokriven slučaj: konflikt različitog sadržaja NE truje ključ — identičan retry poslije 409 replayuje originalnu narudžbu (isti id, sadržaj netaknut, i dalje 1 narudžba); sprint222 6/6 ✓; typecheck ✓; web build ✓; lint 0 errors
- Status isporuke: implementacija i provjere ZAVRŠENE prema dokazima; push na origin čeka dostupnost Maca (cloud proxy odbija repo). Nepushani lanac čuva se u verifikovanom bundleu `nexora-s222-unpushed.bundle` (izvan _to_delete); preduslov za import: repo mora sadržavati commit `0a678b2` (origin tip) — `git bundle verify` to potvrđuje.

# Sprint 223 — ZAVRŠEN 17.09.2026: HCM frontend + pregledni sidebar

## HCM (/hr) na standardu 215–221
- [x] Bosanski; lista zaposlenih kroz DataTable (Broj/Ime/Pozicija/Vještine/Status, filter statusa, pretraga), profil (fakti; **e-mail vidljiv samo uz hcm.manage** — PII van listi), prisustvo iz postojeće evidencije (zaključene smjene, sati, trenutno stanje) + dolazak/odlazak s idempotentnim eventId (dugmad onemogućena prema stanju), zahtjev za odsustvo (vrsta/period) kroz ConfirmDialog, statusi zahtjeva sesije sa servera po ključu, odobravanje (approval.act) kroz ConfirmDialog; samo dozvoljene radnje se prikazuju, server ostaje autoritet; bez pristupa → jasna poruka
- [x] Backend NIJE mijenjan; CSS `.fact` poopćen (bio ograničen na dijalog); seed: role hr-manager/hr-approver, korisnici hr1/hr2/radnik, EMP-00001/2
- [x] Provjere (Playwright 11 snimaka + API): zahtjev→odobrenje→**leaveStatus GRANTED**; ponovljeni zahtjev istog perioda → 409 CONFLICT; ponovljena odluka → 409 INVALID_STATE; **SoD: hr1 ne vidi vlastiti zahtjev u pending listi, direktni approve → 403 FORBIDDEN**; radnik bez hcm.read: UI poruka + API 403 (lista i prisustvo); tenant opseg: demo2 → tuđe prisustvo 404, lista bez tuđih zaposlenih; mobilno
- Evidentirano: HR repo i dalje nedostupan — inventar (ODL-005) ostaje blokiran; ovaj sprint NE označava potpuno pokriće HR platforme (bez obračuna plata/coachinga)
- Napomena: postgres se dva puta srušio u dev okruženju (recovery izgubio demo seed) — demo ponovo seedovan; nije povezano s kodom

## Sidebar — sklopive poslovne oblasti (isti sprint, UI zadatak)
- [x] NAV pregrupisan: Početna + **Favoriti na vrhu**, zatim Prodaja i kupci / Nabavka / Skladište i logistika / Proizvodnja i kvalitet / Finansije / Ljudi i HR / Servis i imovina / Analitika / Administracija; svaki postojeći tab ima mjesto (provjera pokrića ruta: samo /platform ostaje zaseban za platform admina); rute/prava/logika netaknuti
- [x] Sklopive oblasti (aria-expanded, tastatura), aktivna oblast podrazumijevano proširena i obojena, aktivni tab označen; više otvorenih oblasti; **izbor + favoriti pamte se po korisniku/tenant-u** (localStorage, try/catch); brza pretraga menija (Enter → prva stavka, Escape briše); zvjezdica za favorite na svakoj stavci; prikazuju se samo dozvoljeni tabovi, prazne oblasti skrivene (pretraga i favoriti filtrirani istim pravima); sidebar skrola; mobilni off-canvas zadržan
- [x] Provjere kroz browser: /ledger direktno → samo Finansije otvorene; toggle + favorit → poslije reloada obje oblasti otvorene i Favoriti prisutni; pretraga "glav" → Glavna knjiga, Enter → /ledger; **promjena korisnika (hr2): čist state, vidljiva samo Ljudi i HR**; mobilni meni; snimci sklopljenog i proširenog menija; typecheck/build ✓; lint 0 errors

Otvoreno (master backlog): vizuelni pregled 215–223 (vlasnik); LaunchAgent NEPOTVRĐEN; FIN-028; HR inventar (ODL-005); stvarni adapteri; preostale EN stranice; enterprise grid.

# Sprint 224 — 17.09.2026: stabilizacija lokalnog dev okruženja

- [x] **Istraga dva pada dev PostgreSQL-a (cloud)**: logovi pokazuju 12+ događaja "database system was not properly shut down; automatic recovery" bez IJEDNE crash signature (0× PANIC / terminated by signal / OOM) — dakle **eksterno gašenje procesa pri suspenziji sandbox kontejnera između radnih sesija**, ne pad baze niti prekid veze; svaki restart uredno odradio WAL redo; fsync + synchronous_commit = ON → komitovani podaci sačuvani. Prividni "gubitak demo tenanta" = dokumentovani TRUNCATE integracijskih testova (sprint222 beforeAll), ne baza. Izvod loga (bez tajni): pg-dev-log-izvod.txt (isporučen).
- [x] **mac-auto/LaunchAgent konflikt POTVRĐEN u kodu i ispravljen**: start_stack i stop su radili `pkill -f` na SVE API/next procese — uklj. ručno pokrenute. Sada: agent gasi samo vlastite procese (PID fajlovi), tuđi vlasnik porta 3000/3001 se glasno prijavljuje i NE dira; pg_isready guard s jasnom greškom; build fail → postojeći stack ostaje; baza se nikad ne gasi/resetuje; seed ostaje isključivo aditivan (idempotentan, ne prepisuje) i nikad nije automatski oporavak.
- [x] **scripts/dev-up.sh** (cloud/dev): pokreće samo ono što ne radi, odbija duple instance (zauzet port bez odgovora → greška, bez slijepog killa), čuva bazu, bez reseeda; provjeren idempotentno (2. poziv: sve "left untouched").
- [x] **Kontrolisani restart test**: 3 sintetička zapisa, md5 checksum PRIJE == POSLIJE `service postgresql restart` (bez gubitka i dupliranja); proba obrisana; tenanti netaknuti (demo, demo2, test-s222a/b).
- [x] macOS host: iz sesije dostupan samo Linux VM most (ne macOS procesi) → **status LaunchAgenta ostaje NEPOTVRĐEN**; minimalna dijagnostička naredba: `launchctl list | grep com.nexora.autodev` (izlaz "PID Label" = radi; prazno = ne radi).
- Napomena: samo gašenje kontejnera nije popravljivo u kodu (infrastruktura) — ublaženo dev-up skriptom i evidentirano.
- [x] **NAKNADNI NALAZ (uživo)**: reflog na Mac checkoutu pokazuje ponavljano `reset: moving to origin/main` + aktivne git lock fajlove → **stari LaunchAgent (verzija prije ff-only ispravke ae0741a) RADI i resetuje checkout na origin/main**, gazeći dev granu — LaunchAgent status time POTVRĐEN kao aktivan sa zastarjelim kodom; to je i uzrok ranijih "vraćanja" mnt/nexora. Ispravka je u repou, ali je agent ne može povući (prati main). Potrebna ručna intervencija na Macu (naredbe u HANDOFF-u).

# Sprint 224b — 17.09.2026: izolacija testne baze + Mac usklađivanje

- [x] **Izolacija testne i dev baze**: vitest setup guard (apps/api/src/testing/integration-db.setup.ts + setupFiles) — integracijski testovi podrazumijevano idu na **enterprise_os_test**; eksplicitni DATABASE_URL čija baza NE završava na `_test` se glasno odbija (INTEGRATION=1 sam nije dovoljan); svjesni izuzetak samo uz ALLOW_DESTRUCTIVE_TEST_DB=1. Provjere: guard odbio enterprise_os s jasnom porukom; sprint222 6/6 na test bazi; **sentinel zapis i demo/demo2 tenanti u dev bazi netaknuti** (test tenanti završili isključivo u enterprise_os_test).
- [x] **Startup skripte razjašnjene**: `scripts/mac-dev.sh` = macOS (brew servisi, aditivne migracije, build, API health-check s jasnom greškom, web na :3000; ne resetuje bazu, ne seeduje) — TO je naredba za lokalni Mac stack; `scripts/dev-up.sh` = isključivo Linux cloud sandbox (service/redis-server; ne postoji na macOS-u).
- [x] **Mac checkout (kroz VM most)**: sačuvano prije izmjena — HEAD ref, reflog, status i tar 35 untracked fajlova u `NEXORA 2026/bundles/mac-backup-174929/`; reflog pregledan: **nema izgubljenih lokalnih commitova** (log --branches --not --remotes prazan); reflog dokazuje da je stari agent radio `reset: moving to origin/main` (zadnji u 17:34, poslije gašenja nema novih). Stale git lockovi preimenovani (ne obrisani). **FF na 0fca290 kroz VM mount NIJE uspio** — mount ovoj sesiji ne dozvoljava zamjenu/brisanje fajlova (rename-over ORIG_HEAD/index odbijen), pa usklađivanje ostaje za macOS Terminal (naredba u HANDOFF-u). LaunchAgent potvrđeno ugašen (korisnik: bootout "No such process", launchctl print prazan, pgrep prazan).
- Lokalno pokretanje localhost:3000: iz sesije NEPOTVRĐENO (nema macOS host pristupa; VM localhost ≠ Mac localhost).

# Sprint 225 — 17.09.2026: Demo tenant „Make Consulting d.o.o. Srebrenik (DEMO)"

- [x] **scripts/seed-make-demo.mjs** — ponovljiv, ADITIVAN demo generator (tenant `make`): provjera postojanja po stabilnim šiframa u svakom bloku; 2 uzastopna pokretanja = identični brojevi (acc=13, par=15, ord=10, quo=3, inv=3, po=3, wo=2, emp=6, mov=21, task=4) ✓; bez resetovanja baze; postojeći tenanti netaknuti (demo: orders=2 prije/poslije) ✓
- [x] Firma/brending isključivo u konfiguraciji tenanta (white-label: naziv „Make Consulting (DEMO)", teal/amber) — ništa u kodu; svi identifikatori jasno testni (taxId TEST-…, *.example, serijski TEST-…); fiksni referentni datum 2026-09-15
- [x] Scenario arhitektonsko-projektantske firme: 6 klijenata + 2 dobavljača, katalog 10 SKU (oprema enterijera), početne zalihe kroz ledger, cjenovnik MAKE-STD; CRM (računi, leadovi, 1 konverzija), 3 ponude (nacrt/poslana/prihvaćena→narudžba), 10 narudžbi kroz statuse s fakturama (plaćena/djelimična/otvorena — dashboard: 24.500 fakturisano, 10.675 potraživanja iz stvarnih zapisa), nabavka (primljena/djelimična/otvorena NBN), 4 projekta (PRJ custom-objects: troškovi/prihodi/change-order), 6 zaposlenih + odobreno odsustvo (SoD), 4 zadatka, 3 sredstva, B2B portal klijent (ugovorni cjenovnik + idempotentna portal narudžba)
- [x] Proizvodnja = OZNAČEN dodatni demo scenario („Recepcijski pult (DEMO proizvodnja)"): BOM+rutiranje+QC plan; 1 nalog završen kroz PUNI tok (MES potvrde operacija → QC inspekcija PASS uz SoD finalizaciju → complete), 1 aktivan — bez zaobilaženja validacija
- [x] Backdating: jasno označen korak, mijenja SAMO created_at/occurred_at (narudžbe/kretanja/ponude kroz ~6 mjeseci); statusi/iznosi/veze netaknuti; preskače se bez DATABASE_URL
- [x] UI provjere (13 snimaka, cloud preview): dashboard s KPI-jevima, narudžbe kroz statuse, CRM, ponude, nabavka, zalihe, proizvodnja, zaposleni, finansije, zadaci, projekti (kroz /objects), portal kao klijent; tenant izolacija (demo netaknut)
- Popravke tokom razvoja (u generatoru): idempotencija partija/računa po imenu/partyId; requisition approval kroz SoD odobravatelja; MES operacije confirm+complete; QC finalize drugim korisnikom; resumable proizvodni blok
- Jednokratna sanacija mojih ranijih duplikata u make tenantu (spajanje računa po imenu + renumeracija AC brojeva) — dokumentovano, bez diranja drugih tenanta

Prioritizovani backlog (dopuna, postojeće stavke sačuvane):
1. Namjenski /projects UI na standardu 215+ (sad se projekti gledaju kroz /objects) — VISOK za demo
2. make: GL nalozi/banka/kompenzacije demo zapisi (ledger sekcija prazna za make) — SREDNJI
3. Backdating proširiti na datume faktura/uplata — NIZAK
4. CRM računi za PERSON partije (portal/narudžbe za fizička lica) — NIZAK

# Sprint 226 — 17.09.2026: /projects ekran + vizuelne osnove proizvoda

## /projects (PRJ-001..012, generično za sve tenante)
- [x] Model potvrđen: projekat = PRJ domen (governed custom objekti + namjenski API-ji: milestones/costing/profitability/documents; troškovi/prihodi/change orderi na audit ledgeru) — nije izjednačen s generičkim "Objektima"; nav stavka "Projekti" u Prodaja i kupci (project.read)
- [x] Lista (DataTable: šifra/naziv/budžet/status, pretraga + status filter) i detalj: status, finansijski pregled ISKLJUČIVO iz stvarnih zapisa (budžet, change orderi → efektivni, troškovi po vrstama, nabavka s povezanih NBN, preostalo, prihod/rezultat/marža — profitabilnost se NE prikazuje bez evidentiranog prihoda), faze s rokovima + "Označi završenom" kroz ConfirmDialog (project.manage), povezane narudžbe SAMO preko stvarnog polja projectRef (bez povezivanja po nazivu), dokumenti (attachmenti projekta); bez pristupa → jasna poruka
- [x] **Evidentirani nedostaci modela** (bez izmišljanja): klijent i odgovorna osoba ne postoje na projektu; lista povezanih NBN nije izložena (samo zbir u costing); upload dokumenata na projekat nema UI → backlog
- [x] Demo dopuna kroz postojeći generator (aditivno, idempotentno — 2. pokretanje 0 novih): 7 faza kroz custom-objects (završene na PRJ-2025-07 kroz milestones/complete), 3 narudžbe s projectRef (2 potvrđene)

## Vizuelne osnove (zajednički tokeni — osnova za sve tenante, ne demo dekoracija)
- [x] **Self-hosted Inter Variable** (@fontsource-variable/inter, latin+latin-ext → č/ć/š/đ/ž) umjesto blokiranog Google Fonts importa (uklonjen); tipografska hijerarhija zadržana (14px osnovni tekst), **tabularne cifre** za iznose (.mono)
- [x] Skala razmaka --sp-1..6 (4/8/12/16/24/32); sadržaj 32px desktop / 16px mobilno; radni prikazi do 1440px (tabele koriste širinu, page-sub ostaje čitljivih 720px)
- [x] Globalni :focus-visible (2px akcent outline — tastatura), --color-info/badge-info za završene statuse; statusi svugdje tekst + boja; white-label i dalje mijenja samo tokene boja
- [x] Provjere: browser tok projekat→faza→završena + povezana narudžba/dokumenti; prava (vodja bez project.read → poruka); tenant izolacija (demo ne vidi make projekte); mobilno 390px; zoom 200% (720px viewport); dashboard/tabela/forma/dijalog vizuelno pregledani (11 snimaka); typecheck ✓ build ✓ lint 0 errors. Kontrast: postojeći tokeni (tekst #101423 na #fff ≈ 16:1; muted-solid #647082 ≈ 4.6:1; badge parovi ≥4.5:1) — AA
- Napomena: završni premium redizajn SVIH ekrana ostaje otvoren (ovaj task postavlja osnove, ne zatvara dizajn-fazu)

Backlog ažuriran: /projects UI ✓ ZATVOREN; NOVO — polja klijent/odgovorna osoba/rokovi na projektu (model+UI), lista povezanih NBN po projektu, upload dokumenata na projekat (UI); ostale stavke nepromijenjene.

# Sprint 227 — 17.09.2026: projekat — klijent, odgovorna osoba, NBN, dokumenti

- [x] **Klijent** iz postojećeg partner šifrarnika (POST /projects/:code/client {partyId} — validacija partije u tenantu, audit 'prj.client.set', zadnja dodjela važi) i **odgovorna osoba** iz evidencije zaposlenih (…/owner {employeeId}, ACTIVE, audit 'prj.owner.set') — isti auditni marker obrazac kao prihod, BEZ novog modela i BEZ migracije; GET :code/header vraća oboje
- [x] **NBN pregled**: GET /projects/:code/purchase-orders vraća isključivo auditirano povezane NBN-ove (prj.po.link) — bez povezivanja po nazivu; ruta traži purchase.read (nabavni iznosi)
- [x] **Projektni dokumenti** kroz POSTOJEĆI attachment/storage sloj (CORE-009, blob u bazi — stvaran storage, ne mock): 'prj_project' dodan u COLLAB_ENTITY_TYPES; upload/download u UI (5MB limit + server-side odbijanje izvršnih/skriptnih tipova s razumljivom porukom); privatnost per-tenant + doc.accessPolicy sloj postoji
- [x] UI /projects detalj: fakti Klijent/Odgovorna osoba + dodjela kroz ConfirmDialog (selecti iz stvarnih šifrarnika), sekcija Nabavne narudžbenice, Dodaj dokument/Preuzmi; standard 226 zadržan
- [x] Migracije: NISU potrebne (auditni markeri + postojeće tabele); provjere na izolovanoj enterprise_os_test bazi
- [x] Testovi (sprint227, 5/5 ✓): klijent/osoba + audit; cross-tenant party → 404; viewer bez manage → 403; NBN lista tačno auditirani linkovi + 403 bez purchase.read; dokument upload→download roundtrip, text/html odbijen porukom, >5MB odbijen, cross-tenant download → 404; tuđi projekat → 404
- [x] Browser (make): detalj pokazuje klijenta/odgovornu/NBN/dokumente; promjena odgovorne kroz dijalog radi; mobilno; typecheck/build ✓, lint 0 errors
- [x] Demo generator dopunjen (idempotentno): klijenti+odgovorne za sva 4 projekta, 1 NBN link, 2 dokumenta

# Sprint 228 — 17.09.2026: Zadaci i odobrenja na standardu 226

- [x] Backend (owning domen, minimalno): TaskView proširen (description, relatedObjectType/Id, createdAt); GET /tasks?status=OPEN|DONE|ALL (podrazumijevano OPEN — vlastiti/nedodijeljeni); create/complete audit postoji od ranije
- [x] /tasks preuređen: DataTable (zadatak+opis, rok s "kasni" isticanjem, Povezano → link na Projekte, status badge, Završi), status filter, forma novog zadatka (naslov/rok/opis + dodjela korisniku kad IAM pravo dozvoli listu); kartica Odobrenja na čekanju (approval.act) s Odobri/Odbij kroz ConfirmDialog — SoD ostaje na serveru (vlastiti zahtjevi se ne prikazuju niti mogu odobriti)
- [x] Tok iz projekta: /projects detalj → "Novi zadatak za projekat" (ConfirmDialog s naslovom/rokom; relatedObjectType=prj_project, relatedObjectId=record) + link na /tasks
- [x] Browser (make): zadatak kreiran iz projekta vidljiv u /tasks s vezom "Projekat" i rokom; Završi + filter Završeni radi; admin (podnosilac) NE vidi vlastiti zahtjev odsustva; vodja ga odobrio kroz dijalog; mobilno; typecheck/build ✓
- Evidentirano: lista zadataka po projektu (server filter po relatedObjectId) → backlog (nisko)

# Sprint 229 — 17.09.2026: Oprema i održavanje (EAM) na standardu 226

- [x] /assets preuređen: DataTable (broj/naziv/kategorija/serijski/vrijednost/status + filter), detalj sa servisnom historijom iz STVARNIH zapisa (kvarovi, završena održavanja, ukupni trošak, garancija ako postoji); radnje kroz ConfirmDialog: Prijavi kvar (danger; → održavanje + zadatak + zastoj), Završi održavanje (sati×cijena, idempotentni ključ), Zaduži/Razduži alat (ime, auditirano), Rashoduj (danger), Pokreni preventivni ciklus (created/skipped)
- [x] Ispravka: maintenance rute su pod /api/v1/maintenance/assets/... (bug u generatoru i novoj stranici otklonjen prije isporuke)
- [x] **Pošteno označeno**: model NEMA lokaciju ni FK odgovorne osobe (zaduženje je auditirani upis imena); FinTrack QR/zaduženja NISU pokriveni — ostaje u backlogu (HCM/EAM paritet)
- [x] Browser (make): historija plotera (1 kvar, trošak 70 EUR iz stvarnog završetka), tok kvar→održavanje→završetak→u upotrebi na daljinomjeru, bez asset.read → jasna poruka, mobilno; typecheck/build ✓
- [x] Demo generator: servisna historija plotera + zaduženje kombija (idempotentno po completionKey/report stanju)
