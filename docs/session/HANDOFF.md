# HANDOFF — 17.09.2026 (Sprint 219)

Stanje: Sprint 219 završen na `docs/software-factory-md-v1`. Inženjering (BOM/rutiranja) i Proizvodnja (radni nalozi) na standardu 215–218: bosanski + mape statusa, DataTable, planirane/stvarne količine, ConfirmDialog za sve promjene statusa s jasnim razdvajanjem administrativnog statusa od ledger kretanja (release=ISSUE materijala, complete=RECEIPT gotovog + škart, cancel=kompenzacija; start/pause samo status). Backend netaknut. receiptKey iz 218 provjeren: ista operacija=isti ključ, nova=nov; regresija već postoji u sprint008 testu — ništa dodavano; politika prekomjernog prijema nepromijenjena.

Provjere: browser tok normativ→nalog 5→puštanje→završetak 4+1 uz ledger potvrdu (komponenta −20, FG +4); ponovljeni complete 409; nedozvoljen prelaz INVALID_STATE; tenant izolacija; zabranjen pristup; mobilno; dijalozi centrirani; typecheck/build ✓; lint 0 errors.

Otvoreno: vizuelni pregled 215–219, LaunchAgent, FIN-028, HR inventar, stvarni adapteri.
