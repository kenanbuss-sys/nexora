# Uvođenje klijenta: proizvodnja i montaža po mjeri

Generički scenarij (roletne, tende, komarnici, zavjese i sl.): **upit → mjerenje → ponuda s dimenzijama → narudžba + avans → radni nalog → montaža (termin, ekipa, vozilo) → konačna faktura (umanjena za avans) → uplata → KIF/PDV**, uz veleprodaju bez montaže. Sve je konfiguracija jednog koda — nema grananja po klijentu (AGENTS.md).

## Šta je u kodu (zajedničko)

| Korak | Gdje | Sprint |
|---|---|---|
| Cijena po m²/m1/kom, minimalni obračun po komadu, % i fiksne doplate, montaža po komadu/m², popust po nivou kupca | `cpq.madeToMeasure`, `POST /quotes/:id/measured-lines`, `POST /crm/accounts/:id/price-tier` | 247 |
| Avansni račun, konačna faktura umanjena za avans, automatski KIF | `POST /finance/invoices/advance`, `fin.autoKif` | 248 |
| Radni nalog po stavci narudžbe s mjerama | `POST /work-orders/from-order` | 248 |
| Mjerenje i montaža: termin, ekipa, vozilo, bez preklapanja | `api/v1/service/visits/*`, ekran **Montaže** | 248 |
| „Moj posao danas“ po ulozi, vodič po ulozi | `GET /home/today`, ekrani **Kontrolna tabla**, **Vodič** | 249–251 |
| Pravila po mjeri za prodavača bez prava na konfiguraciju | `GET /quotes/made-to-measure/rules` (`quote.read`) | 251 |

## Podaci klijenta (privatno, nikad u repo)

Stvarni podaci firme i cjenovnik žive u **privatnom folderu** izvan repozitorija. Repo sadrži samo izmišljeni primjer `scripts/profiles/made-to-measure.example.json` (+ CSV).

1. Kopiraj primjer u privatni folder, promijeni `tenant` (slug, naziv, javni podaci firme), `branches`, `staff`, `vehicles`, `surcharges`, `tierDiscounts`, `modules.disable`.
2. `priceList.file` = putanja do cjenovnika (`.xlsx` ili `.csv`), `columns` = nazivi kolona u fajlu, `headerRow`/`sheet` ako tabela ne počinje u 1. redu.
3. Provjera mapiranja bez upisa:
   `node scripts/seed-made-to-measure.mjs --profile <privatni>/profil.json --dry-run`
   (ispisuje prvih 5 stavki i stvarna zaglavlja fajla).
4. Upis (API mora raditi; `DATABASE_URL` omogućava raspoređivanje datuma istorije kroz 6 mjeseci):
   `DATABASE_URL=… node scripts/seed-made-to-measure.mjs --profile <privatni>/profil.json`

Seeder je **aditivan i idempotentan**: ponovno pokretanje ne duplira (istorija se generiše samo kad tenant nema ponuda; uloge se usklađuju s profilom; konfiguracija se objavljuje samo kad se promijeni). Sve transakcije, kupci, radnici i iznosi su **izmišljeni i označeni DEMO**.

## Uloge (kontrola razdvajanja dužnosti)

Prodavač (ponude, narudžbe, mjerenja, uvid u proizvodnju), Proizvodnja (radni nalozi, operacije), Montaža (raspored, izvršenje), Knjigovodstvo (fakture, knjiženja, PDV — **bez** potvrde uplate), Uprava (analitika + potvrda uplate). Ista osoba ne smije i fakturisati i potvrditi uplatu (SoD pravilo IAM-011); seeder glasno prijavi svaku odbijenu dodjelu uloge.

## Poznata ograničenja

- Vremena termina se u seederu postavljaju za srednjoevropsko vrijeme; vremenska zona tenanta još nije konfiguracija.
- Mapiranje kolona stvarnog cjenovnika mora se potvrditi `--dry-run`-om.
- Korisnici bez `organization.read` dobijaju (bezopasan, obrađen) 403 na izboru pravnog lica u zaglavlju.
