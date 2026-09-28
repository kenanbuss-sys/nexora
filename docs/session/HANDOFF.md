# HANDOFF — 28.09.2026 (Sprintovi 232–234)

Stanje: grana `claude/lucid-dijkstra-qywmaw` (osnova `docs/software-factory-md-v1` @ 88988f1; main netaknut).
- **232 FIN-028** KUF/KIF + PDV (paket accounting-bih, prijava, storno u tekući period), UI /vat; migracije 232/233 (parcijalni unique indeksi — čuvati).
- **233 FIN-033** prijedlozi knjiženja iz presedana, sigurnost pravilom u kodu, samo nacrt; UI /ledger + /vat asistent.
- **234 HCM-015** šihtarica (ODL-002 ODOBRENO: oba modela — matrica je izvor obračuna, clock/odsustvo samo predlažu); optimistička verzija, audit staro→novo, presjek, zaključavanje mjeseca (FOR SHARE), payroll export nosi workedDays; UI /hr „Šihtarica"; migracija 234.

Provjere: sprint232 14/14, 233 8/8, 234 10/10 (ponavljano); regresija 211–214/222/203/072 zelena; typecheck/lint/build — vidi CURRENT_SPRINT.

Mac: `git fetch && git checkout claude/lucid-dijkstra-qywmaw && bash scripts/mac-dev.sh` (migracije aditivne).

Otvoreno: browser provjera /vat, /ledger prijedloga i /hr Šihtarice; AI-016 produkcijski provider; FIN-021 fiskalni adapter. Sljedeće: Faza 2 red 7 — obračun plata + listići + salary permisije (HCM-013/014; FieldPolicy, plata samo za salary krug).
