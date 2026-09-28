# HANDOFF — 28.09.2026 (Sprint 232: FIN-028 KUF/KIF + PDV)

Stanje: grana `claude/lucid-dijkstra-qywmaw` (osnova `docs/software-factory-md-v1` @ 88988f1). FIN-028 završen: paket `accounting-bih` kao podaci (efektivno-datirane PDV stope po pravnom licu, sistemska konta `vat.output`/`vat.input`/`vat.settlement`); KUF/KIF unos → server obračun PDV-a + tačno jedan KUF/KIF nalog; storno = negativna stavka u tekućem periodu + storno naloga; PDV prijava = jedan nalog zatvaranja + `vat.return.filed` (outbox), period zatvoren; status uplate; usklađenost knjiga↔GK. UI `/vat` (Finansije). Migracije 20260928000232 + 000233 (parcijalni unique indeksi — ne brisati pri regeneraciji).

Review (data-integrity) nalazi 1–8 ispravljeni: ledger `post` CAS, atomski storno claim, generički storno/brisanje naloga u vlasništvu KUF/KIF/prijave/kompenzacije odbijeno.

Provjere: sprint232 14/14 (3×); regresija 211/212/213/214/222 zelena; typecheck/lint/build — vidi CURRENT_SPRINT.

Mac: `cd ~/nexora && git fetch && git checkout claude/lucid-dijkstra-qywmaw && bash scripts/mac-dev.sh` (migracije aditivne).

Otvoreno: vizuelna provjera /vat (Playwright nije rađen), fiskalni/e-PDV adapter (FIN-021), obrazac/XML prijave, Excel export KUF/KIF, FK-ovi vat tabela; ostalo iz backloga (premium redizajn, HR ODL-005, stvarni adapteri, make GL/banka seed, QR opreme).
