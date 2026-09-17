# HANDOFF — 17.09.2026 (Sprint 225 — Make Consulting demo)

Stanje: na `docs/software-factory-md-v1`. Novi `scripts/seed-make-demo.mjs` — ponovljiv aditivan generator demo tenanta `make` („Make Consulting d.o.o. Srebrenik (DEMO)"; brending u konfiguraciji tenanta, svi podaci sintetički/TEST). Puni scenario arhitektonske firme (klijenti, katalog opreme, zalihe, cjenovnici, CRM, ponude→narudžbe→fakture/uplate, nabavka, projekti kroz PRJ objekte, HR s odobrenim odsustvom, zadaci, imovina, B2B portal, označena DEMO proizvodnja kroz puni MES+QC tok) + jasno označen backdating samo vremenskih kolona (~6 mjeseci historije, ref. 2026-09-15). Idempotencija dokazana (2 pokretanja = isti brojevi); demo/demo2 tenanti netaknuti; 13 UI snimaka.

Prijava: tenant `make`, subject `idp|admin` (ili admin@make.example / make-demo); portal klijent `idp|make-klijent`.
Mac: kod ažuriran; za podatke na Mac localhostu pokrenuti JEDNOM u Terminalu:
`cd ~/nexora && git pull --ff-only && DATABASE_URL="postgresql://$USER@localhost:5432/enterprise_os" node scripts/seed-make-demo.mjs`

Backlog dopuna: /projects UI (visok), make GL/banka seed (srednji), backdating faktura (nizak), CRM za PERSON (nizak). Otvoreno ostaje: vizuelni pregled 215–223, FIN-028, HR inventar, stvarni adapteri, EN stranice.
