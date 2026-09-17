# HANDOFF — 17.09.2026 (Sprint 222)

Stanje: Sprint 222 završen na `docs/software-factory-md-v1`. Portal placeOrder je server-side idempotentan po postojećem obrascu: `requestKey`+`requestHash` na samom redu `sales_order` uz unique (tenantId, requestKey) — narudžba i evidencija su jedan atomski INSERT (migracija 20260917000222). Ključ namespaced `portal:{accountId}:{key}`; isti ključ+sadržaj → replay iste narudžbe bez novih efekata; drugačiji sadržaj → 409 CONFLICT; konkurentni duplikati gube trku prije poslovnih efekata; bez ključa kompatibilno. OMS createOrder dobio opcioni requestKey/requestHash (vlasnički public interface). Frontend čuva ključ kroz retry, poništava ga pri promjeni korpe; busy ostaje. Ključ traje koliko narudžba (bez isteka). Ograničenje dokumentovano: pad usred upisa linija ostavlja replayabilan DRAFT s manje linija.

Provjere: 5/5 integracijskih (replay, konflikt, 3 paralelna → 1 narudžba, izolacija kupac/tenant, bez ključa); browser: 2×110 → SO-000003 220 EUR uz dvoklik, nova namjera → novi ključ → SO-000004; typecheck ✓; lint 0 errors. Testovi TRUNCATE-uju dev bazu — demo reseedovan.

Otvoreno: vizuelni pregled 215–222, LaunchAgent, FIN-028, HR inventar, stvarni adapteri, EN stranice.
