# HANDOFF — 17.09.2026 (Sprint 217)

Stanje: Sprint 217 završen na `docs/software-factory-md-v1`. Finansijski ekrani (kontni plan, nalozi, kartice, bruto bilans, izvodi, zatvaranje, kompenzacije) na UI standardu 215–216: bosanski + mape labela, DataTable, stanja, globalni izbor pravnog lica iz topbara (lokalni selecti uklonjeni). Nova zajednička ConfirmDialog komponenta: kritične radnje (knjiženje, storno, potvrda/odbacivanje izvoda, raspoređivanje, potvrda/poništenje kompenzacije) prikazuju pravno lice, datum/period, iznose i posljedicu prije potvrde; busy sprječava dvostruko slanje. Backend netaknut.

Provjere: Playwright (16 snimaka) — kompletan tok knjiženja s dijalogom + storno, kompletan tok kompenzacije (potvrda pa kontrolisano poništenje, otvorene stavke vraćene), kartica/bilans povezani klikom, promjena pravnog lica bez zaostalih podataka, zabranjen pristup, mobilno; web typecheck/build ✓; lint 0 errors.

Otvoreno: vizuelni pregled 215–217 (vlasnik), LaunchAgent NEPOTVRĐEN, EN stranice ostalih modula, enterprise grid, FIN-028 u backlogu.
