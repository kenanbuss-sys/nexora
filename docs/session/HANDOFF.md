# HANDOFF — 17.09.2026 (Sprint 221)

Stanje: Sprint 221 završen na `docs/software-factory-md-v1`. B2B portal (/portal) na standardu 215–220: katalog isključivo iz ugovornog cjenovnika kupca (accountId-vezan, cijene samo sa servera; bez cijene → "Na upit", bez cjenovnika → pošten fallback), korpa, predaja kroz ConfirmDialog (POST tek iz onConfirm, busy blokira dvoklik), vlastite narudžbe + tok, back-office vezivanje portal korisnika, jasna poruka bez pristupa, dev prijava označena naspram OIDC-a. Backend netaknut; seed: PL-K1 (FG-219 @110, AC-00001), rola portal-customer, kupac1/kupac2.

Provjere: korpa 3×110 → SO-000010 330 EUR (server obračun); dvoklik bez duplikata (+1); KOMP-219 van ugovora → 409; izolacija kupaca istog tenanta (kupac2: 0 narudžbi, tuđi timeline 404); cross-tenant 403 + poruka; mobilno; typecheck/build ✓; lint 0 errors.

Evidentirano: placeOrder bez server idempotency ključa (samo UI zaštita) — kandidat za sljedeći sprint.

Otvoreno: vizuelni pregled 215–221, LaunchAgent, FIN-028, HR inventar, stvarni adapteri, preostale EN stranice.
