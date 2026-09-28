# HANDOFF — 28.09.2026 (Sprintovi 232–233: FIN-028, FIN-033)

Stanje: grana `claude/lucid-dijkstra-qywmaw` (osnova `docs/software-factory-md-v1` @ 88988f1; main netaknut).
- **232 FIN-028**: KUF/KIF + PDV (paket `accounting-bih` kao podaci, efektivno-datirane stope, server obračun, jedan nalog po unosu, storno u tekući period, PDV prijava + `vat.return.filed`, status uplate, usklađenost s GK), UI `/vat`. Migracije 232 + 233 (parcijalni unique indeksi — čuvati pri regeneraciji). Data-integrity review: 8 nalaza ispravljeno.
- **233 FIN-033**: prijedlozi knjiženja iz proknjiženih presedana (partner/ključne riječi), sigurnost pravilom u kodu (≥3/1–2/0), samo aktivna konta plana, prihvatanje = SAMO nacrt + audit provenance; KUF/KIF asistent (konto + stopa). UI /ledger „Prijedlog knjiženja", /vat „Predloži". Bez migracije, bez LLM-a.

Provjere: sprint232 14/14, sprint233 8/8 (ponovljeno), regresija 211–214/222 zelena; turbo typecheck 77/77, lint 0 errors, web build ✓.

Mac: `git fetch && git checkout claude/lucid-dijkstra-qywmaw && bash scripts/mac-dev.sh`.

Otvoreno: browser (Playwright) provjera /vat i /ledger prijedloga; AI-016 produkcijski vision provider; fiskalni/e-PDV adapter (FIN-021). Sljedeće po backlogu: Faza 2 — HCM-015 šihtarica, traži odluku ODL-002 (matrica statusa uz clock model).
