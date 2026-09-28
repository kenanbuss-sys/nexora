# Decision index

| ID | Status | Odluka | Detalj |
|---|---|---|---|
| DOC-001 | Instalirano (commit na ovoj grani) | Zajednički AGENTS core + CLAUDE import; detaljne reference na zahtjev | Software-Factory-MD-v1 paket; original arhiviran u docs/archive/ |
| ODL-001 | ODOBRENO 17.09.2026 (ADR-0001) | Statutarni GL (dvojno knjigovodstvo, BiH lokalizacija) ulazi u FIN domen (FIN-023..033) | 12_FINANCE_BOUNDARY dopušta; ADR obavezan prije Sprinta 211 |
| ODL-002 | ODOBRENO 28.09.2026 (vlasnik: "oba modela") | Matrica statusa (HCM-015) je izvor obračuna; clock (HCM-003) i odobreno odsustvo samo predlažu status; model po tenantu u konfiguraciji (BOTH/MATRIX/CLOCK) | primijenjeno u Sprintu 234 |
| ODL-003 | PREDLOŽENO | Lotto = pravno lice/poslovna jedinica + module activation, ne nova funkcija | isto |
| ODL-004 | PREDLOŽENO | Playbook otvaranja poslovnice kroz postojeće checkliste + PRJ troškove | isto |
| ODL-005 | BLOKIRANO — treba pristup | HR inventar čeka pristup repou kenanbuss-sys/xcalltech-hr; HCM-020 bez implementacije po pretpostavci | isto |
| ODL-006 | PREDLOŽENO | Voice (AI-015) i Control Center (BI-016) = P3 poslije pilota | isto |
| ODL-007 | PREDLOŽENO | FinTrack čišćenja/HISTORIJA vrste se ne prenose; pokriva migracioni alat | isto |
| ODL-008 | OTVORENO (kasnija faza) | Migracija stvarnih podataka = poseban projekat (mapiranje/dry-run/zbirovi/rollback) | isto |
| FIN-028-D1 | Primijenjeno 28.09.2026 (Sprint 232, u okviru ADR-0001) | PDV = paket "accounting-bih" kao PODACI: efektivno-datirane stope po pravnom licu (append-only verzije) + sistemska konta vat.output/vat.input/vat.settlement; storno KUF/KIF ide u TEKUĆI period (podnesena prijava se nikad ne mijenja retroaktivno); podnošenje zatvara period za nove unose; status uplate bez GL knjiženja (uplata ide kroz izvod) | Vlasnik izabrao FIN-028 kao Sprint 232 (28.09.) |
| FIN-033-D1 | Primijenjeno 28.09.2026 (Sprint 233) | Prijedlozi knjiženja su DETERMINISTIČKI (presedani iz proknjiženih naloga), bez LLM poziva: AI rizik klasa "recommendation→draft", sigurnost pravilom u kodu, prihvatanje kreira samo NACRT; OCR/vision faktura ostaje zaseban AI-016 adapter (kad bude produkcijski provider, on samo puni ulaz prijedloga) | FinTrack ai-knjizenje paritet; 14_AI_GOVERNANCE |

Puni registar s obrazloženjima: `docs/implementation/FINTRACK_HR_GAP_REGISTER.md`. ADR-ovi idu u `docs/architecture/` po postojećoj proceduri; prijedlozi ovdje NISU odobrene odluke.
