#!/usr/bin/env node
/**
 * DEMO GENERATOR — tenant "make": Make Consulting d.o.o. Srebrenik (DEMO).
 *
 * Scenario: arhitektonsko-projektantska firma s koordinacijom izvođenja i
 * opremanja enterijera. Svi podaci su SINTETIČKI i jasno testni (taxId
 * "TEST-…", *.example adrese); ništa ne tvrdi činjenice o stvarnoj firmi.
 * Proizvodnja (recepcijski pult) je označen DODATNI demo scenario.
 *
 * Pravila:
 * - PONOVLJIV i ADITIVAN: svaki blok provjerava postojanje po stabilnim
 *   šiframa; drugo pokretanje ne duplira i ne prepisuje ručne izmjene.
 * - Poslovne radnje idu ISKLJUČIVO kroz domenske API-je (validacije,
 *   ledger, statusne mašine) — nikad direktnim upisom statusa.
 * - Jedini direktni SQL je jasno označeno BACKDATING vremenskih kolona
 *   (created_at/occurred_at) za višemjesečnu historiju — iznosi, statusi
 *   i veze ostaju netaknuti. Preskače se ako psql nije dostupan.
 * - Bez eksternih efekata (email/SMS/plaćanja/fiskalizacija).
 *
 * Usage:  node scripts/seed-make-demo.mjs      (API na :3001)
 * Env:    API_URL, DEV_AUTH_SECRET, DATABASE_URL (samo za backdating)
 */
import { createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const API = process.env.API_URL ?? 'http://localhost:3001';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';
const SLUG = 'make';
/** Fiksni referentni datum demo-a — sve relativne "starosti" računaju se od njega. */
const REF_DATE = '2026-09-15';

function sign(claims) {
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const mac = createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${mac}`;
}

async function call(method, path, token, body) {
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
  if (!res.ok && json.code !== 'CONFLICT') {
    throw new Error(`${method} ${path} -> ${res.status}: ${json.message ?? 'error'}`);
  }
  return { status: res.status, body: json, conflict: json.code === 'CONFLICT' };
}

const platformToken = sign({ tenantSlug: 'platform', subject: 'ops|root', platformAdmin: true });
console.log(`MAKE demo generator — tenant "${SLUG}" @ ${API} (ref datum ${REF_DATE})`);

// ---------------------------------------------------------------- 1) tenant
const tenant = await call('POST', '/api/v1/tenants', platformToken, {
  slug: SLUG,
  name: 'Make Consulting d.o.o. Srebrenik (DEMO)',
  initialAdmin: {
    email: 'admin@make.example',
    displayName: 'Demo Administrator',
    idpSubject: 'idp|admin',
  },
});
console.log(tenant.conflict ? '- tenant postoji' : '- tenant provizioniran');
const admin = sign({ tenantSlug: SLUG, subject: 'idp|admin' });

if (!tenant.conflict) {
  try {
    const users = await call('GET', '/api/v1/users', admin);
    const adminUser = (users.body.users ?? []).find((u) => u.email === 'admin@make.example');
    if (adminUser) {
      await call('POST', `/api/v1/users/${adminUser.id}/password`, admin, {
        password: 'make-demo',
      });
      console.log('- admin lozinka postavljena (make-demo)');
    }
  } catch {
    /* dev prijava svakako radi */
  }
}

// tenant-admin baseline (kao seed-demo — da svi moduli budu vidljivi)
const BASELINE = [
  'organization.read','organization.manage','configuration.read','configuration.publish',
  'iam.user.manage','iam.role.manage','iam.permission.manage','iam.session.revoke',
  'iam.security.read','audit.read','task.manage','workflow.read','workflow.design',
  'workflow.publish','workflow.override','approval.act','automation.manage','document.read',
  'document.issue','mdm.read','mdm.create','mdm.merge','mdm.steward','product.read',
  'product.manage','product.barcode.manage','product.publish','inventory.read',
  'inventory.receive','inventory.transfer','inventory.pick','inventory.pack','inventory.count',
  'inventory.adjust','inventory.adjust.approve','device.read','device.enroll','device.assign',
  'device.revoke','device.support','verification.use','verification.override',
  'verification.audit','crm.read','crm.manage','crm.credit.read','crm.customer.approve',
  'pricing.read','pricing.manage','pricing.override','quote.read','quote.create',
  'quote.approve','order.read','order.create','order.confirm','order.hold','order.cancel',
  'purchase.read','purchase.request','purchase.manage','purchase.receive','purchase.approve',
  'bom.read','bom.manage','bom.release','plan.read','plan.manage','production.read',
  'production.manage','production.execute','qc.read','qc.record','qc.approve','qc.manage',
  'finance.read','finance.invoice','finance.pay','analytics.read','analytics.export',
  'hcm.read','hcm.manage','asset.read','asset.manage','portal.manage','finance.manage',
  'order.return','collab.use','integration.read','integration.manage','search.read',
  'project.read','project.manage','finance.ledger.read','finance.ledger.post',
];
try {
  const roles = await call('GET', '/api/v1/roles', admin);
  const adminRole = (roles.body.roles ?? []).find((r) => r.name === 'tenant-admin');
  if (adminRole && adminRole.permissions.length < BASELINE.length) {
    await call('PUT', `/api/v1/roles/${adminRole.id}/permissions`, admin, {
      permissions: BASELINE,
    });
    console.log('- tenant-admin permisije osvježene');
  }
} catch {
  console.log('- (baseline permisije preskočene)');
}

// ------------------------------------------------- 2) brending (samo 1. put)
if (!tenant.conflict) {
  try {
    await call('POST', '/api/v1/tenant/configuration', admin, {
      config: {
        branding: {
          name: 'Make Consulting (DEMO)',
          accentColor: '#0f766e',
          accentColor2: '#f59e0b',
        },
        b2b: { customerApprovalThreshold: 20000 },
      },
    });
    console.log('- brending objavljen (Make Consulting (DEMO), teal/amber)');
  } catch (e) {
    console.log(`- (brending preskočen: ${e.message})`);
  }
}

// ------------------------------------------------------- 3) pravno lice (LE)
try {
  const tree = await call('GET', '/api/v1/organization/tree', admin);
  if ((tree.body.legalEntities ?? []).length === 0) {
    await call('POST', '/api/v1/organization/legal-entities', admin, {
      name: 'Make Consulting d.o.o. (TEST)',
      code: 'MAKE',
    });
    console.log('- pravno lice MAKE');
  }
} catch (e) {
  console.log(`- (LE preskočen: ${e.message})`);
}

// ------------------------------------------------------------- 4) partneri
// Klijenti (sve TEST vrijednosti; adrese .example)
const CLIENTS = [
  ['ORGANIZATION', 'Hotel Panorama TEST d.o.o.', 'uprava@panorama-test.example', 'TEST-4200000000001'],
  ['ORGANIZATION', 'Market Lipa TEST d.o.o.', 'nabava@lipa-test.example', 'TEST-4200000000002'],
  ['ORGANIZATION', 'Tehno Park TEST d.o.o.', 'office@tehnopark-test.example', 'TEST-4200000000003'],
  ['ORGANIZATION', 'Gradska biblioteka TEST', 'direkcija@biblioteka-test.example', 'TEST-4200000000004'],
  ['PERSON', 'Amir Testić (rezidencija)', 'amir@rezidencija-test.example', null],
  ['PERSON', 'Lejla Testović (penthouse)', 'lejla@rezidencija-test.example', null],
];
const preParties = await call('GET', '/api/v1/parties?q=', admin);
const partyNames = new Set((preParties.body.parties ?? []).map((p) => p.name));
for (const [partyType, name, email, taxId] of CLIENTS) {
  if (partyNames.has(name)) continue;
  await call('POST', '/api/v1/parties', admin, {
    partyType,
    name,
    ...(email ? { email } : {}),
    ...(taxId ? { taxId } : {}),
  });
}
console.log(`- ${CLIENTS.length} klijenata (partneri)`);

// ------------------------------------------------------------ 5) katalog
// Oprema enterijera koju firma specificira/isporučuje klijentima.
const CATALOG = [
  ['ST-KONF', 'Konferencijska stolica', [['ST-KONF-CRN', 'Crna tkanina', '3870000000011', 189],['ST-KONF-SIV', 'Siva tkanina', '3870000000028', 189]]],
  ['ST-RAD', 'Radna stolica ergonomska', [['ST-RAD-PRO', 'Pro mrežasta', '3870000000035', 349]]],
  ['STOL-RAD', 'Radni sto podesivi', [['STOL-RAD-160', '160×80 hrast', '3870000000042', 520]]],
  ['STOL-KONF', 'Konferencijski sto', [['STOL-KONF-320', '320×120 orah', '3870000000059', 1450]]],
  ['PAN-AKU', 'Akustični zidni panel', [['PAN-AKU-60', '60×60 filc', '3870000000066', 42]]],
  ['RASVJ-LED', 'LED visilica arhitektonska', [['RASVJ-LED-120', '120cm crna', '3870000000073', 260]]],
  ['POD-HRAST', 'Podna obloga hrast', [['POD-HRAST-M2', 'm² lamela', '3870000000080', 38]]],
  ['REC-PULT', 'Recepcijski pult (DEMO proizvodnja)', [['REC-PULT-STD', 'Standard 240cm', '3870000000097', 3200]]],
  ['PAN-STAK', 'Staklena pregrada', [['PAN-STAK-M2', 'm² kaljeno', '3870000000103', 145]]],
];
const skuByCode = new Map();
for (const [code, name, skus] of CATALOG) {
  const product = await call('POST', '/api/v1/products', admin, { code, name });
  let productId = product.body.id;
  if (product.conflict) {
    const search = await call('GET', `/api/v1/products/search?q=${code}`, admin);
    productId = (search.body.products ?? []).find((p) => p.code === code)?.id;
  } else {
    await call('POST', `/api/v1/products/${productId}/publish`, admin);
  }
  if (!productId) continue;
  const detail = await call('GET', `/api/v1/products/${productId}`, admin);
  const existing = new Map((detail.body.skus ?? []).map((s) => [s.code, s]));
  for (const [skuCode, variant, barcode] of skus) {
    if (existing.has(skuCode)) {
      skuByCode.set(skuCode, existing.get(skuCode));
      continue;
    }
    const sku = await call('POST', '/api/v1/skus', admin, {
      productId,
      code: skuCode,
      name: `${name} — ${variant}`,
      baseUom: skuCode.endsWith('-M2') ? 'm2' : 'pcs',
    });
    if (!sku.conflict) {
      await call('POST', `/api/v1/skus/${sku.body.id}/activate`, admin);
      await call('POST', '/api/v1/barcodes', admin, { skuId: sku.body.id, value: barcode });
      skuByCode.set(skuCode, sku.body);
    }
  }
}
console.log(`- katalog: ${skuByCode.size} SKU-ova`);

// ---------------------------------------------------------- 6) skladišta
await call('POST', '/api/v1/warehouses', admin, { code: 'WH-SRE', name: 'Centralno skladište Srebrenik' });
await call('POST', '/api/v1/warehouses', admin, { code: 'WH-MONT', name: 'Montažni kombi / gradilište' });
const whList = await call('GET', '/api/v1/warehouses', admin);
const WH = (whList.body.warehouses ?? []).find((w) => w.code === 'WH-SRE');

// Početne zalihe — deterministične količine, stabilni idempotency ključevi.
const OPENING = [
  ['ST-KONF-CRN', 120], ['ST-KONF-SIV', 60], ['ST-RAD-PRO', 45], ['STOL-RAD-160', 30],
  ['STOL-KONF-320', 6], ['PAN-AKU-60', 400], ['RASVJ-LED-120', 48], ['POD-HRAST-M2', 850],
  ['PAN-STAK-M2', 220],
];
let opened = 0;
for (const [code, qty] of OPENING) {
  const sku = skuByCode.get(code);
  if (!sku || !WH) continue;
  const r = await call('POST', '/api/v1/stock/movements', admin, {
    warehouseId: WH.id, skuId: sku.id, movementType: 'RECEIPT', quantity: qty,
    idempotencyKey: `make-opening-${code}`, reason: 'Početno stanje (demo)',
  });
  if (!r.conflict) opened += 1;
}
console.log(`- početne zalihe: ${opened} prijema u WH-SRE`);

// ------------------------------------------------------------ 7) cjenovnik
await call('POST', '/api/v1/price-lists', admin, { code: 'MAKE-STD', name: 'Standardni cjenovnik opreme', currency: 'EUR' });
const pls = await call('GET', '/api/v1/price-lists', admin);
const PL = (pls.body.priceLists ?? []).find((l) => l.code === 'MAKE-STD');
if (PL) {
  for (const [, , skus] of CATALOG) {
    for (const [skuCode, , , price] of skus) {
      const sku = skuByCode.get(skuCode);
      if (sku) await call('PUT', `/api/v1/price-lists/${PL.id}/entries`, admin, { skuId: sku.id, unitPrice: price });
    }
  }
  if (PL.status === 'DRAFT') await call('POST', `/api/v1/price-lists/${PL.id}/publish`, admin);
  console.log('- cjenovnik MAKE-STD objavljen');
}

// ------------------------------------------------------------------ 8) CRM
const partiesRes = await call('GET', '/api/v1/parties?q=', admin);
const clientNames = new Set(CLIENTS.map((c) => c[1]));
const orgParties = (partiesRes.body.parties ?? []).filter((p) => clientNames.has(p.name));
const preAccounts = await call('GET', '/api/v1/crm/accounts', admin);
const accountedParties = new Set((preAccounts.body.accounts ?? []).map((a) => a.partyId));
for (const p of orgParties) {
  if (!accountedParties.has(p.id)) await call('POST', '/api/v1/crm/accounts', admin, { partyId: p.id });
}
const accountsRes = await call('GET', '/api/v1/crm/accounts', admin);
const accounts = accountsRes.body.accounts ?? [];
const accountByName = new Map(accounts.map((a) => [a.partyName ?? a.name, a]));
const firstAccount = accounts[0];

// Leadovi: 2 otvorena, 1 konvertovan (samo prvi put — po imenu)
const leadsRes = await call('GET', '/api/v1/crm/leads', admin);
const existingLeads = new Set((leadsRes.body.leads ?? []).map((l) => l.name));
const LEADS = [
  ['Sanela Novi Prostor', 'Novi Prostor TEST d.o.o.', 'sanela@noviprostor-test.example', false],
  ['Damir Hotel Vrelo', 'Hotel Vrelo TEST', 'damir@vrelo-test.example', false],
  ['Emina Salon Ideja', 'Salon Ideja TEST', 'emina@salonideja-test.example', true],
];
for (const [name, company, email, convert] of LEADS) {
  if (existingLeads.has(name)) continue;
  const lead = await call('POST', '/api/v1/crm/leads', admin, { name, company, email, source: 'preporuka' });
  if (convert && lead.body.id) {
    await call('POST', `/api/v1/crm/leads/${lead.body.id}/convert`, admin, { opportunityTitle: 'Uređenje salona — koncept + oprema' });
  }
}
console.log(`- CRM: ${accounts.length} računa, leadovi postavljeni`);

// ------------------------------------------------------------- 9) ponude
const quotesRes = await call('GET', '/api/v1/quotes', admin);
if (PL && firstAccount && (quotesRes.body.quotes ?? []).length < 3) {
  const acc = (name, fb) => accountByName.get(name) ?? fb;
  const mk = async (account, lines, actions) => {
    const q = await call('POST', '/api/v1/quotes', admin, { accountId: account.id, priceListId: PL.id });
    for (const [code, qty] of lines) {
      const sku = skuByCode.get(code);
      if (sku) await call('POST', `/api/v1/quotes/${q.body.id}/lines`, admin, { skuId: sku.id, quantity: qty });
    }
    for (const a of actions) await call('POST', `/api/v1/quotes/${q.body.id}/${a}`, admin, {});
    return q.body;
  };
  // nacrt — oprema biblioteke
  await mk(acc('Gradska biblioteka TEST', firstAccount), [['ST-KONF-SIV', 40], ['PAN-AKU-60', 120]], []);
  // poslana — hotel lobby
  await mk(acc('Hotel Panorama TEST d.o.o.', firstAccount), [['RASVJ-LED-120', 12], ['POD-HRAST-M2', 180], ['PAN-STAK-M2', 40]], ['submit', 'send']);
  // prihvaćena → narudžba (tehno park ured)
  const q3 = await mk(acc('Tehno Park TEST d.o.o.', firstAccount), [['ST-RAD-PRO', 25], ['STOL-RAD-160', 25], ['PAN-AKU-60', 80]], ['submit', 'send', 'accept']);
  if (WH) await call('POST', '/api/v1/orders/from-quote', admin, { quoteId: q3.id, warehouseId: WH.id });
  console.log('- 3 ponude (nacrt / poslana / prihvaćena→narudžba)');
}

// ----------------------------------------------------------- 10) narudžbe
// Višemjesečna historija: 7 narudžbi raznih statusa (samo dok ih je <8).
const ordersRes = await call('GET', '/api/v1/orders', admin);
const orderCount = (ordersRes.body.orders ?? []).length;
if (WH && firstAccount && orderCount < 8) {
  const PLAN = [
    // [klijent, linije[[code,qty,price]], akcije]
    ['Hotel Panorama TEST d.o.o.', [['RASVJ-LED-120', 8, 260], ['POD-HRAST-M2', 120, 38]], ['confirm', 'fulfill', 'invoice-paid']],
    ['Market Lipa TEST d.o.o.', [['PAN-STAK-M2', 60, 145], ['ST-KONF-CRN', 30, 189]], ['confirm', 'fulfill', 'invoice-half']],
    ['Tehno Park TEST d.o.o.', [['ST-RAD-PRO', 10, 349]], ['confirm', 'fulfill', 'invoice-open']],
    ['Gradska biblioteka TEST', [['ST-KONF-SIV', 20, 189], ['PAN-AKU-60', 60, 42]], ['confirm']],
    ['Amir Testić (rezidencija)', [['POD-HRAST-M2', 95, 38], ['RASVJ-LED-120', 5, 260]], ['confirm']],
    ['Lejla Testović (penthouse)', [['PAN-STAK-M2', 25, 145]], []],
    ['Market Lipa TEST d.o.o.', [['ST-KONF-CRN', 15, 189]], []],
  ];
  let made = 0;
  const PROJECT_REF = { 'Tehno Park TEST d.o.o.': 'PRJ-2026-01', 'Amir Testić (rezidencija)': 'PRJ-2026-02', 'Hotel Panorama TEST d.o.o.': 'PRJ-2025-07' };
  for (const [name, lines, actions] of PLAN) {
    const account = accountByName.get(name) ?? firstAccount;
    const projectRef = PROJECT_REF[name];
    const o = await call('POST', '/api/v1/orders', admin, {
      accountId: account.id, warehouseId: WH.id, currency: 'EUR',
      ...(projectRef ? { projectRef } : {}),
    });
    for (const [code, qty, price] of lines) {
      const sku = skuByCode.get(code);
      if (sku) await call('POST', `/api/v1/orders/${o.body.id}/lines`, admin, { skuId: sku.id, quantity: qty, unitPrice: price });
    }
    for (const a of actions) {
      if (a === 'confirm') await call('POST', `/api/v1/orders/${o.body.id}/confirm`, admin, {});
      if (a === 'fulfill') await call('POST', `/api/v1/orders/${o.body.id}/fulfill`, admin, {});
      if (a.startsWith('invoice')) {
        const inv = await call('POST', '/api/v1/finance/invoices/customer', admin, { orderId: o.body.id, dueInDays: 30 });
        if (inv.body.id && a === 'invoice-paid') {
          await call('POST', `/api/v1/finance/invoices/${inv.body.id}/payments`, admin, { amount: Number(inv.body.total), reference: 'Izvod TEST-08 (demo)' });
        } else if (inv.body.id && a === 'invoice-half') {
          await call('POST', `/api/v1/finance/invoices/${inv.body.id}/payments`, admin, { amount: Math.round(Number(inv.body.total) * 50) / 100, reference: 'Izvod TEST-09 (demo)' });
        }
      }
    }
    made += 1;
  }
  console.log(`- ${made} narudžbi kroz statuse + fakture/uplate`);
}

// --------------------------------------- odobravatelj (SoD helper, rano)
let approver = null;
try {
  let role = await call('POST', '/api/v1/roles', admin, { name: 'make-odobravatelj', permissions: ['hcm.read', 'approval.act', 'qc.read', 'qc.approve'] });
  if (role.conflict) {
    const rs = await call('GET', '/api/v1/roles', admin);
    role = { body: (rs.body.roles ?? []).find((r) => r.name === 'make-odobravatelj') };
  }
  let u = await call('POST', '/api/v1/users/invite', admin, { email: 'vodja@make.example', displayName: 'Vođa tima (demo)', idpSubject: 'idp|make-vodja' });
  if (u.conflict) {
    const us = await call('GET', '/api/v1/users', admin);
    u = { body: (us.body.users ?? []).find((x) => x.email === 'vodja@make.example') };
  }
  if (role.body?.id && u.body?.id) {
    await call('POST', '/api/v1/roles/assign', admin, { userId: u.body.id, roleId: role.body.id });
    await call('PUT', `/api/v1/roles/${role.body.id}/permissions`, admin, {
      permissions: ['hcm.read', 'approval.act', 'qc.read', 'qc.approve'],
    });
  }
  approver = sign({ tenantSlug: SLUG, subject: 'idp|make-vodja' });
} catch {
  /* nabavka će raditi ispod praga */
}

// Narudžbe vezane na projekte (stvarno polje projectRef) — aditivno.
{
  const all = await call('GET', '/api/v1/orders', admin);
  const hasRef = (all.body.orders ?? []).some((o) => o.projectRef);
  if (!hasRef && WH && firstAccount) {
    const REFS = [
      ['Tehno Park TEST d.o.o.', 'PRJ-2026-01', [['ST-RAD-PRO', 12, 349], ['PAN-AKU-60', 40, 42]], true],
      ['Amir Testić (rezidencija)', 'PRJ-2026-02', [['POD-HRAST-M2', 60, 38]], false],
      ['Hotel Panorama TEST d.o.o.', 'PRJ-2025-07', [['RASVJ-LED-120', 6, 260]], true],
    ];
    for (const [name, projectRef, lines, confirm] of REFS) {
      const account = accountByName.get(name) ?? firstAccount;
      const o = await call('POST', '/api/v1/orders', admin, {
        accountId: account.id, warehouseId: WH.id, currency: 'EUR', projectRef,
      });
      for (const [code, qty, price] of lines) {
        const sku = skuByCode.get(code);
        if (sku) await call('POST', `/api/v1/orders/${o.body.id}/lines`, admin, { skuId: sku.id, quantity: qty, unitPrice: price });
      }
      if (confirm) await call('POST', `/api/v1/orders/${o.body.id}/confirm`, admin, {});
    }
    console.log('- 3 narudžbe vezane na projekte (projectRef)');
  }
}

// ----------------------------------------------------------- 11) nabavka
const suppliersRes = await call('GET', '/api/v1/suppliers', admin);
const posRes = await call('GET', '/api/v1/purchase-orders', admin);
if (WH && (posRes.body.purchaseOrders ?? []).length === 0) {
  const ensureSupplier = async (name, leadTimeDays) => {
    const found = (suppliersRes.body.suppliers ?? []).find((x) => x.name === name);
    if (found) return { body: found };
    return call('POST', '/api/v1/suppliers', admin, { name, leadTimeDays });
  };
  const s1 = await ensureSupplier('Drvo Stil TEST d.o.o. (stolarija)', 21);
  const s2 = await ensureSupplier('Lumen Rasvjeta TEST d.o.o.', 14);
  const mkPo = async (supplierId, code, qty, price, receiveQty) => {
    const sku = skuByCode.get(code);
    if (!sku) return;
    const req = await call('POST', '/api/v1/requisitions', admin, { currency: 'EUR' });
    await call('POST', `/api/v1/requisitions/${req.body.id}/lines`, admin, { skuId: sku.id, quantity: qty, estUnitPrice: price });
    const sub = await call('POST', `/api/v1/requisitions/${req.body.id}/submit`, admin, {});
    // Iznad praga: zahtjev ide na odobrenje — odobrava DRUGI korisnik (SoD).
    if (sub.body.approvalId && approver) {
      await call('POST', `/api/v1/approvals/${sub.body.approvalId}/approve`, approver, {});
      await call('POST', `/api/v1/requisitions/${req.body.id}/sync-approval`, admin, {});
    }
    const po = await call('POST', '/api/v1/purchase-orders', admin, { requisitionId: req.body.id, supplierId, warehouseId: WH.id });
    const line = (po.body.lines ?? [])[0];
    if (line && receiveQty > 0) {
      await call('POST', `/api/v1/purchase-orders/${po.body.id}/receive`, admin, {
        receiptKey: `make-po-${code}`, lines: [{ lineId: line.id, quantity: receiveQty }],
      });
    }
  };
  await mkPo(s1.body.id, 'POD-HRAST-M2', 500, 24.5, 500); // kompletno primljeno
  await mkPo(s2.body.id, 'RASVJ-LED-120', 60, 168, 24);   // djelimično — otvorena obaveza
  await mkPo(s1.body.id, 'PAN-STAK-M2', 150, 96, 0);      // otvorena narudžbenica
  console.log('- 2 dobavljača + 3 narudžbenice (primljena / djelimična / otvorena)');
}

// ------------------------------- 12) DEMO PROIZVODNJA (označen scenario)
const bomsRes = await call('GET', '/api/v1/boms', admin);
const pult = skuByCode.get('REC-PULT-STD');
const pod = skuByCode.get('POD-HRAST-M2');
const stakleni = skuByCode.get('PAN-STAK-M2');
const wosPre = await call('GET', '/api/v1/work-orders', admin);
if (WH && pult && pod && stakleni && (wosPre.body.workOrders ?? []).length < 2) {
  if ((bomsRes.body.boms ?? []).length === 0) {
  const bom = await call('POST', '/api/v1/boms', admin, { skuId: pult.id });
  await call('POST', `/api/v1/boms/${bom.body.id}/lines`, admin, { componentSkuId: pod.id, quantity: 6, scrapPct: 8 });
  await call('POST', `/api/v1/boms/${bom.body.id}/lines`, admin, { componentSkuId: stakleni.id, quantity: 3, scrapPct: 5 });
  await call('POST', `/api/v1/boms/${bom.body.id}/release`, admin, {});
  const routing = await call('POST', '/api/v1/routings', admin, { skuId: pult.id });
  await call('POST', `/api/v1/routings/${routing.body.id}/operations`, admin, { name: 'CNC krojenje (demo)', workCenter: 'CNC-1', setupMinutes: 30, runMinutesPerUnit: 90 });
  await call('POST', `/api/v1/routings/${routing.body.id}/operations`, admin, { name: 'Montaža i završna kontrola (demo)', workCenter: 'MONT-1', runMinutesPerUnit: 120 });
  await call('POST', `/api/v1/routings/${routing.body.id}/release`, admin, {});
  await call('POST', '/api/v1/qc/plans', admin, {
    skuId: pult.id, name: 'Završna kontrola pulta (demo)',
    items: [
      { name: 'Dimenzije', requirement: '±2mm od nacrta' },
      { name: 'Površinska obrada', requirement: 'Bez vidljivih oštećenja' },
    ],
  });
  }

  // QC inspekcija: kreiraj, evidentiraj stavke kao PASS, finaliziraj.
  const passQc = async (woId) => {
    // postojeća otvorena inspekcija ili nova
    const listRes = await call('GET', `/api/v1/qc/inspections?workOrderId=${woId}`, admin);
    let insp = (listRes.body.inspections ?? []).find((i) => i.status !== 'PASSED' && i.status !== 'FAILED');
    if ((listRes.body.inspections ?? []).some((i) => i.status === 'PASSED')) return;
    if (!insp) {
      const created = await call('POST', '/api/v1/qc/inspections', admin, { workOrderId: woId });
      insp = created.body;
    }
    if (!insp?.id) return;
    const full = await call('GET', `/api/v1/qc/inspections/${insp.id}`, admin);
    for (const item of full.body.items ?? []) {
      if (item.passed === null || item.passed === undefined) {
        await call('POST', `/api/v1/qc/inspections/${insp.id}/items`, admin, { itemId: item.id, passed: true });
      }
    }
    await call('POST', `/api/v1/qc/inspections/${insp.id}/finalize`, approver ?? admin, {});
  };
  const existingWos = wosPre.body.workOrders ?? [];
  // dovrši eventualni ranije započeti nalog (resumable)
  for (const w of existingWos.filter((x) => x.status === 'IN_PROGRESS')) {
    const wv = await call('GET', `/api/v1/work-orders/${w.id}`, admin);
    for (const op of wv.body.operations ?? []) {
      if (op.status === 'DONE') continue;
      if (Number(op.confirmedQty) < Number(w.quantity)) {
        await call('POST', `/api/v1/work-orders/${w.id}/operations/${op.id}/confirm`, admin, {
          quantity: Number(w.quantity) - Number(op.confirmedQty), confirmationKey: `make-fix-${op.id}`,
        });
      }
      await call('POST', `/api/v1/work-orders/${w.id}/operations/${op.id}/complete`, admin, {});
    }
    await passQc(w.id);
    await call('POST', `/api/v1/work-orders/${w.id}/complete`, admin, { goodQuantity: Number(w.quantity), scrapQuantity: 0 });
  }
  if (existingWos.length === 0) {
  // 1 završen nalog (historija) + 1 u toku
  const wo1 = await call('POST', '/api/v1/work-orders', admin, { skuId: pult.id, warehouseId: WH.id, quantity: 2 });
  if (wo1.body.id) {
    await call('POST', `/api/v1/work-orders/${wo1.body.id}/release`, admin, {});
    await call('POST', `/api/v1/work-orders/${wo1.body.id}/start`, admin, {});
    // sve operacije potvrđene kroz MES prije završetka (bez prečica)
    const woView = await call('GET', `/api/v1/work-orders/${wo1.body.id}`, admin);
    for (const op of woView.body.operations ?? []) {
      await call('POST', `/api/v1/work-orders/${wo1.body.id}/operations/${op.id}/confirm`, admin, {
        quantity: 2,
        confirmationKey: `make-wo1-${op.id}`,
      });
      await call('POST', `/api/v1/work-orders/${wo1.body.id}/operations/${op.id}/complete`, admin, {});
    }
    await passQc(wo1.body.id);
    await call('POST', `/api/v1/work-orders/${wo1.body.id}/complete`, admin, { goodQuantity: 2, scrapQuantity: 0 });
  }
  }
  const wosNow = await call('GET', '/api/v1/work-orders', admin);
  const hasActive = (wosNow.body.workOrders ?? []).some((x) => ['RELEASED', 'IN_PROGRESS'].includes(x.status));
  const wo2 = hasActive ? { body: {} } : await call('POST', '/api/v1/work-orders', admin, { skuId: pult.id, warehouseId: WH.id, quantity: 1 });
  if (wo2.body.id) {
    await call('POST', `/api/v1/work-orders/${wo2.body.id}/release`, admin, {});
    await call('POST', `/api/v1/work-orders/${wo2.body.id}/start`, admin, {});
  }
  console.log('- DEMO proizvodnja: BOM+rutiranje+QC, 1 završen + 1 aktivan nalog');
}

// ----------------------------------------------------------- 13) projekti
try {
  await call('POST', '/api/v1/projects/setup', admin, {});
  const projRes = await call('GET', '/api/v1/projects', admin);
  const existingProj = new Set((projRes.body.projects ?? []).map((p) => p.code));
  const PROJECTS = [
    ['PRJ-2026-01', 'Poslovni prostor Tehno Park — uredi 2. sprat', 'aktivan', 145000],
    ['PRJ-2026-02', 'Rezidencija Testić — enterijer 240m²', 'aktivan', 98000],
    ['PRJ-2026-03', 'Prodajni objekat Market Lipa — koncept i oprema', 'planiran', 76000],
    ['PRJ-2025-07', 'Lobby Hotel Panorama — rekonstrukcija', 'zavrsen', 112000],
  ];
  for (const [code, naziv, status, budzet] of PROJECTS) {
    if (existingProj.has(code)) continue;
    await call('POST', '/api/v1/custom-objects/prj_project/records', admin, {
      data: { code, naziv, status, budzet, valuta: 'EUR' },
    });
  }
  // troškovi/prihodi/satnice na aktivnim projektima (stabilni entry ključevi)
  const addOnce = async (code, path, body) => {
    try { await call('POST', `/api/v1/projects/${code}${path}`, admin, body); } catch { /* CONFLICT za postojeći key */ }
  };
  await addOnce('PRJ-2026-01', '/costs', { entryId: 'make-c1', kind: 'subcontract', amount: 18500, description: 'Elektroinstalacije — podizvođač (TEST)' });
  await addOnce('PRJ-2026-01', '/costs', { entryId: 'make-c2', kind: 'material', amount: 25400, description: 'Oprema iz skladišta — faza 1' });
  await addOnce('PRJ-2026-01', '/revenue', { amount: 60000 });
  await addOnce('PRJ-2026-01', '/change-orders', { key: 'make-co1', delta: 8500, reason: 'Prošireni obim: staklene pregrade sale za sastanke' });
  await addOnce('PRJ-2026-02', '/costs', { entryId: 'make-c3', kind: 'labor', amount: 9200, description: 'Projektantski sati — glavni projekat' });
  await addOnce('PRJ-2025-07', '/revenue', { amount: 112000 });
  // faze (prj_milestone) — po projektu, bez duplikata po nazivu
  const msRes = await call('GET', '/api/v1/custom-objects/prj_milestone/records', admin);
  const msKeys = new Set(
    (msRes.body.records ?? []).map((r) => `${(r.data ?? {}).projekt}:${(r.data ?? {}).naziv}`),
  );
  const MILESTONES = [
    ['PRJ-2026-01', 'Glavni projekat i dozvole', '2026-05-30'],
    ['PRJ-2026-01', 'Gradevinski radovi — faza 1', '2026-08-15'],
    ['PRJ-2026-01', 'Opremanje i primopredaja', '2026-11-20'],
    ['PRJ-2026-02', 'Idejno rješenje', '2026-07-10'],
    ['PRJ-2026-02', 'Izvedbeni projekat enterijera', '2026-10-01'],
    ['PRJ-2026-03', 'Koncept prodajnog prostora', '2026-10-20'],
    ['PRJ-2025-07', 'Rekonstrukcija lobbyja', '2026-03-31'],
  ];
  for (const [projekt, naziv, rok] of MILESTONES) {
    if (msKeys.has(`${projekt}:${naziv}`)) continue;
    await call('POST', '/api/v1/custom-objects/prj_milestone/records', admin, {
      data: { projekt, naziv, rok },
    });
  }
  // završene faze na zaključenom projektu (idempotentno: 'done' marker po recordu)
  const doneList = await call('GET', '/api/v1/projects/PRJ-2025-07/milestones', admin);
  for (const m of doneList.body.milestones ?? []) {
    if (!m.done) {
      await call('POST', '/api/v1/projects/PRJ-2025-07/milestones/complete', admin, {
        milestoneRecordId: m.id,
      });
    }
  }
  await addOnce('PRJ-2025-07', '/costs', { entryId: 'make-c4', kind: 'other', amount: 84300, description: 'Ukupni troškovi izvedbe (zaključeno)' });
  console.log('- 4 projekta (aktivni/planiran/završen) s troškovima i prihodima');
  // Sprint 227: klijent (partner) + odgovorna osoba + povezani NBN + dokumenti
  const hdr = await call('GET', '/api/v1/projects/PRJ-2026-01/header', admin);
  if (!hdr.body.client) {
    const partiesNow = await call('GET', '/api/v1/parties?q=', admin);
    const partyByName = new Map((partiesNow.body.parties ?? []).map((p) => [p.name, p]));
    const empsNow = await call('GET', '/api/v1/employees', admin);
    const empByName = new Map((empsNow.body.employees ?? []).map((e) => [e.name, e]));
    const CLIENT_MAP = [
      ['PRJ-2026-01', 'Tehno Park TEST d.o.o.', 'Adna Testović'],
      ['PRJ-2026-02', 'Amir Testić (rezidencija)', 'Selma Testar'],
      ['PRJ-2026-03', 'Market Lipa TEST d.o.o.', 'Tarik Testić'],
      ['PRJ-2025-07', 'Hotel Panorama TEST d.o.o.', 'Mirza Testalović'],
    ];
    for (const [code, clientName, ownerName] of CLIENT_MAP) {
      const party = partyByName.get(clientName);
      const emp = empByName.get(ownerName);
      if (party) await call('POST', `/api/v1/projects/${code}/client`, admin, { partyId: party.id });
      if (emp) await call('POST', `/api/v1/projects/${code}/owner`, admin, { employeeId: emp.id });
    }
    // poveži prvi NBN s aktivnim projektom (idempotentno u servisu)
    const pos = await call('GET', '/api/v1/purchase-orders', admin);
    const firstPo = (pos.body.purchaseOrders ?? [])[0];
    if (firstPo) {
      await call('POST', '/api/v1/projects/PRJ-2026-01/purchase-orders', admin, { purchaseOrderId: firstPo.id });
    }
    // 2 projektna dokumenta (mali, sintetički)
    const recs = await call('GET', '/api/v1/custom-objects/prj_project/records', admin);
    const rec01 = (recs.body.records ?? []).find((r) => (r.data ?? {}).code === 'PRJ-2026-01');
    if (rec01) {
      const docsNow = await call('GET', `/api/v1/attachments?entityType=prj_project&entityId=${rec01.id}`, admin);
      if ((docsNow.body.attachments ?? []).length === 0) {
        const b64 = (t) => Buffer.from(t).toString('base64');
        await call('POST', '/api/v1/attachments', admin, {
          entityType: 'prj_project', entityId: rec01.id,
          fileName: 'zapisnik-sastanka-2026-08.txt', contentType: 'text/plain',
          dataBase64: b64('Zapisnik koordinacije — faza 1 (sintetički demo dokument).'),
        });
        await call('POST', '/api/v1/attachments', admin, {
          entityType: 'prj_project', entityId: rec01.id,
          fileName: 'specifikacija-opreme-v2.csv', contentType: 'text/csv',
          dataBase64: b64('pozicija,artikal,kolicina\n1,ST-RAD-PRO,25\n2,PAN-AKU-60,80'),
        });
      }
    }
    console.log('- projekti: klijenti/odgovorne osobe + 1 NBN link + 2 dokumenta');
  }

} catch (e) {
  console.log(`- (projekti preskočeni: ${e.message})`);
}

// ------------------------------------------------------------- 14) HR tim
const empRes = await call('GET', '/api/v1/employees', admin);
if ((empRes.body.employees ?? []).length < 6) {
  const TEAM = [
    ['Adna Testović', 'Glavna arhitektica', ['projektovanje', 'nadzor']],
    ['Tarik Testić', 'Arhitekt saradnik', ['projektovanje', '3D vizualizacija']],
    ['Selma Testar', 'Dizajnerica enterijera', ['enterijer', 'specifikacija opreme']],
    ['Mirza Testalović', 'Voditelj gradilišta', ['koordinacija izvođenja']],
    ['Jasmin Testović', 'Monter opreme', ['montaža']],
    ['Amila Testić', 'Office / finansije', ['fakturisanje']],
  ];
  for (const [name, title, skills] of TEAM) {
    const e = await call('POST', '/api/v1/employees', admin, {
      name, title, email: `${name.split(' ')[0].toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')}@make.example`,
    });
    if (!e.conflict && e.body.id) {
      await call('POST', `/api/v1/employees/${e.body.id}/skills`, admin, { skills });
    }
  }
  console.log('- 6 zaposlenih sa vještinama');
}
// jedan odobren zahtjev za odsustvo (odobrava vođa — SoD)
try {
  const emps = await call('GET', '/api/v1/employees', admin);
  const emp = (emps.body.employees ?? [])[0];
  if (emp && approver) {
    const leave = await call('POST', '/api/v1/workforce/leave', admin, { employeeId: emp.id, from: '2026-10-12', to: '2026-10-16', type: 'Godišnji odmor' });
    if (!leave.conflict && leave.body.approvalId) {
      await call('POST', `/api/v1/approvals/${leave.body.approvalId}/approve`, approver, {});
      console.log('- 1 odobren zahtjev za odsustvo (SoD kroz odobravatelja)');
    }
  }
} catch (e) {
  console.log(`- (HR odsustvo preskočeno: ${e.message})`);
}

// -------------------------------------------------------------- 15) zadaci
try {
  const tasksRes = await call('GET', '/api/v1/tasks', admin);
  const titles = new Set((tasksRes.body.tasks ?? []).map((t) => t.title));
  const TASKS = [
    'Revizija glavnog projekta — Tehno Park sprat 2',
    'Naručiti uzorke podnih obloga za rezidenciju Testić',
    'Termin primopredaje — Market Lipa (koncept)',
    'Kontrola montaže rasvjete — Hotel Panorama lobby',
  ];
  for (const title of TASKS) {
    if (!titles.has(title)) await call('POST', '/api/v1/tasks', admin, { title });
  }
  console.log('- 4 zadatka');
} catch (e) {
  console.log(`- (zadaci preskočeni: ${e.message})`);
}

// -------------------------------------------------------------- 16) imovina
try {
  const assetsRes = await call('GET', '/api/v1/assets', admin);
  if ((assetsRes.body.assets ?? []).length < 3) {
    await call('POST', '/api/v1/assets', admin, { name: 'Ploter HP DesignJet (TEST)', category: 'Ured', serialNumber: 'TEST-PLT-001', value: 3400 });
    await call('POST', '/api/v1/assets', admin, { name: 'Kombi za montažu — TZ-TEST-123', category: 'Vozila', serialNumber: 'TEST-VAN-001', value: 28000 });
    await call('POST', '/api/v1/assets', admin, { name: 'Laserski daljinomjer (TEST)', category: 'Mjerna oprema', serialNumber: 'TEST-LSR-007', value: 450 });
    console.log('- 3 sredstva (imovina)');
  }
} catch (e) {
  console.log(`- (imovina preskočena: ${e.message})`);
}

// ------------------------------------------------------- 17) B2B portal
try {
  let role = await call('POST', '/api/v1/roles', admin, { name: 'portal-customer', permissions: ['portal.access'] });
  if (role.conflict) {
    const rs = await call('GET', '/api/v1/roles', admin);
    role = { body: (rs.body.roles ?? []).find((r) => r.name === 'portal-customer') };
  }
  const tehno = accountByName.get('Tehno Park TEST d.o.o.') ?? firstAccount;
  if (tehno && role.body?.id) {
    let u = await call('POST', '/api/v1/users/invite', admin, { email: 'portal@tehnopark-test.example', displayName: 'Tehno Park portal', idpSubject: 'idp|make-klijent' });
    if (u.conflict) {
      const us = await call('GET', '/api/v1/users', admin);
      u = { body: (us.body.users ?? []).find((x) => x.email === 'portal@tehnopark-test.example') };
    }
    if (u.body?.id) await call('POST', '/api/v1/roles/assign', admin, { userId: u.body.id, roleId: role.body.id });
    await call('POST', '/api/v1/portal-users', admin, { accountId: tehno.id, idpSubject: 'idp|make-klijent', displayName: 'Tehno Park portal' });
    // ugovorni cjenovnik za portal (accountId-vezan)
    let cpl = await call('POST', '/api/v1/price-lists', admin, { code: 'MAKE-TEHNO', name: 'Ugovorne cijene — Tehno Park (TEST)', currency: 'EUR', accountId: tehno.id });
    if (cpl.conflict) {
      const all = await call('GET', '/api/v1/price-lists', admin);
      cpl = { body: (all.body.priceLists ?? []).find((l) => l.code === 'MAKE-TEHNO') };
    }
    if (cpl.body?.id) {
      for (const code of ['ST-RAD-PRO', 'STOL-RAD-160', 'PAN-AKU-60']) {
        const sku = skuByCode.get(code);
        if (sku) await call('PUT', `/api/v1/price-lists/${cpl.body.id}/entries`, admin, { skuId: sku.id, unitPrice: Math.round((CATALOG.flatMap(([,,s])=>s).find(([c])=>c===code)?.[3] ?? 100) * 0.9 * 100) / 100 });
      }
      if (cpl.body.status === 'DRAFT') await call('POST', `/api/v1/price-lists/${cpl.body.id}/publish`, admin, {});
    }
    // jedna portal narudžba (idempotentna preko requestKey)
    const klijent = sign({ tenantSlug: SLUG, subject: 'idp|make-klijent' });
    const sku = skuByCode.get('ST-RAD-PRO');
    if (sku) {
      await call('POST', '/api/v1/portal/orders', klijent, {
        requestKey: 'make-portal-demo-001',
        lines: [{ skuId: sku.id, quantity: 6 }],
      });
    }
    console.log('- B2B portal: klijent Tehno Park + ugovorni cjenovnik + 1 portal narudžba');
  }
} catch (e) {
  console.log(`- (portal preskočen: ${e.message})`);
}

// ------------------------------------ 18) BACKDATING (samo vremenske kolone)
// Jasno označen demo korak: raspoređuje POSTOJEĆE make zapise kroz zadnjih
// 6 mjeseci od REF_DATE radi trendova. Ne mijenja statuse, iznose ni veze.
if (process.env.DATABASE_URL) {
  const sql = `
    WITH t AS (SELECT id FROM tenant WHERE slug='${SLUG}')
    , o AS (SELECT id, row_number() OVER (ORDER BY order_number) rn, count(*) OVER () n
            FROM sales_order WHERE tenant_id=(SELECT id FROM t))
    UPDATE sales_order s SET created_at = DATE '${REF_DATE}' - ((o.n - o.rn) * INTERVAL '26 days')
    FROM o WHERE s.id=o.id AND s.created_at::date > DATE '${REF_DATE}' - INTERVAL '1 day';

    WITH t AS (SELECT id FROM tenant WHERE slug='${SLUG}')
    , m AS (SELECT id, row_number() OVER (ORDER BY id) rn, count(*) OVER () n
            FROM stock_movement WHERE tenant_id=(SELECT id FROM t))
    UPDATE stock_movement s SET occurred_at = DATE '${REF_DATE}' - ((m.n - m.rn) * INTERVAL '11 days')
    FROM m WHERE s.id=m.id AND s.occurred_at::date > DATE '${REF_DATE}' - INTERVAL '1 day';

    WITH t AS (SELECT id FROM tenant WHERE slug='${SLUG}')
    , q AS (SELECT id, row_number() OVER (ORDER BY quote_number) rn, count(*) OVER () n
            FROM quote WHERE tenant_id=(SELECT id FROM t))
    UPDATE quote s SET created_at = DATE '${REF_DATE}' - ((q.n - q.rn) * INTERVAL '31 days')
    FROM q WHERE s.id=q.id AND s.created_at::date > DATE '${REF_DATE}' - INTERVAL '1 day';
  `;
  try {
    execFileSync('psql', [process.env.DATABASE_URL, '-q', '-v', 'ON_ERROR_STOP=1', '-c', sql], { stdio: 'pipe' });
    console.log(`- backdating: narudžbe/kretanja/ponude raspoređeni kroz ~6 mjeseci do ${REF_DATE}`);
  } catch (e) {
    console.log(`- (backdating preskočen: ${String(e.message).split('\n')[0]})`);
  }
} else {
  console.log('- (backdating preskočen: nema DATABASE_URL)');
}

console.log('\nGotovo. Prijava: tenant "make", subject "idp|admin" (ili lozinka admin@make.example / make-demo).');
console.log('Portal klijent: tenant "make", subject "idp|make-klijent".');
