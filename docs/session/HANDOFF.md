# HANDOFF — 11.10.2026 (Sprintovi 232–245)

Stanje: grana `claude/lucid-dijkstra-qywmaw` (osnova `docs/software-factory-md-v1` @ 88988f1; main netaknut).
- 232 FIN-028 KUF/KIF+PDV; 233 FIN-033 prijedlozi knjiženja; 234 HCM-015 šihtarica; 235 HCM-013/014 plate; 236 HCM-016 ugovori; 237 HCM-017 obuka (generalizovano); 238 EAM-015/016 revers + QR.
- **ODL-009 POTVRĐENO:** proizvodnja, komercijala, maloprodaja — bez call-centar pojmova; redoslijed u BACKLOG_DOPUNA §Re-prioritizacija.
- **239 WMS-018:** serijski brojevi u kretanjima (serial_position/serial_movement), tokovi NBN/WMS/otprema, PIM consumer `pim.serial-registry`, UI unos skenerom.
- **240 PIM-005/007:** GTIN kontrolna cifra, jedan prostor skeniranja (unit+pack, advisory lock), `GET /barcodes/resolve/:value`, JM na kretanju → baza (tačno ili 400), `entered_uom/quantity`.
- **241 MDM-005/002:** kandidati duplikata (naziv/PIB/e-mail), „nije duplikat“, pregled + sigurno spajanje (`party.merged`), politika objave `pim.publishPolicy`, istorija promjena.
- **242 QMS-005:** odluka komisije (5 vrsta dispozicije), preuzmi-pa-knjiži s ponovnim pokušajem. **243 EAM-002:** hijerarhija sredstava + istorija strukture. **244 PLAN-015:** motor roka isporuke, potvrda roka. **245 CSM-011:** slučaj ↔ narudžba, RMA iz slučaja.
- Migracije 232–247 aditivne; parcijalni indeksi (233, 238) i CHECK-ovi (242, 243, 245) nisu u schema.prisma — čuvati.

Provjere: sprint239–245 zeleni (7/8/8/7/5/6/5); puna regresija zelena do 240, ciljane poslije; typecheck zelen.

Otvoreno: browser provjera novih ekrana; rate limiting javnih ruta (ADR); JM na stavkama NBN/narudžbi; porezi/doprinosi; AI-016. Red 2 završen. Sljedeće: WF-013, HCM-018, pa EAM-017/OPS-019/AI-016/porezi.
