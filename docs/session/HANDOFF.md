# HANDOFF — 17.09.2026 (Sprint 223)

Stanje: Sprint 223 završen na `docs/software-factory-md-v1`. (1) HCM /hr na standardu 215–221: lista/profil zaposlenih (DataTable, filteri; e-mail samo uz hcm.manage), prisustvo iz postojeće evidencije + idempotentan dolazak/odlazak, zahtjev za odsustvo kroz ConfirmDialog, odobravanje (approval.act) uz SoD na serveru; samo dozvoljene radnje; backend netaknut. (2) Sidebar: sklopive poslovne oblasti (Prodaja i kupci, Nabavka, Skladište i logistika, Proizvodnja i kvalitet, Finansije, Ljudi i HR, Servis i imovina, Analitika, Administracija), Početna+Favoriti na vrhu, aktivna oblast proširena/označena, brza pretraga menija, favoriti; izbor se pamti po korisniku/tenant-u; samo dozvoljeni tabovi, prazne oblasti skrivene; rute/prava netaknuti.

Provjere: tok zahtjev→odobrenje→GRANTED; dupli zahtjev 409; dupla odluka 409; SoD 403 + sakriven vlastiti zahtjev; radnik 403/poruka; demo2 tuđe prisustvo 404; sidebar: direktno /ledger, persistencija poslije reloada, promjena korisnika čisti state (hr2 vidi samo Ljudi i HR), pretraga+Enter, mobilno; typecheck/build ✓; lint 0 errors. 16 snimaka.

Napomene: HR repo nedostupan — ODL-005 inventar i dalje blokiran; ovo nije potpuno HR pokriće. Postgres se 2× srušio (dev) — demo reseedovan.

Otvoreno: vizuelni pregled 215–223, LaunchAgent, FIN-028, HR inventar, stvarni adapteri, EN stranice.
