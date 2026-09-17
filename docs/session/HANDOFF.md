# HANDOFF — 17.09.2026 (noćni rad: Sprintovi 227–231)

Stanje: na `docs/software-factory-md-v1`, commitovi 54775b3→85f17a6. (227) Projekat: klijent iz partner šifrarnika + odgovorna osoba iz zaposlenih (auditni markeri, bez migracija), lista stvarno povezanih NBN (purchase.read), privatni dokumenti kroz postojeći attachment sloj (5MB, blokada skriptnih tipova, per-tenant). (228) /tasks preuređen: rokovi s "kasni", veza na projekat, filter, nova dodjela; odobrenja s Odobri/Odbij kroz dijalog — SoD na serveru; tok "Novi zadatak za projekat" iz /projects. (229) /assets preuređen: servisna historija iz stvarnih zapisa, kvar→održavanje→završetak (idempotentni ključ), zaduženje/rashodovanje; maintenance rute su pod /api/v1/maintenance/... Model NEMA lokaciju/QR — backlog. (230) Make demo dopuna (idempotentno: tasks=12, approvals_req=2 u 2 pokretanja). (231) Usklađivanje s 226: `.grid-2 > * { min-width:0 }` (mobilni page-hscroll otklonjen), bs-BA rok.

Provjere: sprint227 testovi 5/5; Playwright snimci (shots227–231); lint 0 errors; typecheck/build ✓.
Mac: Terminal 1 `cd ~/nexora && git pull --ff-only && bash scripts/mac-dev.sh` (ili mac-auto); Terminal 2 `cd ~/nexora && DATABASE_URL="postgresql://$USER@localhost:5432/enterprise_os" node scripts/seed-make-demo.mjs`.

Otvoreno: premium redizajn svih ekrana, FIN-028, HR inventar (ODL-005), stvarni adapteri, EN stranice, make GL/banka seed, lokacija/QR opreme, zadaci po projektu (server filter).
