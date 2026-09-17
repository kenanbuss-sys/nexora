# HANDOFF — 17.09.2026 (Sprint 224 — stabilizacija dev okruženja)

Stanje: na `docs/software-factory-md-v1`. Istraga PG padova (cloud dev): eksterno gašenje procesa pri suspenziji sandbox kontejnera — 0 crash signatura, uredan WAL redo svaki put, fsync/synchronous_commit ON → bez gubitka komitovanih podataka; "nestali" demo tenant bio je TRUNCATE integracijskih testova. Potvrđen i ispravljen mac-auto/LaunchAgent konflikt: pkill je ubijao i ručno pokrenute instance — sada PID-fajlovi (gasi samo svoje), tuđi vlasnik porta se prijavljuje i ne dira, pg_isready guard, build-fail čuva postojeći stack; baza se nikad ne resetuje, seed isključivo aditivan i nikad automatski oporavak. Novi scripts/dev-up.sh (cloud): startuje samo ono što ne radi, odbija duple instance, jasne greške. Kontrolisani restart test: md5 sintetičkih zapisa identičan prije/poslije, bez dupliranja.

macOS host nedostupan iz sesije (samo Linux VM most) → LaunchAgent i lokalno osvježavanje localhost:3000 NEPOTVRĐENI. Dijagnostika: `launchctl list | grep com.nexora.autodev`. Ručno osvježenje na Macu: `cd <nexora> && git pull --ff-only && bash scripts/mac-dev.sh`.

Mac intervencija (ručno, macOS Terminal — JEDNA naredba, staje na prvoj grešci):
```
cd ~/nexora && rm -f .git/index.lock .git/ORIG_HEAD.lock && git stash push -u -m "backup-$(date +%H%M%S)"; git checkout docs/software-factory-md-v1 && git pull --ff-only origin docs/software-factory-md-v1 && bash scripts/mac-dev.sh
```
(stash čuva sve lokalne izmjene/untracked — ništa se ne odbacuje; dodatni backup već postoji u "NEXORA 2026/bundles/mac-backup-174929"; mac-dev.sh ne resetuje bazu i ne seeduje, API grešku prijavljuje iz /tmp/nexora-api.log, web ostaje u prednjem planu na http://localhost:3000). `dev-up.sh` je SAMO za Linux cloud sandbox — ne koristiti na Macu.
Staro uputstvo: 1) `launchctl unload ~/Library/LaunchAgents/com.nexora.autodev.plist` (gasi stari agent koji resetuje checkout na origin/main — potvrđeno reflogom); 2) u nexora folderu: `git checkout docs/software-factory-md-v1 && git pull --ff-only && bash scripts/mac-dev.sh` (build + start, čuva bazu; bez reseeda). Lokalno osvježavanje localhost:3000 NEPOTVRĐENO iz sesije (macOS host nedostupan; VM ne vidi Mac localhost).

Mac usklađivanje — POTVRĐENO stanje (17.09. 17:55, kroz VM most): grana docs/software-factory-md-v1 na a914c71; stash prazan; nema lokalnih commitova van remota; 37 untracked fajlova uporedjeno s origin tipom 8b8d2e5 → 35 identično, 2 (session docs) starije verzije koje grana nadmašuje → NIŠTA jedinstveno za vraćanje. FF kroz VM mount nemoguć (mount brani zamjenu fajlova). Konačna macOS naredba (stash čuva sve, unutrašnji nexora/ klon isključen, staje na grešci):
```
cd ~/nexora && rm -f .git/index.lock .git/ORIG_HEAD.lock .git/stale*.bak && git stash push -u -m "backup-$(date +%H%M%S)" -- . ':(exclude)nexora' ; git pull --ff-only origin docs/software-factory-md-v1 && git log --oneline -1 && bash scripts/mac-dev.sh
```
Očekivano: log pokaže 8b8d2e5, API health OK (inače greška + /tmp/nexora-api.log), web na http://localhost:3000 (prijava, grupisani sidebar). Host provjera iz sesije NEPOTVRĐENA.

Otvoreno: vizuelni pregled 215–223, FIN-028, HR inventar, stvarni adapteri, EN stranice.
