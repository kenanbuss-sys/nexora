# Active sprint — Sprint 211: Glavna knjiga (jezgro)

Preduslov: odobriti ODL-001 (ADR: BiH accounting localization unutar FIN domena — dopušteno per 12_FINANCE_BOUNDARY "until a dedicated accounting localization exists").

## Obim (tačan)
Capability IDs: **FIN-023** (journal entries/lines, vrste naloga, numeracija po pravnom licu, draft→pregled→posted), **FIN-024** (kontni plan po pravnom licu, 8-cifrena konta, uloga→konto mapa, lijena partner analitika iz MDM partnera), **FIN-025** (početna stanja po pravnom licu + guard datum + zaključavanje perioda), **FIN-026** (storno: zrcalni nalog, veza original↔storno, zabrana izmjene posted naloga).

## Planirane promjene
- Šema: `gl_account`, `gl_journal_entry`, `gl_journal_line`, `gl_system_account`, `gl_opening_balance_date`, `gl_period_lock` (sve s `tenantId` + `legalEntityId`); migracija + CI regen tok.
- Paket `domain-fin` proširenje: `LedgerService` (posting samo kroz javne komande; D=P invarijanta; idempotentan posting ključ).
- Permisije: `finance.ledger.read`, `finance.ledger.post`, `finance.ledger.manage` (per-korisnik, ne rola).
- UI (`apps/web`): ekran Nalozi (lista+draft forma+pregled ravnoteže+proknjiži) i Kontni plan (pregled/kopiranje konta) — minimalno ali upotrebljivo.
- Testovi: sprint211 integracioni (uspjeh, D≠P odbijen, posting prije PS datuma odbijen, izmjena posted naloga odbijena, storno par, numeracija po dva pravna lica, cross-tenant, bez permisije, duplikat posting ključa).

## Zavisnosti
Nema novih vanjskih; koristi postojeće LegalEntity, MDM Party, audit, approvals.

## Kriteriji prihvata
1) Nalog nastaje isključivo komandom s pregledom; posted je nepromjenjiv; storno jedini put ispravke. 2) Numeracija kontinuirana po pravnom licu. 3) Konto u upotrebi neizbrisiv. 4) Sve iza novih permisija; audit staro→novo. 5) UI tok ručnog naloga radi kraj-na-kraj. 6) Puna suita ostaje zelena.

## Nije uključeno
Bankovni izvodi, zatvaranje, kompenzacije, KUF/KIF/PDV, AI knjiženje, obračuni, migracija podataka — kasniji sprintovi (BACKLOG_DOPUNA faza 1).

---
Prethodni zadatak (17.09., završen): instalacija Software-Factory-MD-v1 paketa + audit usklađivanja (AUDIT_2026-09-17_VERIFIED_STATE.md).
