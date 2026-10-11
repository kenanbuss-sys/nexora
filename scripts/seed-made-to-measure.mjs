#!/usr/bin/env node
/**
 * DEMO GENERATOR — "proizvodnja i montaža po mjeri" (made-to-measure
 * production + installation): sun blinds, awnings, shades, fly screens…
 *
 * The scenario is GENERIC. A real client's identity, branches and price
 * list NEVER live in this repository: they come from a PROFILE file kept
 * in a private folder and passed with --profile (AGENTS.md: no real
 * customer names in generic source, fixtures or demos). Every customer,
 * worker, transaction and amount generated here is invented and marked
 * DEMO.
 *
 * Rules (same as scripts/seed-make-demo.mjs):
 * - REPEATABLE and ADDITIVE: every block checks what exists by stable
 *   codes; a second run never duplicates and never resets anything.
 *   Transaction history is generated only while the tenant has no quotes.
 * - Business actions go ONLY through the domain APIs (validation, ledger,
 *   state machines). The only direct SQL is clearly marked BACKDATING of
 *   timestamps to spread history over N months (skipped without psql).
 * - No external effects (no e-mail, SMS, payments or fiscalisation).
 *
 * Usage:
 *   node scripts/seed-made-to-measure.mjs                       # generic example profile
 *   node scripts/seed-made-to-measure.mjs --profile ~/private/client/profile.json
 *   node scripts/seed-made-to-measure.mjs --profile p.json --pricelist ~/private/client/cjenovnik.xlsx
 * Env: API_URL (default http://localhost:3001), DEV_AUTH_SECRET, DATABASE_URL (backdating only)
 */
import { createHmac, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCsvRows, readXlsxRows, tableObjects } from './lib/xlsx-lite.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const expandHome = (p) =>
  p && p.startsWith('~/') ? resolve(process.env.HOME ?? '', p.slice(2)) : p;

const profilePath = resolve(
  expandHome(arg('--profile')) ?? resolve(HERE, 'profiles/made-to-measure.example.json'),
);
if (!existsSync(profilePath)) {
  console.error(`Profil nije pronađen: ${profilePath}`);
  process.exit(1);
}
const profile = JSON.parse(readFileSync(profilePath, 'utf8'));
const API = process.env.API_URL ?? 'http://localhost:3001';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';
const T = profile.tenant;
const SLUG = T.slug;
const CURRENCY = T.currency ?? 'BAM';
const DAY = 86_400_000;
const REF = profile.demo?.referenceDate
  ? new Date(`${profile.demo.referenceDate}T09:00:00Z`)
  : new Date();

// ------------------------------------------------------------- helpers
let seed = Number(profile.demo?.seed ?? 2026);
const rnd = () => {
  // mulberry32 — deterministic per profile seed
  seed = (seed + 0x6d2b79f5) | 0;
  let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
};
const pick = (list) => list[Math.floor(rnd() * list.length)];
const between = (a, b) => a + Math.floor(rnd() * (b - a + 1));

function sign(claims) {
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const mac = createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${mac}`;
}

async function call(method, path, token, body, { allow = [] } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let json = {};
  try {
    json = await res.json();
  } catch {
    json = {};
  }
  if (!res.ok && json.code !== 'CONFLICT' && !allow.includes(res.status)) {
    throw new Error(`${method} ${path} -> ${res.status}: ${json.message ?? 'error'}`);
  }
  return { status: res.status, ok: res.ok, body: json, conflict: json.code === 'CONFLICT' };
}

const backdate = []; // [table, id, column, isoDate]
const mark = (table, id, column, date) => backdate.push([table, id, column, date.toISOString()]);
const step = (title) => console.log(`\n▸ ${title}`);

const platformToken = sign({ tenantSlug: 'platform', subject: 'ops|root', platformAdmin: true });
console.log(`DEMO po mjeri — tenant "${SLUG}" @ ${API} (profil: ${profilePath})`);

// ------------------------------------------------------------- 1) tenant
step('Tenant');
const tenant = await call('POST', '/api/v1/tenants', platformToken, {
  slug: SLUG,
  name: T.name,
  initialAdmin: {
    email: T.adminEmail ?? `admin@${SLUG}.example`,
    displayName: 'Administrator (DEMO)',
    idpSubject: 'idp|admin',
  },
});
console.log(tenant.conflict ? '- tenant postoji (aditivni nastavak)' : '- tenant provizioniran');
const admin = sign({ tenantSlug: SLUG, subject: 'idp|admin' });

const BASELINE = [
  'organization.read',
  'organization.manage',
  'configuration.read',
  'configuration.publish',
  'iam.user.manage',
  'iam.role.manage',
  'iam.permission.manage',
  'audit.read',
  'task.manage',
  'approval.act',
  'document.read',
  'document.issue',
  'mdm.read',
  'mdm.create',
  'product.read',
  'product.manage',
  'product.publish',
  'inventory.read',
  'inventory.receive',
  'inventory.transfer',
  'inventory.pick',
  'inventory.pack',
  'inventory.count',
  'inventory.adjust',
  'crm.read',
  'crm.manage',
  'pricing.read',
  'pricing.manage',
  'quote.read',
  'quote.create',
  'quote.approve',
  'order.read',
  'order.create',
  'order.confirm',
  'order.hold',
  'order.cancel',
  'order.return',
  'bom.read',
  'bom.manage',
  'bom.release',
  'plan.read',
  'plan.manage',
  'production.read',
  'production.manage',
  'production.execute',
  'finance.read',
  'finance.invoice',
  'finance.pay',
  'finance.manage',
  'finance.ledger.read',
  'finance.ledger.post',
  'analytics.read',
  'hcm.read',
  'hcm.manage',
  'service.read',
  'service.manage',
  'portal.manage',
  'collab.use',
  'search.read',
];
const roles = await call('GET', '/api/v1/roles', admin);
const adminRole = (roles.body.roles ?? []).find((r) => r.name === 'tenant-admin');
if (adminRole) {
  const missing = BASELINE.filter((p) => !adminRole.permissions.includes(p));
  if (missing.length > 0) {
    await call('PUT', `/api/v1/roles/${adminRole.id}/permissions`, admin, {
      permissions: [...new Set([...adminRole.permissions, ...BASELINE])],
    });
    console.log(`- tenant-admin: +${missing.length} permisija`);
  }
}
const users = await call('GET', '/api/v1/users', admin);
const adminUser = (users.body.users ?? []).find(
  (u) => u.email === (T.adminEmail ?? `admin@${SLUG}.example`),
);
if (adminUser && T.adminPassword) {
  await call(
    'POST',
    `/api/v1/users/${adminUser.id}/password`,
    admin,
    { password: T.adminPassword },
    { allow: [400] },
  );
}

// ------------------------------------------------------- 2) organisation
step('Organizacija i poslovnice');
const org = await call('GET', '/api/v1/organization/tree', admin);
let legalEntity = (org.body.legalEntities ?? []).find((e) => e.name === T.legalName);
if (!legalEntity) {
  legalEntity = (
    await call('POST', '/api/v1/organization/legal-entities', admin, {
      name: T.legalName,
      code: 'LE1',
    })
  ).body;
  console.log(`- pravno lice: ${T.legalName}`);
}
const legalEntityId = legalEntity.id;
let unit = (legalEntity.businessUnits ?? []).find((u) => u.name === 'Prodaja i montaža');
if (!unit) {
  unit = (
    await call('POST', '/api/v1/organization/business-units', admin, {
      legalEntityId,
      name: 'Prodaja i montaža',
    })
  ).body;
}
const knownBranches = new Set((unit.branches ?? []).map((b) => b.name));
for (const b of [...profile.branches, profile.wholesale].filter(Boolean)) {
  const name = `${b.name}${b.city ? ` (${b.city})` : ''}`;
  if (knownBranches.has(name)) continue;
  await call(
    'POST',
    '/api/v1/organization/branches',
    admin,
    { businessUnitId: unit.id, name, code: b.code },
    { allow: [400] },
  );
  console.log(`- poslovnica: ${name}`);
}

// ------------------------------------------------------- 3) accounting
step('Knjigovodstvo (konta, PDV)');
const accounts = await call(
  'GET',
  `/api/v1/ledger/accounts?legalEntityId=${legalEntityId}`,
  admin,
  undefined,
  { allow: [400, 404] },
);
const accountByCode = new Map((accounts.body.accounts ?? []).map((a) => [a.code, a.id]));
const ensureAccount = async (code, name) => {
  if (accountByCode.has(code)) return accountByCode.get(code);
  const r = await call('POST', '/api/v1/ledger/accounts', admin, { legalEntityId, code, name });
  accountByCode.set(code, r.body.id);
  return r.body.id;
};
const revenue = await ensureAccount('61000000', 'Prihodi od prodaje proizvoda i usluga');
const vatOut = await ensureAccount('47000000', 'Obaveze za izlazni PDV');
const vatIn = await ensureAccount('27000000', 'Ulazni PDV');
const vatSettle = await ensureAccount('47900000', 'Obračunati PDV');
for (const [roleKey, accountId] of [
  ['vat.output', vatOut],
  ['vat.input', vatIn],
  ['vat.settlement', vatSettle],
]) {
  await call(
    'POST',
    '/api/v1/ledger/system-accounts',
    admin,
    { legalEntityId, roleKey, accountId },
    { allow: [400] },
  );
}
await call('POST', '/api/v1/vat/pack/bih', admin, { legalEntityId }, { allow: [400] });
console.log('- konta + BiH PDV paket');

// ------------------------------------------------------- 4) price list
step('Cjenovnik i artikli');
const PL = profile.priceList ?? {};
const plFile =
  expandHome(arg('--pricelist')) ??
  (PL.file
    ? isAbsolute(expandHome(PL.file))
      ? expandHome(PL.file)
      : resolve(dirname(profilePath), PL.file)
    : null);
if (!plFile || !existsSync(plFile)) {
  console.error(`Cjenovnik nije pronađen: ${plFile}`);
  process.exit(1);
}
const rawRows = plFile.toLowerCase().endsWith('.xlsx')
  ? readXlsxRows(plFile, PL.sheet ?? undefined)
  : readCsvRows(plFile);
const rows = tableObjects(rawRows, PL.headerRow ?? 1);
const col = PL.columns ?? {};
const basisMap = PL.basisMap ?? { m2: 'AREA', m1: 'LENGTH', kom: 'PIECE' };
const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const products = [];
const problems = [];
rows.forEach((r, i) => {
  const code = String(r[col.code] ?? '').trim();
  const name = String(r[col.name] ?? '').trim();
  const basis =
    basisMap[
      String(r[col.basis] ?? '')
        .trim()
        .toLowerCase()
    ];
  const price = num(r[col.price]);
  if (!code && !name) return;
  if (!code || !name || !basis || price === null || price <= 0) {
    problems.push(
      `red ${i + 1 + (PL.headerRow ?? 1)}: ${code || '?'} — ${!basis ? 'nepoznat obračun' : 'nedostaje šifra/naziv/cijena'}`,
    );
    return;
  }
  products.push({
    code: code.replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 40),
    name: name.slice(0, 200),
    group: String(r[col.group] ?? 'Ostalo').trim() || 'Ostalo',
    basis,
    price,
    minBillable: num(r[col.minBillable]) ?? (basis === 'PIECE' ? 0 : 1),
    maxWidthMm: num(r[col.maxWidthMm]),
    maxHeightMm: num(r[col.maxHeightMm]),
  });
});
if (products.length === 0) {
  console.error('Cjenovnik nema nijednu ispravnu stavku. Provjeri "priceList.columns" u profilu.');
  console.error(`Zaglavlja u fajlu: ${Object.keys(rows[0] ?? {}).join(' | ')}`);
  process.exit(1);
}
console.log(
  `- ${products.length} artikala iz ${plFile.split('/').pop()}${problems.length ? ` (${problems.length} preskočeno)` : ''}`,
);
problems.slice(0, 10).forEach((p) => console.log(`  ! ${p}`));

const catalog = await call('GET', '/api/v1/products/search?q=', admin, undefined, { allow: [400] });
const known = new Map((catalog.body.products ?? []).map((p) => [p.code, p]));
const skuIdByCode = new Map();
const wh = await (async () => {
  const list = await call('GET', '/api/v1/warehouses', admin);
  const found = (list.body.warehouses ?? []).find((w) => w.code === 'POGON');
  if (found) return found.id;
  return (
    await call('POST', '/api/v1/warehouses', admin, { code: 'POGON', name: 'Pogon i skladište' })
  ).body.id;
})();
const ensureSku = async (code, name, uom = 'pcs') => {
  let product = known.get(code);
  if (!product) {
    product = (await call('POST', '/api/v1/products', admin, { code, name })).body;
    known.set(code, product);
  }
  const detail = await call('GET', `/api/v1/products/${product.id}`, admin);
  let sku = (detail.body.skus ?? [])[0];
  if (!sku) {
    sku = (
      await call('POST', '/api/v1/skus', admin, {
        productId: product.id,
        code: `${code}-STD`,
        name,
        baseUom: uom,
      })
    ).body;
    await call('POST', `/api/v1/skus/${sku.id}/activate`, admin);
  }
  skuIdByCode.set(code, sku.id);
  return sku.id;
};
for (const p of products) await ensureSku(p.code, p.name);
// One material per product group + BOM and routing so production works.
const materialByGroup = new Map();
for (const group of [...new Set(products.map((p) => p.group))]) {
  const code = `MAT-${
    group
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9]/g, '')
      .toUpperCase()
      .slice(0, 20) || 'OSTALO'
  }`;
  materialByGroup.set(group, await ensureSku(code, `Materijal — ${group}`));
}
// On a re-run engineering may already be switched off (step "moduli");
// re-enable it for setup — the module step at the end disables it again.
await call(
  'PUT',
  '/api/v1/configuration/modules/engineering',
  admin,
  { enabled: true },
  { allow: [400, 404] },
);
const boms = await call('GET', '/api/v1/boms', admin, undefined, { allow: [404] });
const bomSkus = new Set((boms.body.boms ?? []).map((b) => b.skuId));
const routings = await call('GET', '/api/v1/routings', admin, undefined, { allow: [404] });
const routedSkus = new Set((routings.body.routings ?? []).map((r) => r.skuId));
for (const p of products) {
  const skuId = skuIdByCode.get(p.code);
  if (!bomSkus.has(skuId)) {
    const bom = await call('POST', '/api/v1/boms', admin, { skuId });
    await call('POST', `/api/v1/boms/${bom.body.id}/lines`, admin, {
      componentSkuId: materialByGroup.get(p.group),
      quantity: 1,
    });
    await call('POST', `/api/v1/boms/${bom.body.id}/release`, admin);
  }
  if (!routedSkus.has(skuId)) {
    const routing = await call('POST', '/api/v1/routings', admin, { skuId });
    await call('POST', `/api/v1/routings/${routing.body.id}/operations`, admin, {
      name: 'Krojenje i priprema',
      workCenter: 'KROJENJE',
      setupMinutes: 15,
      runMinutesPerUnit: 20,
    });
    await call('POST', `/api/v1/routings/${routing.body.id}/operations`, admin, {
      name: 'Sklapanje',
      workCenter: 'SKLAPANJE',
      runMinutesPerUnit: 35,
    });
    await call('POST', `/api/v1/routings/${routing.body.id}/release`, admin);
  }
}
console.log('- sastavnice + rute (krojenje → sklapanje)');
// Material stock (receipts, idempotent by key).
for (const [group, skuId] of materialByGroup) {
  await call('POST', '/api/v1/stock/movements', admin, {
    warehouseId: wh,
    skuId,
    movementType: 'RECEIPT',
    quantity: 2000,
    idempotencyKey: `demo-mat-${group}`.slice(0, 120).padEnd(8, '0'),
  });
}

const lists = await call('GET', '/api/v1/price-lists', admin);
let priceList = (lists.body.priceLists ?? []).find((l) => l.code === 'MJ');
if (!priceList) {
  priceList = (
    await call('POST', '/api/v1/price-lists', admin, {
      code: 'MJ',
      name: 'Cjenovnik po mjeri',
      currency: CURRENCY,
    })
  ).body;
}
for (const p of products) {
  await call('PUT', `/api/v1/price-lists/${priceList.id}/entries`, admin, {
    skuId: skuIdByCode.get(p.code),
    unitPrice: p.price,
  });
}
if ((priceList.status ?? 'DRAFT') === 'DRAFT') {
  await call('POST', `/api/v1/price-lists/${priceList.id}/publish`, admin, undefined, {
    allow: [400],
  });
}
console.log(`- cjenovnik MJ (${CURRENCY})`);

// ------------------------------------------------------- 5) configuration (merge + publish once)
step('Konfiguracija (po mjeri, PDV, kapacitet, brending)');
const current = await call('GET', '/api/v1/tenant/configuration', admin, undefined, {
  allow: [404],
});
const base = current.body.config ?? {};
const config = {
  ...base,
  branding: {
    ...(base.branding ?? {}),
    name: T.name,
    ...(T.brandColor ? { accentColor: T.brandColor } : {}),
  },
  cpq: {
    ...(base.cpq ?? {}),
    madeToMeasure: {
      products: products.map((p) => ({
        skuCode: `${p.code}-STD`,
        basis: p.basis,
        minBillable: p.minBillable,
        ...(p.maxWidthMm ? { maxWidthMm: p.maxWidthMm } : {}),
        ...(p.maxHeightMm ? { maxHeightMm: p.maxHeightMm } : {}),
      })),
      surcharges: profile.surcharges ?? [],
      tierDiscounts: profile.tierDiscounts ?? {},
      discountInstallation: false,
    },
  },
  fin: {
    ...(base.fin ?? {}),
    autoKif: { legalEntityId, vatRateCode: 'S17', counterAccountId: revenue },
  },
  plan: {
    ...(base.plan ?? {}),
    capacity: [
      { workCenter: 'KROJENJE', minutesPerDay: 960 },
      { workCenter: 'SKLAPANJE', minutesPerDay: 1440 },
    ],
    calendar: { workingDays: [1, 2, 3, 4, 5, 6] },
    promise: { handlingDays: 2, defaultLeadTimeDays: 7 },
  },
  csm: base.csm ?? {},
};
const stable = (v) =>
  Array.isArray(v)
    ? v.map(stable)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, stable(v[k])]),
        )
      : v;
if (JSON.stringify(stable(config)) === JSON.stringify(stable(base))) {
  console.log('- konfiguracija nepromijenjena');
} else {
  await call('POST', '/api/v1/tenant/configuration', admin, { config });
  console.log('- objavljena nova verzija konfiguracije');
}

// ------------------------------------------------------- 6) roles, users, employees, vehicles
step('Uloge, korisnici, zaposleni, vozila');
const ROLE_PERMS = {
  Prodavač: [
    'crm.read',
    'crm.manage',
    'quote.read',
    'quote.create',
    'order.read',
    'order.create',
    'order.confirm',
    'pricing.read',
    'product.read',
    'inventory.read',
    'service.read',
    'service.manage',
    'plan.read',
    'production.read',
    'finance.read',
    'task.manage',
  ],
  Proizvodnja: [
    'production.read',
    'production.manage',
    'production.execute',
    'order.read',
    'inventory.read',
    'inventory.receive',
    'product.read',
    'plan.read',
    'bom.read',
  ],
  Montaža: ['service.read', 'service.manage', 'order.read', 'crm.read'],
  Knjigovodstvo: [
    'finance.read',
    'finance.invoice',
    'finance.ledger.read',
    'finance.ledger.post',
    'order.read',
    'order.confirm',
    'crm.read',
  ],
  Uprava: [
    'analytics.read',
    'crm.read',
    'quote.read',
    'order.read',
    'production.read',
    'service.read',
    'finance.read',
    'finance.pay',
    'plan.read',
    'hcm.read',
  ],
};
const roleList = (await call('GET', '/api/v1/roles', admin)).body.roles ?? [];
const roleIds = {};
for (const [name, permissions] of Object.entries(ROLE_PERMS)) {
  let role = roleList.find((r) => r.name === name);
  if (!role) role = (await call('POST', '/api/v1/roles', admin, { name, permissions })).body;
  else if ([...role.permissions].sort().join() !== [...permissions].sort().join()) {
    await call('PUT', `/api/v1/roles/${role.id}/permissions`, admin, { permissions });
    console.log(`- uloga ${name}: prava usklađena s profilom`);
  }
  roleIds[name] = role.id;
}
const userList = (await call('GET', '/api/v1/users', admin)).body.users ?? [];
const ROLE_USERS = [
  ['prodaja', 'Prodavač', 'Prodavač DEMO'],
  ['proizvodnja', 'Proizvodnja', 'Šef proizvodnje DEMO'],
  ['montaza', 'Montaža', 'Vođa montaže DEMO'],
  ['knjigovodstvo', 'Knjigovodstvo', 'Knjigovođa DEMO'],
  ['uprava', 'Uprava', 'Direktor DEMO'],
];
for (const [key, roleName, displayName] of ROLE_USERS) {
  const email = `${key}@${SLUG}.example`;
  let user = userList.find((u) => u.email === email);
  if (!user) {
    user = (
      await call('POST', '/api/v1/users/invite', admin, {
        email,
        displayName,
        idpSubject: `idp|${key}`,
      })
    ).body;
    await call(
      'POST',
      `/api/v1/users/${user.id}/password`,
      admin,
      { password: `demo-${key}` },
      { allow: [400] },
    );
    console.log(`- korisnik ${email} (uloga ${roleName}, lozinka demo-${key})`);
  }
  // Every pass: (re)assign; a refusal (e.g. segregation of duties) is loud.
  const assigned = await call(
    'POST',
    '/api/v1/roles/assign',
    admin,
    { userId: user.id, roleId: roleIds[roleName] },
    { allow: [400] },
  );
  if (!assigned.ok && !/already/i.test(assigned.body.message ?? '')) {
    console.warn(`! ${email}: uloga ${roleName} NIJE dodijeljena — ${assigned.body.message}`);
  }
}

const FIRST = [
  'Amar',
  'Emir',
  'Haris',
  'Jasmin',
  'Kenan',
  'Mirza',
  'Nermin',
  'Senad',
  'Tarik',
  'Adnan',
  'Edin',
  'Dino',
  'Lejla',
  'Amra',
  'Selma',
  'Ajla',
  'Merima',
  'Azra',
];
const LAST = [
  'Hodžić',
  'Mehić',
  'Begić',
  'Kovačević',
  'Hasić',
  'Delić',
  'Salkić',
  'Omerović',
  'Husić',
  'Karić',
  'Alić',
  'Mujić',
  'Softić',
  'Zukić',
];
const employees = (await call('GET', '/api/v1/employees', admin)).body.employees ?? [];
const employeeByTitle = new Map(employees.map((e) => [e.title, e]));
const installers = [];
const ensureEmployee = async (title) => {
  const existing = employeeByTitle.get(title);
  if (existing) return existing;
  const name = `${pick(FIRST)} ${pick(LAST)} (DEMO)`;
  const e = (await call('POST', '/api/v1/employees', admin, { name, title })).body;
  employeeByTitle.set(title, e);
  return e;
};
for (const b of profile.branches) {
  for (let i = 1; i <= (profile.staff?.perBranch?.prodaja ?? 2); i += 1)
    await ensureEmployee(`Prodaja — ${b.name} #${i}`);
  for (let i = 1; i <= (profile.staff?.perBranch?.montaza ?? 4); i += 1)
    installers.push(await ensureEmployee(`Monter — ${b.name} #${i}`));
}
for (const [dept, count] of Object.entries(profile.staff?.central ?? {})) {
  for (let i = 1; i <= count; i += 1)
    await ensureEmployee(`${dept[0].toUpperCase()}${dept.slice(1)} — centrala #${i}`);
}
if (profile.wholesale) await ensureEmployee(`Prodaja — ${profile.wholesale.name} #1`);
console.log(`- zaposleni: ${employeeByTitle.size} (DEMO)`);
const vehicles = (await call('GET', '/api/v1/logistics/vehicles', admin)).body.vehicles ?? [];
const vehicleIds = [];
for (const v of profile.vehicles ?? []) {
  let found = vehicles.find((x) => x.plate === v.plate);
  if (!found)
    found = (
      await call('POST', '/api/v1/logistics/vehicles', admin, { plate: v.plate, name: v.name })
    ).body;
  vehicleIds.push(found.id);
}
console.log(`- vozila: ${vehicleIds.length}`);

// ------------------------------------------------------- 7) customers + history
step('Kupci i istorija (DEMO)');
const existingQuotes = (await call('GET', '/api/v1/quotes', admin)).body.quotes ?? [];
const COMPANIES = [
  'Gradnja',
  'Stan-Dom',
  'Hotel Panorama',
  'Kafe Centar',
  'Ured Plus',
  'Apartmani Rijeka',
  'Vrtić Sunce',
  'Klinika Med',
  'Trgovina Mali',
  'Pekara Zrno',
  'Auto Servis',
  'Studio Forma',
];
const STREETS = [
  'Ulica Lipa',
  'Bulevar Mira',
  'Ulica Jasmina',
  'Trg Slobode',
  'Ulica Javora',
  'Obala bb',
  'Ulica Kestena',
];
const cities = profile.branches.map((b) => b.city ?? b.name);
const nCustomers = profile.demo?.customers ?? 40;
const nWholesale = profile.demo?.wholesaleCustomers ?? 6;
const months = profile.demo?.months ?? 6;

if (existingQuotes.length > 0) {
  console.log(`- istorija već postoji (${existingQuotes.length} ponuda) — preskačem (aditivno)`);
} else {
  const customers = [];
  for (let i = 1; i <= nCustomers; i += 1) {
    const wholesale = i <= nWholesale;
    const person = !wholesale && rnd() < 0.55;
    const name = wholesale
      ? `DEMO ${pick(['Interijer', 'Dekor', 'Sjena', 'Prozor', 'Fasada'])} ${i} d.o.o. (preprodavač)`
      : person
        ? `DEMO ${pick(FIRST)} ${pick(LAST)}`
        : `DEMO ${pick(COMPANIES)} ${i} d.o.o.`;
    const lead = await call('POST', '/api/v1/crm/leads', admin, {
      name,
      company: name,
      email: `kupac${i}@${SLUG}.example`,
      source: wholesale ? 'veleprodaja' : pick(['preporuka', 'web', 'poslovnica', 'sajam']),
    });
    const accountId = (await call('POST', `/api/v1/crm/leads/${lead.body.id}/convert`, admin, {}))
      .body.accountId;
    const tier = wholesale ? 'VELEPRODAJA' : rnd() < 0.2 ? 'B' : rnd() < 0.3 ? 'A' : null;
    if (tier && profile.tierDiscounts?.[tier] !== undefined) {
      await call('POST', `/api/v1/crm/accounts/${accountId}/price-tier`, admin, {
        priceTier: tier,
      });
    }
    customers.push({ accountId, name, wholesale, city: pick(cities) });
  }
  console.log(`- ${customers.length} kupaca (${nWholesale} veleprodaja)`);

  const installSurcharges = (profile.surcharges ?? [])
    .filter((s) => s.installation)
    .map((s) => s.code);
  const extraSurcharges = (profile.surcharges ?? []).filter(
    (s) => !s.installation && !s.skuCodes?.length,
  );
  const stats = { quotes: 0, orders: 0, invoices: 0, installs: 0, upcoming: 0, fulfilled: 0 };
  const crewPairs = [];
  for (let i = 0; i + 1 < installers.length; i += 2)
    crewPairs.push([installers[i].id, installers[i + 1].id]);
  let slotCursor = 0;

  /** Release → start → every operation in sequence → complete. */
  async function finishWorkOrder(id) {
    await call('POST', `/api/v1/work-orders/${id}/release`, admin, undefined, {
      allow: [400, 409],
    });
    await call('POST', `/api/v1/work-orders/${id}/start`, admin, undefined, { allow: [400, 409] });
    const wo = (await call('GET', `/api/v1/work-orders/${id}`, admin)).body;
    for (const op of [...(wo.operations ?? [])].sort((a, b) => a.seq - b.seq)) {
      if (op.status !== 'DONE')
        await call('POST', `/api/v1/work-orders/${id}/operations/${op.id}/complete`, admin);
    }
    await call('POST', `/api/v1/work-orders/${id}/complete`, admin, {
      goodQuantity: Number(wo.quantity),
    });
  }

  async function scheduleInstall(visitId, day) {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const pair = crewPairs[(slotCursor + attempt) % crewPairs.length];
      const vehicle = vehicleIds.length
        ? vehicleIds[(slotCursor + attempt) % vehicleIds.length]
        : undefined;
      let date = new Date(day.getTime() + Math.floor(attempt / 2) * DAY);
      if (date.getUTCDay() === 0) date = new Date(date.getTime() + DAY); // no Sunday work
      const startHour = attempt % 2 === 0 ? 8 : 13;
      const s = new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), startHour - 2),
      );
      const e = new Date(s.getTime() + 4 * 3600_000);
      const r = await call(
        'POST',
        `/api/v1/service/visits/${visitId}/schedule`,
        admin,
        {
          slotStart: s.toISOString(),
          slotEnd: e.toISOString(),
          crewEmployeeIds: pair,
          ...(vehicle ? { vehicleId: vehicle } : {}),
        },
        { allow: [409] },
      );
      if (r.ok) {
        slotCursor += 1;
        return s;
      }
    }
    return null;
  }

  for (const [ci, c] of customers.entries()) {
    const quotesFor = c.wholesale ? 3 : between(1, 2);
    for (let q = 0; q < quotesFor; q += 1) {
      // Age in days spread over the window; the stage follows the age.
      // Skewed towards recent work so every stage is populated today.
      const age = Math.floor(rnd() ** 1.8 * months * 30);
      const created = new Date(REF.getTime() - age * DAY);
      const quote = (
        await call('POST', '/api/v1/quotes', admin, {
          accountId: c.accountId,
          priceListId: priceList.id,
        })
      ).body;
      mark('quote', quote.id, 'created_at', created);
      stats.quotes += 1;
      const lines = between(1, c.wholesale ? 6 : 3);
      for (let l = 0; l < lines; l += 1) {
        const p = pick(products);
        const width = p.maxWidthMm
          ? between(600, Math.min(p.maxWidthMm, 4000))
          : between(800, 2500);
        const height =
          p.basis === 'AREA'
            ? p.maxHeightMm
              ? between(600, Math.min(p.maxHeightMm, 3000))
              : between(800, 2400)
            : undefined;
        const surcharges = [];
        if (extraSurcharges.length && rnd() < 0.35) surcharges.push(pick(extraSurcharges).code);
        if (!c.wholesale && installSurcharges.length) surcharges.push(installSurcharges[0]);
        await call(
          'POST',
          `/api/v1/quotes/${quote.id}/measured-lines`,
          admin,
          {
            skuId: skuIdByCode.get(p.code),
            widthMm: Math.round(width / 10) * 10,
            ...(height ? { heightMm: Math.round(height / 10) * 10 } : {}),
            pieces: between(1, c.wholesale ? 12 : 4),
            surchargeCodes: [...new Set(surcharges)],
            note: pick([
              'Dnevni boravak',
              'Spavaća soba',
              'Kuhinja',
              'Kancelarija',
              'Terasa',
              'Izlog',
              'Hodnik',
            ]),
          },
          { allow: [400] },
        );
      }
      // Stage by age: very recent quotes stay open; some are lost.
      if (age < 4 && rnd() < 0.6) continue; // DRAFT
      await call('POST', `/api/v1/quotes/${quote.id}/submit`, admin, undefined, {
        allow: [400, 409],
      });
      await call('POST', `/api/v1/quotes/${quote.id}/send`, admin, undefined, {
        allow: [400, 409],
      });
      if (age < 10 && rnd() < 0.3) continue; // SENT
      if (rnd() < 0.18) {
        await call('POST', `/api/v1/quotes/${quote.id}/reject`, admin, undefined, {
          allow: [400, 409],
        });
        continue;
      }
      const accepted = await call('POST', `/api/v1/quotes/${quote.id}/accept`, admin, undefined, {
        allow: [400, 409],
      });
      if (!accepted.ok) continue;
      const order = await call(
        'POST',
        '/api/v1/orders/from-quote',
        admin,
        { quoteId: quote.id, warehouseId: wh },
        { allow: [400, 409] },
      );
      if (!order.ok) continue;
      const orderId = order.body.id;
      mark('sales_order', orderId, 'created_at', new Date(created.getTime() + DAY));
      stats.orders += 1;
      if (rnd() < 0.05) {
        await call('POST', `/api/v1/orders/${orderId}/cancel`, admin, undefined, {
          allow: [400, 409],
        });
        continue;
      }
      await call('POST', `/api/v1/orders/${orderId}/confirm`, admin, { allowBackorder: true });
      if (!c.wholesale || rnd() < 0.3) {
        const adv = await call(
          'POST',
          '/api/v1/finance/invoices/advance',
          admin,
          { orderId, percent: c.wholesale ? 20 : 40, dueInDays: 3 },
          { allow: [400, 409] },
        );
        if (adv.ok) {
          stats.invoices += 1;
          mark('invoice', adv.body.id, 'issued_at', new Date(created.getTime() + DAY));
          if (age > 10)
            await call(
              'POST',
              `/api/v1/finance/invoices/${adv.body.id}/payments`,
              admin,
              { amount: Number(adv.body.total), reference: `DEMO-AV-${ci}-${q}` },
              { allow: [400, 409] },
            );
        }
      }
      if (age < 3) continue; // confirmed, waiting for production
      const made = await call(
        'POST',
        '/api/v1/work-orders/from-order',
        admin,
        { orderId },
        { allow: [400, 409] },
      );
      const wos = made.body.created ?? [];
      for (const wo of wos)
        mark('work_order', wo.id, 'created_at', new Date(created.getTime() + 2 * DAY));
      if (age < 14) {
        // in production: some planned, most released, about half running
        for (const wo of wos) {
          if (rnd() < 0.25) continue;
          await call('POST', `/api/v1/work-orders/${wo.id}/release`, admin, undefined, {
            allow: [400, 409],
          });
          if (rnd() < 0.55)
            await call('POST', `/api/v1/work-orders/${wo.id}/start`, admin, undefined, {
              allow: [400, 409],
            });
        }
        continue;
      }
      for (const wo of wos) await finishWorkOrder(wo.id);
      await call('POST', `/api/v1/orders/${orderId}/release-backorders`, admin, undefined, {
        allow: [400, 409],
      });
      if (c.wholesale) {
        // wholesale: shipped, no installation
        await call('POST', `/api/v1/orders/${orderId}/fulfill`, admin);
        stats.fulfilled += 1;
        if (age > 12) {
          const inv = await call('POST', '/api/v1/finance/invoices/customer', admin, {
            orderId,
            dueInDays: 30,
          });
          stats.invoices += 1;
          mark('invoice', inv.body.id, 'issued_at', new Date(created.getTime() + 12 * DAY));
          if (age > 45)
            await call('POST', `/api/v1/finance/invoices/${inv.body.id}/payments`, admin, {
              amount: Number(inv.body.total),
              reference: `DEMO-VP-${ci}-${q}`,
            });
        }
        continue;
      }
      const visit = await call('POST', '/api/v1/service/visits/installations', admin, {
        salesOrderId: orderId,
        siteAddress: `${pick(STREETS)} ${between(1, 120)}, ${c.city}`,
      });
      // Produced in the last ~3 weeks: installation still ahead (some wait
      // for a slot); older: installed, delivered and invoiced.
      if (age < 35) {
        if (rnd() < 0.2) continue; // "bez termina"
        const when = await scheduleInstall(
          visit.body.id,
          new Date(REF.getTime() + between(1, 6) * DAY),
        );
        if (when) stats.upcoming += 1;
        continue;
      }
      const when = await scheduleInstall(visit.body.id, new Date(created.getTime() + 12 * DAY));
      if (!when) continue;
      await call('POST', `/api/v1/service/orders/${visit.body.id}/start`, admin);
      await call('POST', `/api/v1/service/orders/${visit.body.id}/complete`, admin, {
        report: 'Montaža završena, kupac preuzeo (DEMO).',
      });
      stats.installs += 1;
      await call('POST', `/api/v1/orders/${orderId}/fulfill`, admin);
      stats.fulfilled += 1;
      const inv = await call('POST', '/api/v1/finance/invoices/customer', admin, {
        orderId,
        dueInDays: 8,
      });
      stats.invoices += 1;
      mark('invoice', inv.body.id, 'issued_at', when);
      if (age > 30 && rnd() < 0.85) {
        await call('POST', `/api/v1/finance/invoices/${inv.body.id}/payments`, admin, {
          amount: Number(inv.body.total),
          reference: `DEMO-KON-${ci}-${q}`,
        });
      }
    }
    if ((ci + 1) % 10 === 0) console.log(`  … ${ci + 1}/${customers.length} kupaca`);
  }
  // Site measurements this week for some recent prospects.
  for (const c of customers.filter((x) => !x.wholesale).slice(0, 6)) {
    const m = await call('POST', '/api/v1/service/visits/measurements', admin, {
      accountId: c.accountId,
      siteAddress: `${pick(STREETS)} ${between(1, 80)}, ${c.city}`,
    });
    let day = new Date(REF.getTime() + between(1, 5) * DAY);
    if (day.getUTCDay() === 0) day = new Date(day.getTime() + DAY);
    const s = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 15));
    await call(
      'POST',
      `/api/v1/service/visits/${m.body.id}/schedule`,
      admin,
      {
        slotStart: s.toISOString(),
        slotEnd: new Date(s.getTime() + 3600_000).toISOString(),
        crewEmployeeIds: [installers[between(0, installers.length - 1)].id],
      },
      { allow: [409] },
    );
  }
  console.log(
    `- ponude ${stats.quotes}, narudžbe ${stats.orders} (isporučeno ${stats.fulfilled}), fakture ${stats.invoices}, montaže završene ${stats.installs} / zakazane ${stats.upcoming}, mjerenja 6`,
  );
}

// ------------------------------------------------------- 8) modules
step('Moduli (samo njihov posao)');
for (const key of profile.modules?.disable ?? []) {
  await call(
    'PUT',
    `/api/v1/configuration/modules/${key}`,
    admin,
    { enabled: false },
    { allow: [400, 404] },
  );
}
console.log(`- isključeno: ${(profile.modules?.disable ?? []).join(', ') || '—'}`);

// ------------------------------------------------------- 9) BACKDATING (timestamps only)
if (backdate.length > 0 && process.env.DATABASE_URL) {
  step('BACKDATING vremenskih kolona (samo datumi, bez iznosa/statusa)');
  const allowed = {
    quote: ['created_at'],
    sales_order: ['created_at'],
    invoice: ['issued_at'],
    work_order: ['created_at'],
  };
  const sql = backdate
    .filter(([t, , c]) => allowed[t]?.includes(c))
    .map(
      ([t, id, c, d]) =>
        `UPDATE "${t}" SET "${c}" = '${d}' WHERE id = '${id.replace(/[^0-9a-f-]/gi, '')}';`,
    )
    .join('\n');
  try {
    execFileSync('psql', [process.env.DATABASE_URL, '-q', '-v', 'ON_ERROR_STOP=1'], {
      input: `BEGIN;\n${sql}\nCOMMIT;\n`,
    });
    console.log(`- ${backdate.length} datuma raspoređeno kroz ${months} mjeseci`);
  } catch (e) {
    console.log(`- (backdating preskočen: ${e.message.split('\n')[0]})`);
  }
}

console.log(
  `\nGotovo. Prijava: tenant "${SLUG}", korisnici *@${SLUG}.example (lozinke demo-<uloga>), admin ${T.adminEmail ?? `admin@${SLUG}.example`}.`,
);
void randomUUID;
