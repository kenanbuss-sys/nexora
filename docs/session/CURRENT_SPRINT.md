# Active sprint — Sprint 213 (prijedlog): bankovni izvodi + zatvaranje (FIN-030/031, AI-016)

Prethodni **Sprint 212 — ZAVRŠEN 17.09.2026**:
- [x] FIN-027 kartica konta i partnera: PS kumulativ prije perioda, 1 red po proknjiženom nalogu, promet i završni saldo; storno parovi sakriveni po defaultu (neto nula), prekidač includeStorno; read-only
- [x] FIN-029 bruto bilans po pravnom licu i periodu: PS/promet/saldo po kontu, ukupni redovi u ravnoteži (Σsaldo=0, ΣD=ΣP), usklađen s karticama
- [x] UI /ledger: tabovi Kartica (konto+period+storno prekidač) i Bruto bilans
- [x] Testovi sprint212: 6/6 (read-only garancija, authz, cross-tenant, storno konzistentnost)
- [x] mac-auto.sh sync ukroćen: samo main + čisto stablo + fast-forward; nikad ne odbacuje rad

Lokalna provjera: `INTEGRATION=1 pnpm exec vitest run src/sprint212.integration.test.ts` (apps/api); UI: /ledger → Kartica / Bruto bilans.

Sprint 213 obim: BACKLOG_DOPUNA faza 1 red 3 — čeka potvrdu vlasnika.
