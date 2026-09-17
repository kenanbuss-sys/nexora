# HANDOFF — 17.09.2026 (Sprint 214)

Stanje: Sprint 214 (FIN-032 kompenzacije) završen na `docs/software-factory-md-v1`. Tok: otvorene stavke → nacrt (djelimični iznosi, jednake strane) → izričita potvrda (FIN-014 uplate + jedan COMPENSATION nalog) → štampani dokument → kontrolisano poništenje (releasePayment negativna ogledala + storno + audit). Novi zajednički mehanizam: FinanceService.releasePayment (unique reversesPaymentId). Period-lock pre-check prije efekata; step-idempotentnost; konkurentna potvrda ne duplira. Matrica: FIN-032 DONE (loan settlements ne), AI-016 vraćen na PARTIAL (samo dev). Sprint212 testovi datumski deterministički.

Provjere: 38/38 (211:9, 212:9, 213:10, 214:10) uz INTEGRATION=1; turbo typecheck ✓; lint 0 errors; web build ✓ (/compensations). Migracija 20260917000214 samo lokalno.

Blokada: LaunchAgent com.nexora.autodev i dalje NEPOTVRĐEN (čeka read-only provjeru korisnika na macOS hostu); ne blokira razvoj.

Sljedeće: FIN-028 KUF/KIF + PDV ("accounting-bih" config paket) — pripremljen prijedlog u CURRENT_SPRINT, čeka odobrenje.
