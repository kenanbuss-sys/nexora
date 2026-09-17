# HANDOFF — 17.09.2026 (Sprint 218)

Stanje: Sprint 218 završen na `docs/software-factory-md-v1`. Nabavka na standardu 215–217: bosanski + mape labela, DataTable/filteri, kolone Naručeno/Primljeno/Preostalo, ConfirmDialog za predaju zahtjeva, prijem (djelimični/završni, danger upozorenje za prekomjerni — backend ga svjesno evidentira kao odstupanje) i otkaz narudžbenice; stabilan receiptKey po panelu (ispravka mogućeg dvostrukog prijema dvoklikom); u zahtjevu samo aktivni SKU-ovi. Globalna ispravka: page-in animacija bez transforma (dijalozi se sada centriraju na viewport na svim stranicama). Backend netaknut.

Provjere: Playwright — cijeli tok do PO RECEIVED 6/6 (potvrđeno u bazi), prekomjerni prijem upozoren i odustan, ledger zaliha, promjena pravnog lica, zabranjen pristup, /flow regresija, mobilno; web typecheck/build ✓; lint 0 errors.

Otvoreno: vizuelni pregled 215–218, LaunchAgent NEPOTVRĐEN, FIN-028, HR inventar, stvarni adapteri, EN stranice, enterprise grid.
