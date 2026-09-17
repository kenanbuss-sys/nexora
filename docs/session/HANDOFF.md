# HANDOFF — 17.09.2026 (Sprint 213)

Stanje: Sprint 213 završen na grani `docs/software-factory-md-v1`. FIN-030 bankovni izvodi (uvoz s kontrolnim zbirovima, duplikat 409, izričita potvrda, period-lock guard, odbacivanje), FIN-031 zatvaranje (alokacija stavke na fakturu kroz FIN-014 paidAmount, bez GL knjiženja, djelimično, idempotentan allocationKey, smjer/valuta/prekomjerno), AI-016 VisionPort + dev adapter (samo prijedlog, AI_VISION_DEV=1). UI: /bank. Ispravljen i cross-period storno u karticama (par se skriva samo kad su obje polovine unutar perioda) + 3 regresiona testa.

Provjere: sprint211 9/9, sprint212 9/9, sprint213 10/10 (INTEGRATION=1); turbo typecheck ✓; lint 0 errors; web build ✓. Migracija 20260917000213 primijenjena samo lokalno.

Blokada: Mac veza pala tokom sesije — restart `com.nexora.autodev` (korak 2) nije potvrđen s uređaja; sigurna skripta je u commitu ae0741a i u Mac radnom stablu. Uputa: `bash scripts/mac-auto.sh stop` pa ponovo install s grane; provjera u /tmp/nexora-auto.log.

Sljedeće: prenos grane na Mac (bundle), potvrda restarta agenta, pa BACKLOG_DOPUNA faza 1 uz odobrenje.
