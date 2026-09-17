# Session handoff
Datum: 17.09.2026 · grana docs/software-factory-md-v1 (na GitHubu, bez merge u main).

Stanje: Sprint 212 završen — FIN-027 kartice (konto+partner, PS/promet/saldo, storno parovi sakriveni po defaultu bez uticaja na saldo) i FIN-029 bruto bilans (u ravnoteži, usklađen s karticama); read-only nad POSTED nalozima. UI /ledger dobio tabove Kartica i Bruto bilans. mac-auto.sh više NIKAD ne radi reset --hard: update samo na main + čisto stablo + fast-forward (LaunchAgent na Macu treba restart da pokupi novu verziju: `bash scripts/mac-auto.sh stop` pa ponovo install s grane).

Commiti na grani: sprint 211, MD paket, audit docs, closure, mac-auto fix, sprint 212 (+matrica/handoff). Push: fast-forward na origin/docs/software-factory-md-v1; main netaknut.

Provjere: sprint211+212 15/15; puna API suita zelena (197 fajlova/781 test prije s212; svježe pokretanje u toku zabilježeno u sesiji); build/lint 0 errors/typecheck zeleni.

Blokada: HR repo nedostupan (ODL-005). Sljedeće: potvrda Sprinta 213 (FIN-030/031 izvodi+zatvaranje, AI-016 vision port).
