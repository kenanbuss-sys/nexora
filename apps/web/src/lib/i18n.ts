/**
 * Lightweight UI language layer (CORE-005): the interface is authored in
 * English; a display-time dictionary renders it in Bosnian when the
 * person prefers. Business data (names, numbers, codes) is never
 * translated — only the product's own chrome.
 */

export type UiLanguage = 'en' | 'bs';

export const LANGUAGE_KEY = 'nexora.lang';

export function getLanguage(): UiLanguage {
  try {
    return window.localStorage.getItem(LANGUAGE_KEY) === 'bs' ? 'bs' : 'en';
  } catch {
    return 'en';
  }
}

export function setLanguage(lang: UiLanguage): void {
  try {
    window.localStorage.setItem(LANGUAGE_KEY, lang);
  } catch {
    // Preference storage is a convenience only.
  }
}

/** English source → Bosnian. Exact match on trimmed text. */
export const BS: Record<string, string> = {
  // Navigation
  Dashboard: 'Kontrolna tabla',
  Tasks: 'Zadaci',
  Sales: 'Prodaja',
  Quotes: 'Ponude',
  Orders: 'Narudžbe',
  Procurement: 'Nabava',
  Engineering: 'Inženjering',
  Planning: 'Planiranje',
  Production: 'Proizvodnja',
  Quality: 'Kvalitet',
  Finance: 'Finansije',
  Analytics: 'Analitika',
  Integrations: 'Integracije',
  Portal: 'Portal',
  Parties: 'Partneri',
  Catalog: 'Katalog',
  Inventory: 'Zalihe',
  Operations: 'Operacije',
  Devices: 'Uređaji',
  'Users & roles': 'Korisnici i uloge',
  Platform: 'Platforma',
  'Sign out': 'Odjava',
  'Search everything…': 'Pretraži sve…',
  'No matches.': 'Nema rezultata.',
  'Loading workspace…': 'Učitavanje radnog prostora…',
  tenant: 'tenant',

  // Common actions
  'Sign in': 'Prijava',
  'Signing in…': 'Prijavljivanje…',
  'Quick sign in': 'Brza prijava',
  'One click — no credentials to remember.': 'Jedan klik — bez pamćenja pristupnih podataka.',
  'Administrator (demo)': 'Administrator (demo)',
  'Full back office of the demo company': 'Kompletan back office demo firme',
  'Platform operator': 'Platform operator',
  'Provision tenants, usage overview': 'Kreiranje tenanata, pregled korištenja',
  'Advanced sign in (other identity)': 'Napredna prijava (drugi identitet)',
  Tenant: 'Tenant',
  'Identity subject': 'Identitet (subject)',
  'Email (optional)': 'Email (opciono)',
  'Platform operator (tenant provisioning)': 'Platform operator (kreiranje tenanata)',
  Create: 'Kreiraj',
  Cancel: 'Otkaži',
  Confirm: 'Potvrdi',
  'Confirm + backorder': 'Potvrdi + backorder',
  'Release backorders': 'Oslobodi backordere',
  Fulfill: 'Isporuči',
  Hold: 'Zadrži',
  Release: 'Oslobodi',
  History: 'Historija',
  'Hide history': 'Sakrij historiju',
  Discussion: 'Diskusija',
  'Hide discussion': 'Sakrij diskusiju',
  Amend: 'Izmijeni',
  'Add line': 'Dodaj stavku',
  'New order': 'Nova narudžba',
  Account: 'Kupac',
  Warehouse: 'Skladište',
  Currency: 'Valuta',
  Comment: 'Komentiraj',
  Attach: 'Priloži',
  'Write a comment…': 'Napiši komentar…',
  Search: 'Pretraga',
  'Search…': 'Pretraga…',
  Save: 'Sačuvaj',
  'Save profile': 'Sačuvaj profil',
  Delete: 'Obriši',
  Edit: 'Uredi',
  Close: 'Zatvori',
  PDF: 'PDF',
  'Delivery note PDF': 'Otpremnica PDF',
  Activate: 'Aktiviraj',
  Disable: 'Deaktiviraj',
  Revoke: 'Opozovi',
  Convert: 'Konvertuj',
  Drop: 'Odbaci',
  'Process now': 'Pokreni sada',
  'Create subscription': 'Kreiraj pretplatu',
  'Create key': 'Kreiraj ključ',
  'Export tenant data (JSON)': 'Izvezi podatke tenanta (JSON)',
  'Post movement': 'Proknjiži kretanje',
  'Reserve stock': 'Rezerviši zalihe',
  'Open account': 'Otvori account',
  'Bind portal user': 'Poveži portal korisnika',
  'Track progress': 'Prati napredak',
  'Hide progress': 'Sakrij napredak',
  'Lot policy': 'Politika lotova',
  'Set budget': 'Postavi budžet',
  'Add cost center': 'Dodaj troškovni centar',
  'Record payment': 'Evidentiraj uplatu',
  'Pay in full': 'Plati u cijelosti',
  'Provision tenant': 'Kreiraj tenanta',
  'Provisioning…': 'Kreiranje…',
  'Creating…': 'Kreiranje…',
  'Create product': 'Kreiraj proizvod',
  Discontinue: 'Ukini',
  '360°': '360°',
  'Close 360°': 'Zatvori 360°',

  // Section titles
  'Customer portal': 'Portal za kupce',
  Leads: 'Leadovi',
  Accounts: 'Kupci (accounti)',
  Opportunities: 'Prilike',
  Products: 'Proizvodi',
  'New product': 'Novi proizvod',
  Invoices: 'Fakture',
  'Issue invoices': 'Izdavanje faktura',
  Aging: 'Dospijeće (aging)',
  'Cash flow (6 months)': 'Novčani tok (6 mjeseci)',
  'Cost centers & budgets': 'Troškovni centri i budžeti',
  Margin: 'Marža',
  'My orders': 'Moje narudžbe',
  'My invoices': 'Moje fakture',
  'Portal access (back office)': 'Portal pristup (back office)',
  Subscriptions: 'Pretplate',
  'Delivery history': 'Historija isporuka',
  'API keys (service accounts)': 'API ključevi (servisni računi)',
  'Security log': 'Sigurnosni log',
  'Tenant usage (OPS-014)': 'Korištenje po tenantu (OPS-014)',
  'New tenant': 'Novi tenant',
  'Tenant created': 'Tenant kreiran',
  'Recent orders': 'Zadnje narudžbe',
  'Latest activity': 'Zadnje aktivnosti',
  Users: 'Korisnici',
  Roles: 'Uloge',
  'Platform operations': 'Platformske operacije',

  // Labels
  Type: 'Tip',
  Quantity: 'Količina',
  'Reason (optional)': 'Razlog (opciono)',
  'Reference (optional)': 'Referenca (opciono)',
  'Lot (required for lot-tracked SKUs on receipt)': 'Lot (obavezan za lot-praćene artikle)',
  Status: 'Status',
  Company: 'Firma',
  Invoiced: 'Fakturisano',
  Paid: 'Plaćeno',
  'Open balance': 'Otvoreni saldo',
  'Credit limit': 'Kreditni limit',
  'Available credit': 'Raspoloživi kredit',
  'Credit hold': 'Kreditna blokada',
  'Tags (comma-separated)': 'Tagovi (zarezom odvojeni)',
  Revenue: 'Prihod',
  Expenses: 'Rashodi',
  'Gross result': 'Bruto rezultat',
  'Open AR / AP': 'Otvorena potraživanja / obaveze',
  'Total open:': 'Ukupno otvoreno:',
  'Not due': 'Nije dospjelo',
  '1–30 days': '1–30 dana',
  '31–60 days': '31–60 dana',
  '61–90 days': '61–90 dana',
  '90+ days': '90+ dana',
  'On hand': 'Na stanju',
  Reserved: 'Rezervisano',
  Available: 'Raspoloživo',
  Code: 'Šifra',
  Name: 'Naziv',
  'Base UoM': 'Osnovna JM',
  'Key name': 'Naziv ključa',
  'Slug (URL-safe identifier)': 'Slug (identifikator za URL)',
  'Display name': 'Prikazano ime',
  Email: 'Email',
  'Initial administrator (optional)': 'Početni administrator (opciono)',
  'Identity subject (dev mode sign-in)': 'Identitet (dev prijava)',
  'Period (YYYY-MM)': 'Period (GGGG-MM)',
  'Lots (FEFO — issues consume the earliest expiry first)':
    'Lotovi (FEFO — izdaje se prvo najraniji rok)',

  // Statuses / badges
  DRAFT: 'NACRT',
  CONFIRMED: 'POTVRĐENO',
  ON_HOLD: 'NA ČEKANJU',
  'ON HOLD': 'NA ČEKANJU',
  FULFILLED: 'ISPORUČENO',
  CANCELLED: 'OTKAZANO',
  OPEN: 'OTVORENO',
  'PARTIALLY PAID': 'DJELIMIČNO PLAĆENO',
  PAID: 'PLAĆENO',
  ACTIVE: 'AKTIVAN',
  DISABLED: 'DEAKTIVIRAN',
  REVOKED: 'OPOZVAN',
  INVITED: 'POZVAN',
  SUSPENDED: 'SUSPENDOVAN',
  NEW: 'NOVO',
  QUALIFIED: 'KVALIFIKOVAN',
  CONVERTED: 'KONVERTOVAN',
  DISQUALIFIED: 'DISKVALIFIKOVAN',
  PUBLISHED: 'OBJAVLJEN',
  ARCHIVED: 'ARHIVIRAN',
  PENDING: 'NA ČEKANJU',
  DELIVERED: 'ISPORUČENO',
  FAILED: 'NEUSPJEŠNO',
  DEAD: 'MRTVO',
  EXPIRED: 'ISTEKLO',
  reserved: 'rezervisano',
  backorder: 'backorder',
  'CREDIT HOLD': 'KREDITNA BLOKADA',

  // Empty / loading states
  'Loading…': 'Učitavanje…',
  'Loading aging…': 'Učitavanje dospijeća…',
  'Loading accounts…': 'Učitavanje kupaca…',
  'Loading leads…': 'Učitavanje leadova…',
  'Loading catalog…': 'Učitavanje kataloga…',
  'Loading your workspace…': 'Učitavanje tvog radnog prostora…',
  'No orders yet.': 'Još nema narudžbi.',
  'No invoices yet.': 'Još nema faktura.',
  'No leads yet.': 'Još nema leadova.',
  'No customer accounts yet.': 'Još nema kupaca.',
  'No products found.': 'Nema pronađenih proizvoda.',
  'No matches found.': 'Nema rezultata.',
  'No activities logged.': 'Nema zabilježenih aktivnosti.',
  'No budgets for this period yet.': 'Još nema budžeta za ovaj period.',
  'No matched payments yet.': 'Još nema uparenih uplata.',
  'No webhook subscriptions yet.': 'Još nema webhook pretplata.',
  'No deliveries yet.': 'Još nema isporuka.',
  'No API keys yet.': 'Još nema API ključeva.',
  'No security events yet.': 'Još nema sigurnosnih događaja.',
  'No portal users yet.': 'Još nema portal korisnika.',
  'No tenants yet.': 'Još nema tenanata.',
  'No warehouses yet — create one below.': 'Još nema skladišta — kreiraj ga ispod.',

  // Page subtitles
  'Canonical sales orders — confirmation reserves warehouse stock; fulfillment issues it from the ledger; cancellation releases it back.':
    'Prodajne narudžbe — potvrda rezerviše zalihe; isporuka ih knjiži iz ledgera; otkazivanje ih vraća.',
  'Leads, customer accounts and the opportunity pipeline.':
    'Leadovi, kupci i pipeline prodajnih prilika.',
  'Ledger-driven stock: every change is an immutable movement; positions are derived.':
    'Zalihe vođene ledgerom: svaka promjena je nepromjenjivo kretanje; stanja se izvode.',
  'Receivables from fulfilled orders, payables from received purchase orders, matched payments and live margin — an operational P&L, not a general ledger.':
    'Potraživanja iz isporučenih narudžbi, obaveze iz prijema robe, uparene uplate i živa marža — operativni P&L.',
  'Products and sellable SKUs (product information management).':
    'Proizvodi i prodajni artikli (upravljanje matičnim podacima).',
  'Access is default-deny: a user can do only what their roles explicitly grant.':
    'Pristup je podrazumijevano zabranjen: korisnik može samo ono što mu uloge izričito dozvole.',
  'Outbound webhooks — signed deliveries with retries, dead-lettering and full run history. Point external systems at your events without polling.':
    'Izlazni webhookovi — potpisane isporuke s ponavljanjima, dead-letterom i punom historijom.',
  'Self-service for customer companies — orders, production milestones, invoices and balance, scoped server-side to their own account.':
    'Samousluga za kupce — narudžbe, tok proizvodnje, fakture i saldo, ograničeno na vlastiti account.',
  'Provision new tenants. Each tenant is isolated from every other.':
    'Kreiranje novih tenanata. Svaki tenant je izolovan od ostalih.',

  // Misc
  Language: 'Jezik',
  'Stock counts': 'Inventure (popisi)',
  'New count': 'Nova inventura',
  'Post variances': 'Proknjiži razlike',
  'Record selected SKU': 'Upiši za odabrani artikal',
  'No stock counts yet.': 'Još nema inventura.',
  POSTED: 'PROKNJIŽENO',
  'Supplier performance': 'Performanse dobavljača',
  Supplier: 'Dobavljač',
  Spend: 'Potrošnja',
  'Fill rate': 'Stopa ispunjenja',
  'Avg. receipt time': 'Prosj. vrijeme prijema',
  '→ Requisition': '→ Trebovanje',
  'Request return': 'Zahtjev za povrat',
  'Returns (RMA)': 'Povrati (RMA)',
  Approve: 'Odobri',
  Reject: 'Odbij',
  'Receive goods': 'Zaprimi robu',
  REQUESTED: 'ZAHTIJEVANO',
  APPROVED: 'ODOBRENO',
  REJECTED: 'ODBIJENO',
  CLOSED: 'ZATVORENO',
  'Revenue (invoiced)': 'Prihod (fakturisano)',
  'Open receivables': 'Otvorena potraživanja',
  'Open orders': 'Otvorene narudžbe',
  'Quote pipeline': 'Pipeline ponuda',
  'Work in progress': 'U proizvodnji',
  'Open NCRs': 'Otvoreni NCR-ovi',
  'Scrap rate': 'Stopa škarta',
  'Open payables': 'Otvorene obaveze',
  'My tasks': 'Moji zadaci',
  Notifications: 'Obavještenja',
  'Nothing waiting on you.': 'Ništa ne čeka na tebe.',
  'All caught up.': 'Sve je pregledano.',
  'All tasks →': 'Svi zadaci →',
  Merchandising: 'Merchandising',
  'New category': 'Nova kategorija',
  'Generate variants': 'Generiši varijante',
  'Assign to category…': 'Dodijeli kategoriji…',
  'Variant generator — one SKU per combination (e.g. color × size).':
    'Generator varijanti — jedan artikal po kombinaciji (npr. boja × veličina).',
  'Shop floor': 'Pogon',
  'All work orders': 'Svi radni nalozi',
  '← All work orders': '← Svi radni nalozi',
  'No released work orders. Enjoy the quiet.': 'Nema puštenih radnih naloga. Uživaj u miru.',
  'Finish work order': 'Završi radni nalog',
  'Good quantity': 'Dobra količina',
  Scrap: 'Škart',
  waiting: 'čeka',
  'IN PROGRESS': 'U TOKU',
  RELEASED: 'PUŠTEN',
  PAUSED: 'PAUZIRAN',
  COMPLETED: 'ZAVRŠEN',
  PLANNED: 'PLANIRAN',
  'Signing secret (shown once — store it now):': 'Tajna za potpis (samo jednom — sačuvaj je):',
  'Key (shown once — store it now):': 'Ključ (samo jednom — sačuvaj ga):',
};

const BS_REGEX: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
  [
    /^Comments \((\d+)\) · Attachments \((\d+)\)$/,
    (m) => `Komentari (${m[1]}) · Prilozi (${m[2]})`,
  ],
  [/^Continue as (.+)$/, (m) => `Nastavi kao ${m[1]}`],
  [/^(\d+) inv\.$/, (m) => `${m[1]} fak.`],
];

export function translateText(source: string): string {
  const trimmed = source.trim();
  if (!trimmed) return source;
  const direct = BS[trimmed];
  if (direct) return source.replace(trimmed, direct);
  for (const [pattern, replace] of BS_REGEX) {
    const match = trimmed.match(pattern);
    if (match) return source.replace(trimmed, replace(match));
  }
  return source;
}
