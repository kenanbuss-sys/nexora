# HANDOFF — 17.09.2026 (Sprint 224 — stabilizacija dev okruženja)

Stanje: na `docs/software-factory-md-v1`. Istraga PG padova (cloud dev): eksterno gašenje procesa pri suspenziji sandbox kontejnera — 0 crash signatura, uredan WAL redo svaki put, fsync/synchronous_commit ON → bez gubitka komitovanih podataka; "nestali" demo tenant bio je TRUNCATE integracijskih testova. Potvrđen i ispravljen mac-auto/LaunchAgent konflikt: pkill je ubijao i ručno pokrenute instance — sada PID-fajlovi (gasi samo svoje), tuđi vlasnik porta se prijavljuje i ne dira, pg_isready guard, build-fail čuva postojeći stack; baza se nikad ne resetuje, seed isključivo aditivan i nikad automatski oporavak. Novi scripts/dev-up.sh (cloud): startuje samo ono što ne radi, odbija duple instance, jasne greške. Kontrolisani restart test: md5 sintetičkih zapisa identičan prije/poslije, bez dupliranja.

macOS host nedostupan iz sesije (samo Linux VM most) → LaunchAgent i lokalno osvježavanje localhost:3000 NEPOTVRĐENI. Dijagnostika: `launchctl list | grep com.nexora.autodev`. Ručno osvježenje na Macu: `cd <nexora> && git pull --ff-only && bash scripts/mac-dev.sh`.

Otvoreno: vizuelni pregled 215–223, LaunchAgent, FIN-028, HR inventar, stvarni adapteri, EN stranice.
