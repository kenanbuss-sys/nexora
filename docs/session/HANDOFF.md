# HANDOFF — 11.10.2026 (Sprintovi 232–251)

Stanje: grana `claude/lucid-dijkstra-qywmaw` (main netaknut). 232–246 završeni ranije (FIN/HCM/EAM/WMS/PIM/MDM/QMS/PLAN/CSM/WF — vidi PROJECT_STATE).

**247–251: tok „proizvodnja i montaža po mjeri“ (prvi stvarni klijent).**
- CPQ po mjeri (`cpq.madeToMeasure`: m²/m1/kom, minimum, doplate, montaža, nivo kupca), avans + konačna faktura umanjena za avans + auto-KIF, RN iz narudžbe s mjerama, mjerenja/montaže s ekipom i vozilom, „Moj posao danas“ i Vodič po ulozi. Migracije 249/250 (aditivne; parcijalni unique i CHECK-ovi nisu u schema.prisma — čuvati).
- Seeder `scripts/seed-made-to-measure.mjs` (profil JSON + XLSX/CSV, `--dry-run`, idempotentan). Runbook: `docs/implementation/MADE_TO_MEASURE_ONBOARDING.md`. Stvarni klijentski profil je SAMO privatan (nije u repou).

Provjere: sprint247 6/6, 248 6/6, 249 5/5, xlsx-lite 2/2; typecheck/lint/build zeleni; Playwright 5 uloga bez grešaka (tenant `sjenila-provjera4` u cloud bazi).

Blokeri: `~/Downloads/NEXORA 2026/` (bundle, privatni folder) i Mac localhost nisu dostupni iz clouda — korisnik pokreće seeder na Macu; nazivi kolona Bosfor cjenovnika nepotvrđeni (`--dry-run`).

Sljedeće: pilot — `--dry-run` + upis na Macu, pregled s klijentom; zatim vremenska zona tenanta za termine, pa HCM-018.
