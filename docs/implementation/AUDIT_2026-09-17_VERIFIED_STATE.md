# Provjereno stanje Nexore — audit 17.09.2026

Commit provjere: `a914c71` (main, = origin/main na GitHubu). Radni direktorij čist.
Kanonski checkout: `~/nexora` (grana `docs/software-factory-md-v1`, bazirana na main @ a914c71).
Ugniježdeni klon `~/nexora/nexora` (HEAD 88aef4f, predak main-a, čist) — netaknut.

## 1. Šta je provjereno SADA (izvršeno u ovoj sesiji, izolovana test baza, sintetički podaci)

| Provjera | Rezultat | Dokaz |
|---|---|---|
| Puna API integraciona suita, svježe pokretanje | **196 fajlova / 772 testa — svi prolaze** | log `audit-fullapi` 17.09.2026, commit a914c71 |
| E2E tok artikl→prijem→stanje→narudžba→rezervacija→otprema | **7/7 prolazi** (uklj. greške: nedovoljna zaliha 409, idempotentan ponovljeni prijem i fulfil, korisnik bez dozvole 403, cross-tenant 403/404) | privremeni test `audit-e2e.integration.test.ts` (izvršen pa uklonjen, sadržaj arhiviran u audit zapisu) |
| Konzistentnost katalog ↔ matrica | 512 = 512 ID-eva, 0 odstupanja | `docs/02_MASTER_CAPABILITY_CATALOG.md` vs `specs/implementation_matrix.csv` |
| Build/typecheck/lint | zeleni (77 turbo taskova) | ista sesija |

Dokaz iz RANIJEG izvještaja (nije ponovo izvršen sada, samo očitan): CI GitHub Actions zelen na `06feb0b` (08.09.2026, run "CI" completed/success) i regen workflow zelen; a914c71 je CI-jev vlastiti regen commit (ne pokreće CI).

## 2. Objašnjenje razlike 475 / 512 / 277

* **475** — broj iz `README.md` ("475-capability master catalog"): zastario broj iz prve verzije spec paketa. Katalog je kasnije proširen; README nikad nije ažuriran. Nije obim koji je nestao — obim je RASTAO.
* **512** — stvarni obim: `docs/02_MASTER_CAPABILITY_CATALOG.md` (zaglavlje "34 domains · 512 capabilities") i `specs/implementation_matrix.csv` imaju identičnih 512 ID-eva. Ništa nije objedinjeno, preimenovano niti uklonjeno.
* **277** — pogrešan denominator iz izvještaja 08.09.: to je broj redova matrice sa doslovnim statusom `DONE`. Ostali implementirani redovi nose stariju konvenciju statusa `Implemented (Sprint NNN)` (217 redova) i `Partially implemented (Sprint NNN)` (18 redova). Tvrdnja "277/277, 0 preostalih" je značila samo "0 redova sa statusom PLANNED" — tačno, ali je prešutila 18 djelimičnih.

**Ispravna slika: 512 sposobnosti; 494 označene implementiranima (277 `DONE` + 217 `Implemented`), 18 `Partially implemented`.**

Djelimično implementirane (za re-verifikaciju — status je iz ranih sprintova i možda je prevaziđen kasnijim radom):
CORE-012, CORE-013, CORE-015, MDM-002, MDM-005, PIM-005, PIM-007, WMS-018, PLAN-015, QMS-005, EAM-002, DOC-001, DOC-003, WF-002, WF-003, WF-005, WF-010, CSM-011.

## 3. Nivoi završenosti — šta "implementirano" znači i šta NE znači

Klasifikacija (postojanje endpointa/tabele/testa ≠ potpuna funkcionalnost):

| Nivo | Stanje |
|---|---|
| Specificirano | 512/512 (katalog + domenske spec.) |
| Backend implementiran + integracioni test | 494/512 označeno; potvrda: 772 testa zelena na a914c71 |
| Djelimično | 18 (lista gore) |
| Funkcionalan UI | **tanak**: 28 sekcija u `apps/web`, ~35 ekrana — osnovni pregledi, bez operaterskih scan-first tokova, bez dubinskih formi za većinu domena |
| Provjeren E2E tok | 1 tok provjeren sada (prijem→otprema); ostali tokovi pokriveni per-sprint testovima, ne ručnim E2E prolazima |
| Spremno za pilot/produkciju | **NE** — vidi razvojne adaptere i uslove ispod |

**Razvojni / mock / noop adapteri (obavezno zamijeniti ili svjesno prihvatiti za pilot):**
`DevIdentityAdapter` (identitet; `OidcIdentityAdapter` postoji ali nije korišten u testnom režimu), `DevSignatureAdapter` (potpisi), `DevBankFeedAdapter` (bankovni feed), `DevOcrAdapter` (OCR), `devAiAdapter` (AI), `noopAdapter` (svi konektori: računovodstvo, kuriri, fiskalizacija, plate, PDM, ESG, mail). Fiskalizacija BiH postoji samo kao config-stub u EXT paketu `retail-bih`.

## 4. Uslovi za staging i produkciju (IP servera NIJE dokaz spremnosti)

**Staging (minimalno):** Hetzner VPS + `deploy/` (docker-compose, Caddy, install.sh) + DNS; DEV adapteri smiju ostati; sintetički podaci; bez javnih korisnika.

**Pilot/produkcija (uslovi, redom):**
1. Stvarna autentikacija: OIDC provider konfigurisan (`OidcIdentityAdapter`), gašenje dev-secret tokena; 2FA politika.
2. Tajne: env-only (bez dev defaulta `dev-secret-change-me`), rotacija, backup tajni.
3. Adapteri potrebni pilotu: minimalno AI provider (ako se koriste AI funkcije — ponašanje pri nedostupnosti definisano: sve AI funkcije su prijedlozi/read-only i moraju degradirati na "nedostupno", nikad blokirati osnovni tok), e-mail/push, fiskalni/bankovni po obimu pilota.
4. Migracije na ciljnoj bazi + backup/restore proba (`deploy/backup.sh`, `deploy/dr-drill.sh` izvršeni na stagingu).
5. Monitoring: /status endpoint + eksterni uptime + log agregacija.
6. Pristup: admin onboarding prvog tenanta, RBAC provjera, audit uvid.

Nexora je održiva bez alata koji su generisali kod: repo je samostalan (pnpm/turbo/CI), Prisma klijent se regeneriše CI-jem ili lokalno pinovanim CLI-jem; nijedna funkcija ne zavisi od Claude sesija. AI funkcije zavise od AI porta — bez providera vraćaju grešku porta, ne ruše ostatak sistema.
