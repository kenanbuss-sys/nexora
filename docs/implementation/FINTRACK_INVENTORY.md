# FinTrack — potpun inventar poslovnih funkcija (audit, read-only)

Datum audita: 17.09.2026. Izvor: kopija koda u `/home/claude/audit/fintrack`.
Stack: React 18 + Vite 5 (JSX, ne TS), Tailwind 3 (`ft.*` tokeni), Supabase (Postgres + Auth + Edge Functions + Storage + Realtime + pg_cron), Vercel hosting, PWA (manifest + `public/sw.js`). `src/App.jsx` je monolit od 24.806 linija (svaki tab = jedna `function XTab()` komponenta u tom fajlu); izdvojeni moduli: `src/knjigovodstvo`, `src/control`, `src/qr`, `src/voice`, `src/lib` (čista logika + vitest testovi), `src/pages`+`src/components` (legacy iz starije verzije, README opisuje samo njih). Verzija: `package.json` 2.19.0.

Dvije firme (multi-company): "Srebrenik" i "Brčko" — provlači se kroz kontni plan, naloge, PDV, izvode. Poslovnice i sektori ("Pending", "Predikcije") su odvojena dimenzija za HR/rezultate.

---

## Troškovi (fakture dobavljača) i Prihodi
- Korisnici/problem: finansijski krug prati ulazne fakture, statuse plaćanja, rokove i prihode po poslovnici/kategoriji.
- Glavne radnje i tok: unos/izmjena troška kroz `ExpenseModal` (App.jsx:845), lista s filterima, KPI kartice, historija uplata (`PaymentHistoryModal`, App.jsx:2397); prihodi u `IncomeTab` (App.jsx:2576). Statusi: "plaćeno" / "neplaćeno" / "djelimično plaćeno" (`STATUS_BG`, App.jsx:99-103). Skok iz troška na knjižni nalog (`onOpenNalog`).
- Entiteti: `expenses` (+ `expense_items` stavke, `expense_status_history`, `attachment_path` za original fakture), `expense_payments` (uplate, `created_by` default `auth.uid()`), `revenue` (prihodi po branch/sector/date). Rok plaćanja: `expenses.due_date` (migracije `20260718_due_date.sql`, backfill `20260724_backfill_due_date_placeno.sql`), datum knjiženja `booking_date` (`20260718_booking_date.sql`).
- Validacije/obračuni: `paid_amount`/`remaining`/`status` su IZVEDENI iz zatvaranja (`recompute_expense_paid`, migracija `20260908_zatvaranje_potrazivanja.sql`); porezne kategorije (PDV, porez, isplata dobiti) se izuzimaju iz poslovnih rashoda (`isTaxCategory`, App.jsx:110-114). KPI "Dospijeva 7 dana", kolona Rok crveno/žuto.
- Prava pristupa: RLS `expenses: select/insert/update` + `branch_limit` (migracija `20260719_branch_limit_rls.sql`, helper `branch_allowed()`); brisanje troška samo admin ILI flag `profiles.can_delete_expenses` (App.jsx:9983, migracija `20260726_can_delete_expenses.sql`); `expense_payments` politika `finance_only` (`20260719_rls_lockdown.sql`). Klijentski firm/branch filter helperi `qB/qBS/myBranches/mySectors` (App.jsx:165-196).
- Izvještaji/izvoz: CSV export (`onExport` u Dashboardu), `ReportsTab` (App.jsx:8423) finansijski izvještaj; prilog fakture kroz signed URL iz privatnog bucketa `fakture` (storage politike `fakture_read/upload`).
- Automatizacije: sljedivost uplata — DB audit trigger `trg_ep_audit` → `user_activity_log` (`20260908_uplate_sljedivost_bez_automatike.sql`); dnevni push "fakture dospijevaju danas" (send-push `daily-checks`).
- DOKAZ: App.jsx:845, 2397, 2576, 7818 (`TaxTab` — dijeli kod PDV/Dobit pregleda), 9981-9983; migracije `20260718_due_date.sql`, `20260908_*`.
- Ograničenja/anti-paterni: identitet dobavljača je i dalje dijelom slobodan tekst (`expenses.vendor`) uz `partner_id` (vidi docs/glavna-knjiga-arhitektura.md §1 — tri paralelne evidencije, F5 "gašenje dvostruke logike" NIJE završeno); auto-sakupljanje vendora iz troškova u klijentu (App.jsx ~9997) duplira šifrarnik partnera.

## Rokovi plaćanja / dospijeća (cash-flow)
- Tok: forma troška default rok = datum + 30 dana, pamti zadnji broj dana po partneru (localStorage `ft_due_days`); bedž "dospijeva za X dana"; cash-flow projekcija 30/60 dana u weekly-insights i voice tool `get_cashflow`.
- DOKAZ: docs/context/invoice-import.md; `supabase/functions/weekly-insights/index.ts` (analiza dospijeća); `voice-agent/index.ts:58`.

## Dvojno knjigovodstvo (KnjigovodstvoTab)
- Korisnici/problem: interni finansijski krug vodi glavnu knjigu za dvije firme paralelno s vanjskim knjigovodstvom.
- Glavne radnje i tok: `KnjigovodstvoTab` (App.jsx:4061) sa sub-tabovima: Pregled, Nalozi, Auto-knjiženje, Obračuni, Kartice, 🔗 Zatvaranje, Partneri, Šifrarnik, Glavna knjiga, Bruto bilans, KUF/KIF, 🔍 Usklađenost (App.jsx:6034). Ručni nalog / obračuni / auto-knjiženje kreiraju DRAFT → modal pregleda (ravnoteža, konta postoje/aktivna, partner u šifrarniku) → Proknjiži; bulk auto-knjiženje ima zbirni pregled.
- Entiteti: `journal_entries` (kolone: `company`, `entry_no` jedinstven PO FIRMI — `UNIQUE(company, entry_no)`, trigger `trg_je_entry_no` → `next_entry_no(firma)` sa per-firma sequence-ima; `vrsta`: POČETNO STANJE, KIF, KUF, IZVODI MF BANKE, IZVODI UNICREDIT BANKE, KOMPENZACIJA, OBRAČUN, STORNO, RUČNI NALOG, HISTORIJA; `stornirano`, `storno_naloga_id`), `journal_lines` (debit/credit, `partner`/`partner_id`, `company` punjena triggerom), `accounts` (PK (company, code), 8-cifrena konta — constraint `accounts_code_8`, `class` GENERATED, `tip`), `system_accounts` (uloga→konto po firmi), `account_code_map`, `category_account_map`, `article_account_map`, `ledger_lock`, `opening_balance_dates`, `profit_years`.
- Validacije/obračuni/izuzeci: korišteno konto se ne smije brisati ni renumerisati (DB triggeri); `guard_opening_date` blokira knjiženje prije datuma početnog stanja (Srebrenik 31.05.2026, Brčko 30.06.2026) osim vrste POČETNO STANJE/HISTORIJA; storno isključivo `storno_entry(id, razlog)` — original i zrcalo se označe i kartica ih skriva; `trg_guard_lines` brani izmjene proknjiženih naloga. Zabranjeno hardkodiranje konta: jedina mjesta s brojevima su `SYS_FALLBACK` (App.jsx:3772) i `PARTNER_PREFIX` {dobavljac:"4320", kupac:"2110"} (App.jsx:3794); sistemska konta preko `sa("uloga")`.
- Prava pristupa: sve knjigovodstvene tabele RLS `finance_only` (`20260719_rls_lockdown.sql`); tab se renderuje samo uz `profile.finance_access` (App.jsx:11107) — flag po korisniku, NE po roli.
- Izvještaji/štampa: PDF naloga i kartica jsPDF s DejaVu Sans subsetom (`src/pdfFont.js`, dinamički import App.jsx:5531); memorandum/logo `src/printLogo.js` (App.jsx:3901); bruto bilans view `bruto_bilans` s kolonom company; IOS s kartice; KUF/KIF Excel export (App.jsx:7177-7181) i print (App.jsx:5859-5884). Podaci firme (naziv, ID/PDV broj, žiro) za sve print dokumente u `CompanyInfoSettings` (App.jsx:1258).
- Automatizacije: NEMA automatskog knjiženja — nalog nastaje isključivo akcijom korisnika (ručni nalog, `book_statement_line`, kompenzacija, `storno_entry`, obračuni s pregledom) ili odobrenom migracijom; stari `book_payment`/`storno_payment` triggeri su DROP-ovani (`20260908_uplate_sljedivost_bez_automatike.sql`, docs/context/no-auto-posting.md).
- DOKAZ: App.jsx:4061-7800; migracije `20260716_f2_konta_8_cifara.sql`, `20260824_kontni_plan_po_firmi.sql` (+ snapshot `mig_kontni_kontrola`), `20260908_numeracija_naloga_po_firmi.sql`, `20260908_zatvaranje_potrazivanja.sql`, `20260908_relink_faktura_nalog.sql`; docs/glavna-knjiga-arhitektura.md.
- Ograničenja: docs i kod se RAZLIKUJU oko uplata — docs/context/accounting.md (28.07.) opisuje book_payment trigere kao aktivne, a docs/context/CONFLICTS.md + migracija 08.09. ih ukidaju; VAŽI stanje 08.09. Kartica po tekstu partnera je legacy problem (tri istine) dok F5 ne prođe.

## Kontni plan po firmi i šifrarnik partnera
- Tok: svaka firma svoj plan (duplicirana konta), kopiranje konta u drugu firmu (App.jsx:4696), preimenovanje kroz `rename_account(p_old,p_new,p_company)`; partneri su GLOBALNI šifrarnik (`partners`): `redni_broj` auto-increment + DB trigger `partners_konto` dodjeljuje partner-konta 4320XXXX (dobavljač) / 2110XXXX (kupac); analitika u `accounts` nastaje lijeno kroz `ensurePartnerAccount(side, ime, firma)` u OBJE firme (`20260720_partners_ensure_accounts.sql`); `partners.sifra_knjigovodstvo` = šifra iz vanjskog knjigovodstva.
- Prava: `partners` read za sve prijavljene, write/update/delete `write_finance`/`update_finance`/`delete_finance` politike.
- DOKAZ: App.jsx:4652-4744, 4894-4898, 5117; migracije `20260714_f1_partneri.sql`, `20260716_f1b_sifrarnik_backend.sql`, `20260720_valute_i_rename_konta.sql`, `20260728_vendors_legacy.sql` (stari `vendors` → backup).

## Početna stanja, storno, kartice konta
- Tok: početna stanja po firmi (migracije `20260715_pocetno_stanje_brcko.sql`, `20260908_monetizead_pocetno_stanje_ciscenje.sql`); analitička kartica = čista logika `src/lib/kartica.js` (`buildKartica`: 1 red po nalogu, PS = kumulativ prije perioda) + `src/lib/karticaPrint.js` (HTML print i jsPDF isti layout) + testovi `kartica.test.js` (MonetizeAd fixture) + prihvatna skripta `scripts/kartica-acceptance.mjs` nad pravim podacima.
- Eksterna kartica za klijenta: `src/knjigovodstvo/EksternaKartica.jsx` + `buildEksternaKartica`/`eksterniOpis`/`stornoParovi`/`provjeriEksternu` u `src/lib/kartica.js` — striktno samo PS + fakture + uplate po izvodu + kompenzacije; print BLOKIRAN dok saldo eksterne ≠ saldo interne bez storna.
- Brzi pregled konta: `src/knjigovodstvo/KontoQuickView.jsx` (bočni panel, reuse `buildKartica`).
- DOKAZ: navedeni fajlovi; docs/context/external-ledger.md; App.jsx:6034 ("kartice").

## KUF/KIF i PDV
- Tok: KUF/KIF generisani iz naloga vrste KUF/KIF (App.jsx:4194, 5733-5884), Excel export i print; PDV tab (`TaxTab kind`, App.jsx:7818+) — izlazni PDV 17% iz prihoda po `booking_date`, status uplate po firmi+periodu u `pdv_periods` (upsert `onConflict:"firma,godina,mjesec"`, App.jsx:7935); PDV prijava u Obračunima zatvara 4700/2700, razlika na 4790/2790 (App.jsx:6698). `pdvSplit` u `src/lib/finance.js` s testovima.
- Prava: `pdv_periods` politika `finance_only`; tab samo uz `finance_access`.
- Automatizacije: weekly-insights analiza `pdv_rok` (PDV bez oznake uplate nakon 10. u mjesecu).
- DOKAZ: App.jsx:7871-7935, 8274; migracija `20260718_pdv_periods.sql`.

## Dobit / finansijski izvještaji
- Tok: tab "dobit" (TaxTab varijanta) — evidencija poreza na dobit i isplate dobiti po godinama (`profit_years`, migracija `20260718_dobit_profit_year.sql`); `ReportsTab` (App.jsx:8423) — finansijski izvještaj/pregledi + export.
- Prava: `profit_years` `finance_only`; tabovi uz `finance_access`.
- DOKAZ: App.jsx:11095-11112.

## Bankovni izvodi, raspoređivanje uplata (Zatvaranje), kompenzacije
- Korisnici/problem: dnevni PDF izvodi banke se pretvaraju u evidentirane uplate i knjižene naloge bez ručnog prepisivanja; uplate se zatim raspoređuju po fakturama.
- Tok (Import → 🏦): upload PDF izvoda → Claude vision parsira stavke (kolone Duguje/Potražuje se u text-ekstrakciji miješaju, zato vision) → firma auto po prefiksu transakcijskog računa (`RACUN_FIRMA` {"338370":"Brčko","338630":"Srebrenik"}, App.jsx:8910) → sparivanje s neplaćenim fakturama (iznos ±0.01, fuzzy partner, broj računa u svrsi; ✅/🟡/⚠️ + ručni dropdown; bankarska provizija → prijedlog troška) → potvrda korisnika. Kontrola: suma stavki = saldo prometa; duplikat spriječen `bank_statements` unique(racun, broj); original PDF u privatni bucket `izvodi`.
- Knjiženje: stavka izvoda (`bank_statement_lines`) → `book_statement_line()` (vrsta IZVODI MF/UNICREDIT BANKE); raspoređivanje po fakturama = tabela `zatvaranje_potrazivanja` (stavka_izvoda_id, faktura_id, iznos) kroz sub-tab 🔗 Zatvaranje (`src/knjigovodstvo/ZatvaranjeTab.jsx`). DB validacije `zp_validate`: Σ ≤ uplata, Σ ≤ faktura, ne prije `opening_balance_dates`, ista firma.
- Kompenzacije: dugme u Karticama → `settlements` + `settlement_links` + nalog + print izjave o kompenzaciji (App.jsx:5343-5347); pozajmice šablonima 2388/4290.
- Prava: `bank_statements` politika `finance_only`; sve iza `finance_access`.
- DOKAZ: App.jsx:8910-9500 (import izvoda), migracije `20260719_bank_statements.sql`, `20260728_f2_placanja_f3_settlements.sql`, `20260908_zatvaranje_potrazivanja.sql`; docs/uputstvo-izvodi-ahmed.md (operativno uputstvo).
- Kontradikcija docs↔kod: bank-import.md (juli) kaže "potvrda ide kroz book_payment trigere" — od 08.09. NE važi (no-auto-posting).

## Import (Excel) i AI unos faktura
- Tok: `ImportTab` (App.jsx:8715) modovi: `excel` (xlsx import troškova s mapiranjem mjeseci `MONTHS`, preskakanje sumarnih redova `SKIP_ROWS`), 📸 AI unos fakture (više PDF/slika redom kroz `aiComplete` vision — dobavljač fuzzy-uparen s partnerima, broj računa, datumi, iznos, PDV, rok → predpopunjena forma troška, NIŠTA se ne snima bez potvrde; original u bucket `fakture` → `expenses.attachment_path`), 🏦 Import izvoda (gore). Prečica "📸 AI unos" iz Troškova preko localStorage `ft_import_mode` (App.jsx:8720, 10668).
- Prava: Import tab role admin/direktor/finance + manager samo uz `finance_access` (App.jsx:10062-10063).
- DOKAZ: App.jsx:8715-9500, 8837; migracija `20260718_ai_unos_priloga.sql`.

## AI prijedlozi knjiženja (ai-knjizenje)
- Tok: edge funkcija `supabase/functions/ai-knjizenje` — dokument (slika/PDF base64) → Claude vision OCR → referentni uzorci = PRESEDANI iz postojećih ručnih posted knjiženja (isti partner/ključne riječi → konto+strana+broj pojavljivanja) → prijedlog isključivo s kontima iz plana firme → sigurnost RAČUNA KOD (ne AI): VISOKA ≥3 presedana, SREDNJA 1-2, NISKA 0. UI `src/knjigovodstvo/AiKnjizenjeModal.jsx`: uredive stavke, D/P kontrola blokira dok razlika ≠ 0, "Kreiraj draft nalog" → postojeći pregled → Proknjiži. NIKAD ne knjiži samo.
- Prava: čitanje baze klijentom s korisnikovim JWT-om (RLS finance); model `claude-sonnet-5` direktno na Anthropic API.
- DOKAZ: `supabase/functions/ai-knjizenje/index.ts:1-30`; docs/context/ai-accounting.md.

## Radnici (WorkersTab) + osjetljivi podaci + HR most
- Korisnici/problem: HR evidencija radnika dvije poslovnice, uz strogo razdvajanje osjetljivih podataka (plata, JMBG, LK, banka).
- Tok: `WorkersTab` (App.jsx:12057) — CRUD radnika, `Worker360` profil (App.jsx:11709), dokumenti (`WorkerDocs`, App.jsx:11892, bucket `worker-docs`), generisanje ugovora o radu iz šablona (`ContractTemplatesSettings` App.jsx:1599, `generated_contracts`, `contract_templates`, `src/contractMemo.js`; brojevi slovima `brojSlovima/plataSlovima` u `src/lib/finance.js`), QR podaci radnika (`20260722_workers_qr_data.sql`, App.jsx:12818-12828), otkaz/vraćanje.
- Entiteti: `workers` (osnovna polja + `trener_id`, `pcc_liga`, `pending_status`, `is_management`, `employment_start/end`, `contract_*`, `hr_worker_id/hr_synced_at/hr_sync_error`), `workers_sensitive` (JMBG, LK, adresa, banka/devizna — migracije `20260718_workers_sensitive.sql`, `20260723_workers_devizna_banka.sql`, `20260723_workers_jmbg_cips_srebrenik.sql`, `20260730_banke_radnika.sql`), `workers_salary` (neto_plata), `worker_documents`, `banks` (`BankeSettings` App.jsx:1547), `generated_contracts`, `contract_templates`, `hr_employee_map`.
- Prava — troslojno: plata `ws_salary_allowed()` (uski salary krug — hardkodirana UUID allowlista `WS_SALARY_USERS` u App.jsx:~1404 + migracija `20260718_workers_sensitive.sql:13`); dokumenti `ws_docs_allowed()` (širi docs krug, `WS_DOCS_USERS` App.jsx:~1410); menadžment radnici (`workers.is_management`) dodatno zaključani restriktivnim politikama `gc_mgmt_lock`/`wd_mgmt_lock`/`payroll_mgmt_lock`/`ws_mgmt_lock` + storage `workerdocs_mgmt_lock` (helper `is_mgmt_worker()`, migracije `20260720_workers_is_management_lock.sql`, `20260720_mgmt_sensitive_docs_lock.sql`); granularna permisija "plata za ugovore" `profiles.plata_ugovori_branches` + `ws_salary_contract_ok(wid)` (SELECT plate ne-menadžment radnika u dodijeljenim poslovnicama, upis i dalje samo salary krug — `20260909_plata_za_ugovore_permisija.sql`). `mergeWorkerSensitive(list)` u klijentu spaja ono što RLS dopusti. Branch/sector limit: politike `branch_limit`/`sector_limit` na workers.
- Automatizacije/integracije: jednosmjerni HR most `sync-worker-to-hr` (FinTrack → hr.xcall.ba, odvojeni Supabase projekat): piše SAMO zajednička polja (full_name, email, branch, sector, position, start_date, status), kreira HR auth nalog (rola 'radnik') samo za nove, otkaz = BAN; greška vidljiva (`hr_sync_error`, ⚠️ HR ↻ retry); svaki sync audituje `user_activity_log` action `hr_sync`. Obrnuti kanal: edge `employee-portal` — radnik iz HR aplikacije vidi ISKLJUČIVO svoje podatke/dokumente/ugovore (identitet samo iz HR JWT-a preko `hr_employee_map`, rate-limit 60/h, plata zabranjena po dizajnu).
- Izvještaji/štampa: ugovori PDF (DejaVu font, memorandum), dokumenti signed URL.
- DOKAZ: App.jsx:11709-13178; `supabase/functions/sync-worker-to-hr/index.ts`, `employee-portal/index.ts`; migracije `20260718_ugovori_o_radu.sql`, `20260722_hr_employee_map.sql`, `20260720_workers_employment_dates.sql`.
- Anti-paterni: allowliste UUID-ova žive na DVA mjesta (SQL helper + JS konstanta) i moraju se mijenjati sinhrono — dokumentovano ali krhko; migracije s ličnim imenima u nazivu fajla (`20260802_mustafa_employment_start_fix.sql`, `20260912_treneri_elma_anela.sql`) su per-osoba podešavanja kroz SQL.

## Obračun plata (PayrollTab) i isplatni listići
- Tok: `PayrollTab` (App.jsx:15174) — obračun po mjesecu: zarađeno = neto_plata / fond dana (per-sektor `work_days_config`) × dani rada (iz šihtarice), + bonusi (stimulacija/destimulacija/kartice/igrice iz `bonuses`), status draft→confirmed; import obračuna iz Excela (`ImportPayrollModal`, App.jsx:15044) koji zna i upsertovati `workers_salary`; isplatni listić PDF po radniku i "svi listići" (jsPDF + DejaVu, banka/račun iz workers_sensitive samo za salary krug — prompt-10 stavka 7).
- Entiteti: `payroll`, `payroll_workers`, `work_days_config`, `bonuses`, `workers_salary`.
- Prava: tab samo role admin/finance + `allowedTabs` (App.jsx:11224); `payroll_mgmt_lock` za menadžment.
- DOKAZ: App.jsx:15044-15767.

## Šihtarica (prisutnost) + Presjek sati
- Tok: `SihtaricaTab` (App.jsx:13721) — mjesečna matrica po radniku/danu, statusi present/bolovanje/godisnji/slobodan/obuka/odsutan (`STATUS_CONFIG`, ciklus klikom), `countsAsWorked` određuje ulazak u obračun; audit trail svake izmjene u `attendance_log` (migracija `20260802_attendance_audit_trail.sql`) s pregledom "Kontrola izmjena" samo za upravu (App.jsx:13756) i izvještajem po radniku (export audituje se, App.jsx:13908). `PresjekTab` (App.jsx:16397) — radni sati (smjena − pauza), agregat i Excel export.
- Entiteti: `attendance`, `attendance_log`, `work_days_config`.
- Prava: politika `attendance: write`; read_only nalozi blokirani restriktivnim `attendance_ro_*` (`20260912_treneri_rola_supervisor.sql`).
- DOKAZ: App.jsx:13721-14415, 16397-16748.

## Godišnji odmori i odsustva
- Tok: `GodišnjiTab` (App.jsx:19693) — plan perioda po radniku (`annual_leave.periods`), odobravanje (`approved`, `approved_by`), print potvrde s oznakom ODOBRENO; KPI čipovi (pending/approved). Po prompt-10 stavci 6: odobreni plan upisuje buduće dane statusom "godisnji" u attendance (uz confirm). Bolovanja/odsustva se vode kroz šihtaricu (statusi), ne posebnom tabelom.
- Prava: tab role admin/manager/direktor/administracija (App.jsx:10430-10433); `annual_leave_ro_*` za read_only.
- DOKAZ: App.jsx:19693-20199.

## Targeti, rezultati (KPI), bonusi
- Tok: `TargetTab` (App.jsx:11289) — mjesečni target po branch+sector (`targets`), unos prihoda (`revenue`), godišnje poređenje; `KpiTab` (App.jsx:21283) — % ostvarenja, projekcija (prorata), trend vs prošli mjesec, prisutnost, otvoreni/zakašnjeli zadaci; `BonusiTab` (App.jsx:14415) — stimulacija/destimulacija (EUR→BAM u `src/lib/finance.js`, kurs 1.95583), kartice_bam, igrice_bam, "povrat" (procenat od neto bonusa, App.jsx:14562+); finalni bonus ulazi u obračun plata.
- Entiteti: `targets`, `revenue`, `bonuses`.
- Prava: `sector_limit`/`branch_limit` RLS; klijentski `qBS`; migracije `20260720_revenue_targets_hide_from_trener.sql` pa `20260720_revert_revenue_targets_trener_deny.sql` (uvedeno pa VRAĆENO — revenue/targeti su proglašeni operativnim KPI dostupnim trenerima); read_only restriktivne politike na targets/revenue/bonuses.
- DOKAZ: App.jsx:11289-11709, 14415-15044, 21283-21484.

## Lige, checkliste, coaching agenata (ChecklisteTab)
- Tok: `ChecklisteTab` (App.jsx:2925) — razvoj agenata: PCC lige OTB→Iron→Bronze→Silver→Gold→Platinum (`workers.pcc_liga`) i Pending statusi (`workers.pending_status`), šablon checkliste po ligi (`checklist_templates`, match_key), instanca po agentu (`agent_checklists`) sa stanjima stavki (`checklist_item_states`), coaching evidencija (`coachings`), rokovi (`due_date`) i ponovne kontrole (`recontrol_date`). Statusi stavki: "Nije započeto", "U toku", "Završeno", "Čeka provjeru", "Poboljšanje potvrđeno", "Djelimično poboljšanje", "Nema poboljšanja", "Potrebna nova intervencija", "Eskalirano menadžeru" (App.jsx:3101).
- Validacije: "Završeno"/"Poboljšanje potvrđeno" = zatvoreno; DB trigger brani DELETE nad njima (`supabase/agent_checklists_no_delete_trigger.sql`). Bedž u meniju: zakašnjeli + dospjele kontrole, crveno/žuto.
- Prava: rola `trener` vidi SAMO svoje agente (`workers.trener_id = profile.id`, filter u load-u); trener ne mijenja dodjelu trenera; audit kroz `logChange/logCreate` (details {old,new} samo promijenjena polja).
- DOKAZ: App.jsx:2925-4061; docs/context/checklists.md.

## Zadaci (TasksTab) — jednokratni i periodični
- Tok: `TasksTab` (App.jsx:15767) — zadaci s više dodijeljenih osoba (`task_assignments`); TRAJNI status po osobi u `task_assignee_status` (unique task_id+worker_id, upsert iz `changeAssignmentStatus`); `task_logs` = dnevna evidencija i JEDINI izvor statusa za periodične (recurring) zadatke. Zadatak završen tek kad SVE osobe imaju 'završeno' (`getEffectiveStatus`); djelimično = bedž "👥 x/y završilo".
- Validacije/prava: svako označava SAMO sebe (`canMarkFor` — admin i kreator mogu svima); dnevni push pri dodjeli zadatka i na rok (send-push).
- Entiteti: `tasks`, `task_assignments`, `task_assignee_status`, `task_logs`, `admin_tasks`.
- DOKAZ: App.jsx:15767-16397; migracija `20260718_task_assignee_status.sql`; docs/context/tasks.md.

## Radni izvještaji (IzvještajiTab)
- Tok: `IzvještajiTab` (App.jsx:18066) — supervizori/treneri predaju radne izvještaje (`reports`, `submitted_date`, `worker_name`, `created_by`).
- Prava: od 09.09. privatni po autoru — svako vidi/uređuje samo `created_by = auth.uid()`, role admin/direktor/manager vide sve; `worker_name` NIKAD nije osnov prava (slobodan tekst). Migracija `20260909_radni_izvjestaji_samo_svoje.sql` (politike `reports_read/insert/update/delete`, WITH CHECK odbija unos u tuđe ime). Servisni ključ (agenda generator, AI Direktor) i dalje vidi sve.
- DOKAZ: App.jsx:18066-18316; docs/context/reports-privacy.md.

## Sastanci (SastanakTab) — dnevni red, zaključci, prenesene obaveze
- Tok: `SastanakTab` (App.jsx:16796) — sedmični kolegij: sastanci (`meetings`), stavke/zaključci (`meeting_todos`, AI-generisane označene — `20260714_meeting_todos_ai_generated.sql`), bilješke (`meeting_notes`), rasporedi (`meeting_schedules`: day_of_week, auto_create_meeting, last_meeting_id). Prenesene obaveze: `meeting_todos.carry_over=true` → sekcija "Preneseno s prošlog sastanka" u novom sastanku (`carried_from_meeting_id`). AI parsiranje zaključaka u zadatke (App.jsx:16847, 17301-17483).
- Automatika: pg_cron SRIJEDA 06:00 UTC → edge `weekly-agenda-generator` (Claude): striktni 7-dnevni prozor, izvori ISKLJUČIVO whitelist (`meeting_todos`, `tasks`, `reports`, `workers`, `attendance`, `targets`, `revenue` + carry-over) — firmine finansije NIKAD (incident 26.08.2026); kontrolni filter U KODU skenira agendu na finansijske pojmove i imena partnera → pogodak ide u `agenda_review_queue` (odobrava samo finansijski krug) + push, sastanak dobija placeholder; log u `agenda_generation_log`, AI pozivi u `ai_logs`.
- Prava: `meetings`/`meeting_todos`/`meeting_notes` politika `mgmt_only`; `ai_logs`/`ai_briefings`/`agenda_review_queue` samo trojka `fin_trojka()` (`20260826_agenda_incident_rls.sql`); `*_trener_read` politike za buduće trener naloge; read_only restriktivne politike.
- DOKAZ: App.jsx:16748-18066; `supabase/functions/weekly-agenda-generator/index.ts`; `supabase/weekly_meeting_cron.sql`.

## Oprema i zaduženja + QR + javni uvid
- Tok: `OpremaTab` (App.jsx:18316) — inventar (`equipment`, `equipment_categories`): stanje (Ispravno/U kvaru/Na servisiranju/Otpisano), lokacija, serijski broj, inventarni broj OPR-00001 (sequence `equipment_inv_seq`, trigger `trg_equipment_inv`, UNIQUE, NEPROMJENJIV — trigger baca grešku na UPDATE) + `qr_token uuid` + `naljepnica_printana_at`. `ZaduženjaTab` (App.jsx:18892) — zaduženja opreme radnicima (`equipment_assignments`), grupno zaduženje (`zaduzenje_token` isti za grupu worker+datum, trigger `trg_ea_zaduzenje_token`), razduženje.
- QR/štampa: `src/lib/qr.js` (+testovi): `qrSvg()`, `naljepniceHtml()` (A4 arak 3×8, 70×37mm, ili pojedinačna naljepnica), `popisHtml()` (popis za inspekciju po lokaciji s potpisima), `reverzHtml()` (revers o preuzimanju s potpisima obje strane i QR-om grupe), `naljepnicaZaduzenjaHtml()`. Sve akcije štampe audituju se.
- Javni ograničeni uvid: rute `/q/o/<token>` i `/q/z/<token>` BEZ prijave (`src/qr/JavniQR.jsx`, hvatanje rute App.jsx:24787 prije login ekrana); podatke daju isključivo SECURITY DEFINER funkcije `qr_oprema(uuid)`/`qr_zaduzenje(uuid)` (GRANT anon) koje vraćaju SAMO neosjetljiva polja — nikad cijene, napomene ni interne ID-jeve.
- Prava: tabovi role admin/manager/direktor/supervisor/administracija (App.jsx:10426-10429).
- DOKAZ: migracija `20260917_qr_oprema_zaduzenja.sql` (backupi `*_backup_20260917`); docs/context/qr.md.

## Vozni park
- Tok: `VozniParkTab` (App.jsx:23750) — vozila (`vehicles`), servisi (`vehicle_services`), gorivo (`vehicle_fuel`), zaduženja vozila (`vehicle_assignments`, zatvaranje starog zaduženja `to_date` pri novom); praćenje registracije/servisa, rangiranje po trošku (gorivo+servisi), mjesečni troškovi, print pregleda.
- Prava: tab samo admin/manager (App.jsx:10432); `vehicles` ima `branch_limit` RLS; migracija `20260724_emina_vozni_park.sql` (per-korisnik pristup kroz profil, ne kod).
- DOKAZ: App.jsx:23750+.
- Poznata mana: trošak goriva se sabira iz polja `total_km` (App.jsx VozniPark ~L106/113) — naziv kolone sugeriše kilometre, a koristi se kao iznos; provjeriti semantiku prije prenosa.

## Otvaranje poslovnice (PlaybookTab)
- Tok: `PlaybookTab` (App.jsx:13178) — playbook faze i koraci (`playbook_phases`, `playbook_steps`), instanca otvaranja (`branch_openings`, `branch_opening_steps`), troškovi otvaranja (`branch_opening_costs`), kontakti (`playbook_contacts`).
- Prava: isključivo flag `profiles.playbook_access` (App.jsx:10436, 11199) + RLS iz migracije `20260803_playbook_otvaranje_poslovnice.sql`.
- DOKAZ: App.jsx:13178-13721.

## Lotto (odvojena mala firma/djelatnost)
- Tok: `LottoTab` (App.jsx:20199) — kompletna mini-evidencija odvojena od glavne: radnici (`lotto_workers`), prisutnost (`lotto_attendance`, statusi kao šihtarica), prihodi (`lotto_income`, kategorije "Prihod od igara"/"Provizija"/"Ostalo"), troškovi (`lotto_expenses`), bonusi (`lotto_bonuses`), obračun plata (`lotto_payroll`), dashboard sekcija.
- Prava: tab samo admin/direktor (App.jsx:10439-10441).
- DOKAZ: App.jsx:20199-20743.

## Dashboard + upozorenja
- Tok: `Dashboard` (App.jsx:9826) je shell (sidebar, header, globalna pretraga, tabovi); `DashboardLive` (App.jsx:22495) operativni pregled — finansijski blok SAMO uz `finance_access`, ostale kartice (Target, Radnici, Oprema, Godišnji, Zadaci) samo ako korisnik ima taj tab (`maTab()`); grafovi recharts (`ChartsTab` App.jsx:2760).
- DOKAZ: App.jsx:9826-11289, 22495+; docs/context/extra-tabs.md.

## AI Direktor + Upozorenja (insights)
- Tok: `AiDirektorTab` (App.jsx:21681) sub-tabovi: brifing (jutarnji AI brifing, sprema se u `ai_briefings`), chat, rizik radar, board report, historija, 🔮 Upozorenja (`InsightsPanel`, App.jsx:1433). Upozorenja generiše edge `weekly-insights` (pg_cron PONEDJELJAK 06:00 UTC → tabela `insights`): skok kategorije troška >30%, partner dug >30/60 dana, pad prihoda >20% prorata, neproknjižene fakture >15 dana, PDV rok, dospijeća + cash-flow 30/60d, istek ugovora <30d i LK <60d + AI sažetak (Claude, bosanski); dedup preko `meta.key` (<14 dana neacknowledgeovan).
- Prava: tab admin ILI hardkodirana UUID allowlista `INSIGHTS_USERS` (App.jsx:1384-1388) — ne-admin allowlist korisnik vidi SAMO panel Upozorenja; RLS `insights_allowed()` (`20260718_insights_allowlist.sql`) + `finance_only`. Upozorenja se NAMJERNO ne uključuju u dnevni red sastanaka.
- DOKAZ: App.jsx:1383-1546, 11141, 21681-22314; `supabase/functions/weekly-insights/index.ts`; migracija `20260718_insights.sql`.

## Odluke (OdlukeTab)
- Tok: `OdlukeTab` (App.jsx:21484) — dnevnik menadžerskih odluka (`decisions`): unos, status, ishod (outcome), AI analiza odluke (`aiComplete`, App.jsx:21559+).
- Prava: samo admin (App.jsx:11146).

## Control Center (5 TV ekrana + komandna ploča)
- Tok: rute `/control/1`–`/control/5` (TV) i `/control` (telefon-komanda) hvataju se u App() prije Dashboarda (App.jsx:24804) → `src/control/ControlRoom.jsx`; ekrani: S1 Executive, S2 Poslovnice i sektori, S3 Live Operations, S4 Workforce (šihtarica+godišnji+HR prisutnost), S5 Intelligence (`control-data/index.ts:96-309`). Sinhronizacija: singleton `control_state` (mode/focus/poslovnica/povjerljivi_mod/screen_overrides) + Supabase Realtime; upravlja komandna ploča i voice tool `kontrolisi_ekrane`. Otpornost TV-a: watchdog reload 3 min, noćni reload 04:00, Wake Lock, refresh 60 s.
- Prava: edge `control-data` s korisnikovim JWT-om, pristup samo `control_state.allowed_users` (allowlista u bazi); servisni klijent TEK NAKON provjere; plate na S4 samo uz `povjerljivi_mod=true` I hardkodiranu `SALARY_USERS` listu u funkciji (control-data/index.ts:20-24); HR podaci read-only agregati preko `HR_SERVICE_ROLE_KEY`. Keš 60 s po ekranu.
- DOKAZ: `supabase/functions/control-data/index.ts`; migracija `20260813_control_center_state.sql`; `src/control/ControlRoom.jsx`; `vercel.json` SPA rewrite.

## XCALL glasovni asistent (voice)
- Tok: orb `src/voice/XcallOrb.jsx` montiran globalno (App.jsx:11233) → edge `voice-agent`: audio/tekst → STT (OpenAI Whisper) → Claude tool-loop → TTS (Azure, opciono ElevenLabs). Toolovi (jedini prozor prema podacima, voice-agent/index.ts:33-71): get_troskovi, get_kategorije, get_prihodi, get_neplacene_fakture, get_ugovori_isticu, get_radnici, get_obracun_plata, get_sihtarica, get_cashflow, get_partner, get_mjesecni_trend, kontrolisi_ekrane, odgovori (terminalni: govor + prikaz kpi/tabela/graf + navigacija samo na tabove iz `window.__ft_allowed`). Wake word "Hej XCALL" preko Web Speech API lokalno (toggle localStorage `ft_xcall_wake`).
- Prava: AI NEMA direktan pristup bazi — svaki tool se izvršava Supabase klijentom s KORISNIKOVIM JWT-om (RLS važi automatski); MVP read-only; `voice_config.allowed_users` (prazno = svi; provjera u orbu I funkciji — allowlista u bazi, `20260813_xcall_voice_allowlist.sql`). Konfiguracija (ime, wake fraza, TTS glas, LLM model, boje) u tabeli `voice_config` (singleton, write samo admin) — `20260804_xcall_voice_core.sql`.
- DOKAZ: `supabase/functions/voice-agent/index.ts`; `src/voice/XcallOrb.jsx`; docs/context/voice.md.

## Pretraga, notifikacije, 2FA, korisnička prava (Users), audit, error log, changelog
- Globalna pretraga: `GlobalSearch` (App.jsx:2186), Ctrl+K — radnici, partneri, konta, checkliste, oprema, troškovi, zadaci; rezultati filtrirani po `window.__ft_allowed`; deeplink localStorage `ft_deeplink` (15 s TTL) + remount `key={"dl"+dlKey}`.
- Push notifikacije: `push_subscriptions` (RLS `own_subscriptions`, `20260719_push_subscriptions.sql`), edge `send-push` (VAPID, web-push; mrtve pretplate 410/404 se brišu); pozivaoci: app s JWT-om (`sendPush`, App.jsx:200-210, javni VAPID ključ hardkodiran App.jsx:199), druge edge funkcije servisnim ključem, pg_cron dnevno 06:00 UTC `daily-checks` (zadaci s rokom danas svima dodijeljenima; fakture koje dospijevaju danas SAMO hardkodiranoj `FINANCE_USERS` listi u funkciji). Postavke po korisniku `NotifikacijeSettings` (App.jsx:510). SW handleri `public/sw.js`.
- 2FA (TOTP): Supabase MFA — `SecuritySettings` (App.jsx:576, enroll/verify/unenroll + passkey registracija s auditom, App.jsx:653-666), `MfaGate` (App.jsx:463) aal1→aal2 na loginu; nije forsirano, finance korisnici bez 2FA dobijaju banner.
- Korisnici (UsersTab, App.jsx:9504): promjena role, `hide_tabs` (sakrij tab), `extra_tabs` (dodaj tab iz whitelist-e `EXTRA_TABS_ALLOWED`), `allowed_branches`/`allowed_sectors` (multiselect), flagovi finance_access / can_delete_expenses / playbook_access / plata_ugovori_branches / read_only ("👁️ Samo čitanje" — restriktivne `*_ro_ins/upd/del` politike uz `is_read_only()`), indikator 2FA. Samo admin.
- Audit: `logActivity({action, entity_type, entity_id, details})` → `user_activity_log`; pregled `AktivnostTab` (App.jsx:21091, samo admin); i DB triggeri pišu u isti log (uplate, hr_sync, weekly_backup ishod).
- Error logging: globalni handler (App.jsx:241-290): window.onerror, unhandledrejection, fetch wrapper za pale Supabase pozive → tabela `error_logs` (dedup 60 s, max 15/sesiji); korisniku `alertErr(e, kontekst)`; UI Postavke → 🐞 Greške (`ErrorLogSettings`, App.jsx:1302, samo admin; RLS insert svi, select/update `is_admin()` — `20260718_error_logs.sql`).
- Changelog: `ChangelogTab` (App.jsx:22314, tabela `changelog`, samo admin); Uputstva: `UputstvaTab` (App.jsx:2036) — sadržaj u konstantama `UPUTSTVA_MODULI`/`NOVO_U_APP` s per-stavka permisijama `vidi:` (`UPUTSTVA_PERM`: salary/docs/plata_ugovori/uprava/admin/finance, App.jsx:1701-1703; guard test `src/lib/uputstva-permisije.test.js`).
- DOKAZ: navedene linije; docs/context/search-mfa-push-documents.md, errors.md, audit.md, help-permissions.md.

## Backup / restore
- Nivoi: (1) Supabase dnevni snapshot (Pro, ~7 dana; PITR isključen), (2) sedmični JSON export — edge `weekly-backup` (pg_cron NEDJELJA 03:00 UTC, `20260718_weekly_backup_cron.sql`): ~60 tabela iz `TABLES` liste (weekly-backup/index.ts:35-56) → gzip JSON u privatni bucket `backups/weekly/`, retencija 8; ishod u `user_activity_log`; (3) off-site kopija istog fajla u privatni GitHub repo (secreti GITHUB_BACKUP_TOKEN/REPO), (4) git historija migracija, (5) lokalni satni kod-backup `scripts/local-backup.sh` (launchd, zadnjih 48 arhiva, preskače node_modules/dist/.git). Restore korak-po-korak: `docs/restore-procedura.md` (uklj. gašenje trigera pri vraćanju uplata i FK redoslijed). Ručni backup = POST na funkciju prije rizičnih operacija.
- Ograničenje: `TABLES` NE sadrži novije tabele (npr. `zatvaranje_potrazivanja`, `bank_statement_lines`, `opening_balance_dates`, `control_state`, `voice_config`, `agenda_review_queue`, playbook tabele, lotto tabele, `hr_employee_map`, `attendance_log`) — pravilo "novu ključnu tabelu dodati u TABLES" nije dosljedno ispoštovano; sadrži i `companies`/`prisutnost`-slične tabele koje kod jedva referencira.

---

## Presjek mehanizama pristupa (globalno)
1. **Role** (`profiles.role`): admin, direktor, manager, finance, supervisor, trener, administracija, viewer (App.jsx:98). Rola → `allowed` lista tabova u switchu (App.jsx:10020-10099); meni `NAV` se od 12.09. IZVODI iz te liste (jedan izvor istine, App.jsx:10463-10469, `navTo` ignoriše klik van prava); osjetljivi tabovi (pdv/dobit/knjigovodstvo/payroll/users/changelog/odluke/aktivnost) zadržavaju i dodatnu rolnu/flag provjeru pri renderu.
2. **Per-korisnik flagovi u `profiles`**: `finance_access` (jedini ključ za PDV/Dobit/Knjigovodstvo/Import — NE ide po roli), `can_delete_expenses`, `playbook_access`, `plata_ugovori_branches[]`, `read_only`, `extra_tabs[]` (whitelist `EXTRA_TABS_ALLOWED` — finansije/plate/admin se NIKAD ne dodjeljuju ovim putem), `hide_tabs[]`, `allowed_branches[]`, `allowed_sectors[]`.
3. **RLS u bazi je izvor istine**; UI liste su samo za prikaz. Ključni SQL helperi: `is_admin()`, `insights_allowed()`, `ws_salary_allowed()`, `ws_docs_allowed()`, `is_mgmt_worker()`, `branch_allowed()`, `sector_allowed()`, `fin_trojka()`, `ws_salary_contract_ok()`, `is_read_only()` (lokacije: migracije 20260718_error_logs:27, 20260718_insights_allowlist:7, 20260718_workers_sensitive:13/22, 20260719_branch_limit_rls:11/48, 20260720_workers_is_management_lock:28, 20260826_agenda_incident_rls:13, 20260909_plata_za_ugovore_permisija:19-25, 20260912_treneri_rola_supervisor:21). Restriktivne (RESTRICTIVE) politike se koriste kao dodatni katanac (mgmt_lock, read_only, wsal_mgmt_lock).
4. **Firm-scope**: `company` kolona (Srebrenik/Brčko) na knjigovodstvenim tabelama + obavezan `.eq("company", bkComp)` u klijentu; branch/sector-scope klijentski kroz `qB/qBS` + RLS `branch_limit`/`sector_limit`; admin i finance_access se ne ograničavaju (App.jsx:170, 182).
5. **Allowliste u bazi** (konfigurabilne bez koda): `control_state.allowed_users`, `voice_config.allowed_users`.
6. **Hardkodirane UUID/e-mail allowliste u kodu** (moraju se mijenjati sinhrono s SQL helperima): `INSIGHTS_USERS` (App.jsx:1384), `WS_SALARY_USERS`/`WS_DOCS_USERS` (App.jsx:~1404-1415), `SALARY_USERS` (control-data/index.ts:20), `FINANCE_USERS` (send-push/index.ts:~27).
7. **Edge funkcije**: uvijek korisnikov JWT za podatke (RLS važi), servisni ključ tek nakon allowlist provjere ili za sistemske poslove (cron, backup, HR most); AI nikad direktno u bazu.
8. **Fail-open fallback pri učitavanju profila**: ako select profila padne, `loadUser` vraća objekat s `role:"admin"` (App.jsx:398-406) — UI fallback (RLS i dalje štiti podatke), ali je anti-patern: greška mreže prikaže admin-meni.

## Hardkodirano što mora postati konfiguracija
- UUID allowliste korisnika: `INSIGHTS_USERS` (App.jsx:1384-1388), `WS_SALARY_USERS`/`WS_DOCS_USERS` (App.jsx uz liniju ~1404), `SALARY_USERS` (supabase/functions/control-data/index.ts:20-24), `FINANCE_USERS` (supabase/functions/send-push/index.ts:26-29) + odgovarajući SQL helperi s istim UUID-ovima (20260718_insights_allowlist.sql, 20260718_workers_sensitive.sql, 20260826_agenda_incident_rls.sql). Dupla evidencija JS↔SQL je dokumentovana obaveza ("promjena = obje lokacije") — kandidat za tabelu permisija.
- Firme "Srebrenik"/"Brčko" kao string literali kroz cijeli kod i migracije (accounts.company CHECK, sequence-i po firmi u `20260908_numeracija_naloga_po_firmi.sql`, `RACUN_FIRMA` prefiksi transakcijskih računa App.jsx:8910); datumi početnih stanja u DB funkcijama (`opening_balance_dates` tabela postoji — dobro, ali su datumi i u docs/kodu ponovljeni).
- Supabase project-ref URL-ovi hardkodirani u klijentu: `AI_PROXY_URL` (App.jsx:120), send-push URL (App.jsx:206), deploy komande u docs.
- AI modeli: `AI_MODELS` (App.jsx:123), `MODEL="claude-sonnet-5"` u ai-knjizenje i weekly-insights; voice model je konfigurabilan (voice_config), ostali nisu.
- VAPID public ključ u App.jsx:199 (javan po prirodi, ali je konfiguracija).
- Sektori "Pending"/"Predikcije" hardkodirani (PayrollTab work_days_config upserti, mySectors komentari); lige OTB…Platinum (App.jsx:3426); statusi šihtarice; kategorije Lotto-a (App.jsx:20203-20205); `PARTNER_PREFIX`/`SYS_FALLBACK` (dozvoljeni izuzeci po pravilima projekta, ali izuzeci).
- Rukom pisane per-osoba migracije umjesto konfiguracije: `20260803_ahmed_full_admin.sql`, `20260724_finance_access.sql`, `20260724_emina_vozni_park.sql`, `20260912_treneri_elma_anela.sql`, `20260802_mustafa_employment_start_fix.sql` (imena u nazivima fajlova migracija).
- E-mail allowlista/role u UI logici opisane u komentarima s imenima (App.jsx:1383, 1396-1415) — u izvještaj ne prenositi identitete, ali mehanizam mora u admin UI.
- `scripts/local-backup.sh` ima apsolutnu putanju korisničkog foldera (`SRC="/Users/kenan/fintrack"`).
- docs/restore-procedura.md sadrži publishable API ključ u curl primjeru (publishable je javan, ali ne bi trebao živjeti u docs-u).

## Poznati problemi / kontradikcije
- **Docs ↔ kod (rezolucija u docs/context/CONFLICTS.md)**: (1) book_payment trigeri opisani kao aktivni u accounting.md/bank-import.md/glavna-knjiga-arhitektura.md — ukinuti 08.09. (`20260908_uplate_sljedivost_bez_automatike.sql`); (2) roles-legacy.md opisuje dvostruko/trostruko računanje prava — od 12.09. `allowed` je jedini izvor; (3) structure.md kaže "~16k linija" — stvarno 24.806; README.md opisuje samo legacy `src/pages` strukturu koja nije aktivna aplikacija (main.jsx montira App.jsx monolit).
- **F5 nije završen**: "Neplaćene fakture" i kartica partnera i dalje mogu odstupati od knjige dok se razlike (duplikat partnera, stare fakture prije početnih stanja) ne razriješe — pod-tab Usklađenost postoji upravo zato (glavna-knjiga-arhitektura.md, status F5 "NA ČEKANJU").
- Migracije `20260720_revenue_targets_hide_from_trener.sql` + isti dan revert; `20260720_workers_employment_period.sql` + revert — historija politika se mijenjala isti dan (šum u migracijama).
- Čišćenja podataka kroz migracije s backup tabelama u produkcijskoj šemi (`*_backup_20260716/20260908/20260917`, `journal_cleanup_monetizead_20260908`, `20260728_merge_monetizead.sql`, `20260908_ciscenje_monetizead_zatvaranja.sql`) — ostaju trajno u bazi.
- `weekly-backup` TABLES lista zaostaje za šemom (vidi Backup sekciju) — novije tabele nisu u sedmičnom exportu.
- Otvorena knjigovodstvena stavka: dvije uplate iz 2024 ("Sravnit iznose", FOM-00007/00010) evidentirane prije reza — čeka knjigovođu (no-auto-posting.md).
- Fail-open admin fallback profila (App.jsx:398-406) i `canEdit` default `"admin"` kad profila nema (App.jsx:9981) — oslanja se na RLS kao stvarnu barijeru.
- CORS `Access-Control-Allow-Origin: *` na većini edge funkcija (autentikacija JWT-om jest tu, ali origin nije sužen; izuzetak employee-portal koji ima origin-allowlistu).
- Dupli semantički modeli prisutnosti: attendance (glavna), `lotto_attendance`, HR `prisutnost` (samo 1 referenca) — tri odvojene evidencije prisustva.
- `VAPID_SUBJECT` fallback u send-push sadrži lični e-mail (send-push/index.ts:22) — mehanizam ok, vrijednost bi trebala biti env-only.

## Funkcije van kontrolnog spiska
- **Uputstva tab** (📖, svi korisnici) s per-permisija filtriranjem sadržaja i "Novo u aplikaciji" feedom (App.jsx:2036; guard test uputstva-permisije.test.js).
- **Odluke** — dnevnik odluka s AI analizom (App.jsx:21484).
- **Lotto** — kompletna paralelna mini-firma evidencija (App.jsx:20199).
- **Otvaranje poslovnice (playbook)** — vođeni proces s fazama/koracima/troškovima/kontaktima (App.jsx:13178).
- **AI Direktor**: jutarnji brifing, chat nad podacima, rizik radar, board report (`ai_briefings`, `admin_reports`, `admin_tasks`).
- **HR most + employee portal** — integracija s odvojenom HR aplikacijom (dva Supabase projekta).
- **Passkey (WebAuthn) prijava** uz TOTP 2FA (App.jsx:653-666).
- **PWA** (manifest + service worker + push).
- **Wake-word glasovni asistent** i **Control Center** za salu za sastanke.
- **Legacy demo**: `src/control/demo-main.jsx`, `src/lib/demo-kartica.js`, `src/pages`/`src/components` (stariji ExpensesPage/ChartsPage… — mrtvi kod za novu aplikaciju).
- **CTOS-Brain proces** — obaveza vođenja sesijskih logova/ADR-ova u vanjskom repou (docs/context/ctos-brain.md) — proces, ne funkcija aplikacije.
- **Fetch-all paginacija** kao infrastrukturni pattern (`src/lib/fetchAll.js` + test) — Supabase limit 1000 redova rješavan svuda ručno/helperski.

---
*Napomena o metodi: sve tvrdnje su provjerene u kodu (App.jsx linije, migracije, edge funkcije); docs/context/*.md korišteni kao mapa, a razlike docs↔kod pobrojane gore. Lični podaci (imena, e-mailovi, UUID-ovi konkretnih osoba) namjerno NISU preneseni — navedeni su samo mehanizmi i lokacije.*
