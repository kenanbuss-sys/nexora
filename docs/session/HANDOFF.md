# HANDOFF — 17.09.2026 (Sprint 226 — /projects + vizuelne osnove)

Stanje: na `docs/software-factory-md-v1`. (1) Namjenski /projects ekran nad postojećim PRJ domenom: lista+detalj (faze s rokovima i završavanjem kroz dijalog, finansije isključivo iz stvarnih zapisa — budžet/change orderi/troškovi/nabavka/prihod/marža; profitabilnost skrivena bez evidentiranog prihoda), povezane narudžbe SAMO preko polja projectRef, dokumenti; nav "Projekti" (project.read); generično za sve tenante. Evidentirani nedostaci modela (klijent/odgovorna osoba, lista NBN, upload dokumenata) → backlog, bez izmišljanja. Demo dopunjen kroz generator (7 faza, 3 projectRef narudžbe; idempotentno). (2) Vizuelne osnove u zajedničkim tokenima: self-hosted Inter Variable (č/ć/š/đ/ž; Google import uklonjen), spacing skala 4–32, sadržaj 32/16px, radna širina 1440px, tabularne cifre, globalni :focus-visible, badge-info; white-label netaknut. Premium redizajn svih ekrana ostaje otvoren.

Provjere: tok projekat→faza→završena; prava; tenant izolacija; mobilno + zoom 200%; 11 snimaka; typecheck/build ✓; lint 0 errors.
Mac osvježenje: Terminal 1 `cd ~/nexora && git pull --ff-only && bash scripts/mac-dev.sh`; Terminal 2 (poslije "API is up") `cd ~/nexora && DATABASE_URL="postgresql://$USER@localhost:5432/enterprise_os" node scripts/seed-make-demo.mjs`.

Otvoreno: vizuelni pregled 215–226, premium redizajn, FIN-028, HR inventar, stvarni adapteri, EN stranice; make GL/banka seed; projektna polja (klijent/odgovorna osoba), NBN lista po projektu, upload dokumenata.
