# HANDOFF — 11.10.2026 (Sprintovi 232–241)

Stanje: grana `claude/lucid-dijkstra-qywmaw` (osnova `docs/software-factory-md-v1` @ 88988f1; main netaknut).
- 232 FIN-028 KUF/KIF+PDV; 233 FIN-033 prijedlozi knjiženja; 234 HCM-015 šihtarica; 235 HCM-013/014 plate; 236 HCM-016 ugovori; 237 HCM-017 obuka (generalizovano); 238 EAM-015/016 revers + QR.
- **ODL-009 POTVRĐENO:** proizvodnja, komercijala, maloprodaja — bez call-centar pojmova; redoslijed u BACKLOG_DOPUNA §Re-prioritizacija.
- **239 WMS-018:** serijski brojevi u kretanjima (serial_position/serial_movement), tokovi NBN/WMS/otprema, PIM consumer `pim.serial-registry`, UI unos skenerom.
- **240 PIM-005/007:** GTIN kontrolna cifra, jedan prostor skeniranja (unit+pack, advisory lock), `GET /barcodes/resolve/:value`, JM na kretanju → baza (tačno ili 400), `entered_uom/quantity`.
- **241 MDM-005/002:** kandidati duplikata (naziv/PIB/e-mail), „nije duplikat“, pregled + sigurno spajanje (`party.merged`), politika objave `pim.publishPolicy`, istorija promjena.
- Migracije 232–242 aditivne; parcijalni indeksi (233, 238) i CHECK (242) nisu u schema.prisma — čuvati.

Provjere: sprint239 7/7, sprint240 8/8, sprint241 8/8; puna integracijska regresija zelena; typecheck zelen.

Otvoreno: browser provjera novih ekrana; rate limiting javnih ruta (ADR); JM na stavkama NBN/narudžbi; porezi/doprinosi; AI-016. Sljedeće: QMS-005 (dispozicija), EAM-002, PLAN-015, CSM-011.
