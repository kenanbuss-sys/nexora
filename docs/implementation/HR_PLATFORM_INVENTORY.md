# HR platforma — inventar (NEPOTPUN: izvor nedostupan) — 17.09.2026

**Ograničenje:** repozitorij `kenanbuss-sys/xcalltech-hr` (aplikacija hr.xcall.ba, zaseban Supabase projekat) nije dostupan iz ovog okruženja: nema lokalnog checkouta na povezanom računaru, a raspoloživi GitHub token nema pristup tom repozitoriju. **Ovaj pregled NIJE potpun i ne tvrdi potpunost.** Zabranjeno je implementirati HR paritet po pretpostavci (ODL-005).

## Šta se pouzdano zna (iz FinTrack strane mosta — read-only dokazi)

Izvor dokaza: `supabase/functions/sync-worker-to-hr/index.ts`, `employee-portal/index.ts`, migracija `20260722_hr_employee_map.sql`, `docs/archive/CLAUDE-original-20260917.md` (sekcija "HR most") u FinTrack repou.

- Entitet `workers` u HR bazi sa zajedničkim poljima: full_name, email (ključ uparivanja, lowercase), branch, sector, position (mapa FinTrack→HR pozicija), start_date, contract_end, status (Aktivan/Otkazan), auth_user_id.
- **HR-specifična polja koja most NIKAD ne dira: `score`, `disc`, `big5`, …** → HR platforma vodi evaluacije/psihometriju (DISC, Big5) i bodovanje radnika.
- `profiles.role='radnik'`; prijava radnika magic-linkom (lozinka rezervna); otkaz = auth BAN (bez brisanja).
- FinTrack je izvor istine za zajednička polja; sync jednosmjeran, svaki sync auditovan; greške vidljive (`hr_sync_error`).
- Employee portal (na FinTrack strani) dozvoljava radniku iz HR aplikacije isključivo vlastite podatke/dokumente/ugovore; plata zabranjena po dizajnu; rate-limit 60/h.

## Šta NIJE poznato (i ne smije se pretpostaviti)

Puni moduli HR aplikacije: onboarding/offboarding tokovi, evaluacioni procesi i forme, kompetencije i razvoj, testiranja, izvještaji, dozvole/role izvan 'radnik', automatizacije, integracije. 

## Potrebno za završetak

Jedno od: (a) checkout repoa na povezani računar (`~/xcalltech-hr`) + odobrenje foldera, ili (b) GitHub token s read pristupom repou. Nakon pristupa: isti metod inventara kao za FinTrack (rute/migracije/RLS/edge funkcije/testovi → `HR_PLATFORM_INVENTORY.md` v2), pa dopuna mape pokrića i backloga. Placeholder sposobnost: **HCM-020 (BLOKIRANO)** u matrici.
