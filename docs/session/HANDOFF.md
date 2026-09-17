# HANDOFF — 17.09.2026 (Sprint 222 — dovršen, atomska predaja)

Stanje: na `docs/software-factory-md-v1`. Portal placeOrder idempotentan i ATOMSKI: novi OMS `createOrderWithLines` piše zaglavlje + requestKey/hash + sve stavke/iznose + ORDER_CREATED event + audite (uklj. b2b.portal.order kroz extraAudits) + outbox u jednoj transakciji; greška poslije zaglavlja ruši sve → siguran retry. B2B-007 hold atomski sa zaglavljem; zahtjev odobrenja (WF) poslije commita — pad ostavlja narudžbu zadržanom. Replay vraća samo kompletan rezultat (legacy keyed bez stavki → INVALID_STATE, bez brisanja; dev baza: 0 takvih). Frontend čuva ključ I poslani sadržaj do razrješenja (pendingOrderRef); dijalog eksplicitno prikazuje ponovnu predaju ranijeg sadržaja; ključ+sadržaj se odbacuju samo na nedvosmislenom odbijanju (VALIDATION_FAILED/INVALID_STATE/NOT_FOUND), a CONFLICT/401/403/429/5xx/mreža ih čuvaju.

Provjere: sprint222 6/6 (pad usred stavki → potpun rollback + retry jedna kompletna narudžba; izgubljen odgovor → replay s tačnim stavkama/iznosima, 1 event/outbox/audit; 3 paralelna → 1 kompletna; konflikt; izolacija); regresija 080/095/122 9/9; browser: SO-000003 220 EUR uz dvoklik, novi ključ → SO-000004; typecheck/build ✓; lint 0 errors.

Isporuka: commit 1e59da4 + zatvaranje čekaju push (Mac); bundle nexora-s222-unpushed.bundle van _to_delete, preduslov origin tip 0a678b2.
Otvoreno: vizuelni pregled 215–222, LaunchAgent, FIN-028, HR inventar, stvarni adapteri, EN stranice.
