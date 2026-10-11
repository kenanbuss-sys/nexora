# HANDOFF — 11.10.2026 (Sprintovi 232–238)

Stanje: grana `claude/lucid-dijkstra-qywmaw` (osnova `docs/software-factory-md-v1` @ 88988f1; main netaknut).
- 232 FIN-028 KUF/KIF+PDV; 233 FIN-033 prijedlozi knjiženja; 234 HCM-015 šihtarica; 235 HCM-013/014 plate; 236 HCM-016 ugovori + dokumenti; 237 HCM-017 obuka i razvoj (generalizovano) + tipizirani bonusi.
- **ODL-009 POTVRĐENO:** proizvod za proizvodnju, komercijalu i maloprodaju — bez call-centar pojmova; redoslijed u BACKLOG_DOPUNA §Re-prioritizacija.
- **238 EAM-015/016:** revers zaduženja (jedno otvoreno zaduženje po sredstvu — indeks u bazi), razduženje po stavci, audit štampe, QR tokeni (rotacija/opoziv), javni uvid `/q/a`, `/q/z` (samo neosjetljiva polja; lokacija uz config). Ključ modula `assets`. Biblioteka `qrcode` u web-u.
- Migracije 232–239 aditivne; parcijalni indeksi u 233 i 238 nisu u schema.prisma — čuvati.

Provjere: sprint232–238 zeleni; regresija FIN/HCM/collab/EAM zelena; typecheck/lint/build — CURRENT_SPRINT.

Otvoreno: browser provjera novih ekrana i štampe; rate limiting javnih ruta (ADR); porezi/doprinosi; AI-016. Sljedeće: re-verifikacija djelimičnih sposobnosti (barkod/GTIN, JM, serijski brojevi, dispozicija, hijerarhija sredstava, promise-date).
