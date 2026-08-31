#!/usr/bin/env node
/**
 * Seeds a demo tenant with realistic sample data through the public API —
 * exactly what a person could do by hand in the UI, just faster.
 *
 * Usage:  node scripts/seed-demo.mjs   (API must be running on :3001)
 * Env:    API_URL (default http://localhost:3001)
 *         DEV_AUTH_SECRET (default dev-secret-change-me)
 *         TENANT_SLUG (default demo)
 *
 * All names are fictional (spec rule: no real customer names).
 */
import { createHmac } from 'node:crypto';

const API = process.env.API_URL ?? 'http://localhost:3001';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';
const SLUG = process.env.TENANT_SLUG ?? 'demo';

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
  const json = await res.json().catch(() => ({}));
  if (!res.ok && json.code !== 'CONFLICT') {
    throw new Error(`${method} ${path} -> ${res.status}: ${json.message ?? 'error'}`);
  }
  return { status: res.status, body: json, conflict: json.code === 'CONFLICT' };
}

const platformToken = sign({ tenantSlug: 'platform', subject: 'ops|root', platformAdmin: true });

console.log(`Seeding tenant "${SLUG}" at ${API}`);

// 1) Tenant (idempotent: CONFLICT means it already exists)
const tenant = await call('POST', '/api/v1/tenants', platformToken, {
  slug: SLUG,
  name: 'Demo Company',
  initialAdmin: {
    email: `admin@${SLUG}.example`,
    displayName: 'Demo Admin',
    idpSubject: 'idp|admin',
  },
});
console.log(tenant.conflict ? '- tenant already exists' : '- tenant provisioned');

const admin = sign({ tenantSlug: SLUG, subject: 'idp|admin' });

// 1b) Refresh the tenant-admin role to the current permission baseline, so a
// tenant seeded before a new module still sees it (idempotent).
const BASELINE = [
  'organization.read',
  'organization.manage',
  'configuration.read',
  'configuration.publish',
  'iam.user.manage',
  'iam.role.manage',
  'iam.permission.manage',
  'iam.session.revoke',
  'iam.security.read',
  'audit.read',
  'task.manage',
  'workflow.read',
  'workflow.design',
  'workflow.publish',
  'approval.act',
  'automation.manage',
  'document.read',
  'document.issue',
  'mdm.read',
  'mdm.create',
  'mdm.merge',
  'mdm.steward',
  'product.read',
  'product.manage',
  'product.barcode.manage',
  'product.publish',
  'inventory.read',
  'inventory.receive',
  'inventory.transfer',
  'inventory.pick',
  'inventory.pack',
  'inventory.count',
  'inventory.adjust',
  'inventory.adjust.approve',
  'device.read',
  'device.enroll',
  'device.assign',
  'device.revoke',
  'device.support',
  'verification.use',
  'verification.override',
  'verification.audit',
  'crm.read',
  'crm.manage',
  'crm.credit.read',
  'crm.customer.approve',
  'pricing.read',
  'pricing.manage',
  'pricing.override',
  'quote.read',
  'quote.create',
  'quote.approve',
  'order.read',
  'order.create',
  'order.confirm',
  'order.hold',
  'order.cancel',
  'purchase.read',
  'purchase.request',
  'purchase.manage',
  'purchase.receive',
];
try {
  const roles = await call('GET', '/api/v1/roles', admin);
  const adminRole = (roles.body.roles ?? []).find((r) => r.name === 'tenant-admin');
  if (adminRole && adminRole.permissions.length < BASELINE.length) {
    await call('PUT', `/api/v1/roles/${adminRole.id}/permissions`, admin, {
      permissions: BASELINE,
    });
    console.log('- tenant-admin permissions refreshed to current baseline');
  }
} catch {
  console.log('- (could not refresh role baseline, continuing)');
}

// 2) Parties
const partyNames = [
  ['ORGANIZATION', 'Adriatic Retail Group', 'orders@adriatic-retail.example', 'HR11111111111'],
  ['ORGANIZATION', 'Nordwind Logistics', 'dispatch@nordwind.example', 'DE22222222222'],
  ['ORGANIZATION', 'Balkan Components', 'sales@balkan-components.example', 'BA33333333333'],
  ['PERSON', 'Petra Primjer', 'petra@example.example', null],
];
for (const [partyType, name, email, taxId] of partyNames) {
  await call('POST', '/api/v1/parties', admin, {
    partyType,
    name,
    ...(email ? { email } : {}),
    ...(taxId ? { taxId } : {}),
  });
}
console.log(`- ${partyNames.length} parties`);

// 3) Products + SKUs + barcodes
const catalog = [
  ['CHAIR-ERGO', 'Ergonomic Office Chair', [['CHAIR-ERGO-BLK', 'Black', '3850000000017']]],
  ['DESK-ADJ', 'Adjustable Standing Desk', [['DESK-ADJ-160', '160cm Oak', '3850000000024']]],
  [
    'LAMP-LED',
    'LED Desk Lamp',
    [
      ['LAMP-LED-W', 'White', '3850000000031'],
      ['LAMP-LED-B', 'Black', '3850000000048'],
    ],
  ],
  ['CABLE-USBC', 'USB-C Cable 2m', [['CABLE-USBC-2M', 'Standard', '3850000000055']]],
];
const skuIds = [];
for (const [code, name, skus] of catalog) {
  const product = await call('POST', '/api/v1/products', admin, { code, name });
  if (product.conflict) {
    console.log(`- product ${code} exists, skipping its SKUs`);
    continue;
  }
  const productId = product.body.id;
  await call('POST', `/api/v1/products/${productId}/publish`, admin);
  for (const [skuCode, variant, barcode] of skus) {
    const sku = await call('POST', '/api/v1/skus', admin, {
      productId,
      code: skuCode,
      name: `${name} — ${variant}`,
      baseUom: 'pcs',
    });
    if (!sku.conflict) {
      await call('POST', `/api/v1/skus/${sku.body.id}/activate`, admin);
      await call('POST', '/api/v1/barcodes', admin, { skuId: sku.body.id, value: barcode });
      skuIds.push(sku.body.id);
    }
  }
}
console.log(`- ${skuIds.length} SKUs (activated, with barcodes)`);

// 4) Warehouses + opening stock through the ledger
const wh1 = await call('POST', '/api/v1/warehouses', admin, {
  code: 'WH-MAIN',
  name: 'Main warehouse',
});
const wh2 = await call('POST', '/api/v1/warehouses', admin, {
  code: 'WH-STORE',
  name: 'Storefront',
});
const list = await call('GET', '/api/v1/warehouses', admin);
const warehouses = list.body.warehouses;
const main = warehouses.find((w) => w.code === 'WH-MAIN') ?? warehouses[0];
void wh1;
void wh2;

let receipts = 0;
for (const skuId of skuIds) {
  const qty = 20 + Math.floor(Math.random() * 80);
  await call('POST', '/api/v1/stock/movements', admin, {
    warehouseId: main.id,
    skuId,
    movementType: 'RECEIPT',
    quantity: qty,
    idempotencyKey: `seed-receipt-${skuId}`,
    reason: 'Opening stock (seed)',
  });
  receipts += 1;
}
console.log(`- ${receipts} opening receipts into ${main.code}`);

// 5) A device, so the Devices screen has something to show
const device = await call('POST', '/api/v1/devices', admin, {
  code: 'HH-01',
  name: 'Zebra-class handheld (demo)',
  deviceType: 'SCANNER',
});
if (!device.conflict) {
  const token = device.body.enrollmentToken;
  await fetch(`${API}/api/v1/devices/enroll`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ enrollmentToken: token, capabilities: { barcode: true } }),
  });
  console.log('- 1 scanner registered and enrolled');
}

// 6) CRM + CPQ: accounts for existing parties, a lead, a price list, a quote
try {
  const partiesRes = await call('GET', '/api/v1/parties?q=', admin);
  const orgs = (partiesRes.body.parties ?? []).filter((p) => p.partyType === 'ORGANIZATION');
  let accountsCreated = 0;
  for (const org of orgs.slice(0, 3)) {
    const res = await call('POST', '/api/v1/crm/accounts', admin, { partyId: org.id });
    if (!res.conflict) accountsCreated += 1;
  }
  await call('POST', '/api/v1/crm/leads', admin, {
    name: 'Sanja Prospekt',
    company: 'Prospekt Trade',
    email: 'sanja@prospekt.example',
    source: 'web',
  });
  console.log(`- ${accountsCreated} CRM accounts + 1 lead`);

  const accountsRes = await call('GET', '/api/v1/crm/accounts', admin);
  const firstAccount = (accountsRes.body.accounts ?? [])[0];

  let listRes = await call('POST', '/api/v1/price-lists', admin, {
    code: 'STANDARD',
    name: 'Standard prices',
    currency: 'EUR',
  });
  const listsRes = await call('GET', '/api/v1/price-lists', admin);
  const standard = (listsRes.body.priceLists ?? []).find((l) => l.code === 'STANDARD');
  void listRes;
  if (standard) {
    const productsRes = await call('GET', '/api/v1/products/search', admin);
    let priced = 0;
    for (const product of (productsRes.body.products ?? []).slice(0, 6)) {
      const detail = await call('GET', `/api/v1/products/${product.id}`, admin);
      for (const sku of detail.body.skus ?? []) {
        await call('PUT', `/api/v1/price-lists/${standard.id}/entries`, admin, {
          skuId: sku.id,
          unitPrice: Math.round((30 + Math.random() * 470) * 100) / 100,
        });
        priced += 1;
      }
    }
    if (standard.status === 'DRAFT') {
      await call('POST', `/api/v1/price-lists/${standard.id}/publish`, admin);
    }
    console.log(`- price list STANDARD published with ${priced} prices`);

    if (firstAccount) {
      const existingQuotes = await call('GET', '/api/v1/quotes', admin);
      if ((existingQuotes.body.quotes ?? []).length === 0) {
        const quote = await call('POST', '/api/v1/quotes', admin, {
          accountId: firstAccount.id,
          priceListId: standard.id,
        });
        const entriesRes = await call('GET', `/api/v1/price-lists/${standard.id}/entries`, admin);
        const entry = (entriesRes.body.entries ?? [])[0];
        if (entry && quote.body.id) {
          await call('POST', `/api/v1/quotes/${quote.body.id}/lines`, admin, {
            skuId: entry.skuId,
            quantity: 10,
            discountPct: 5,
          });
          await call('POST', `/api/v1/quotes/${quote.body.id}/submit`, admin);
          console.log('- 1 demo quote (submitted)');
        }
      }
    }
  }
} catch (e) {
  console.log(`- (CRM/CPQ seed skipped: ${e.message})`);
}

console.log('\nDone. Sign in with tenant "' + SLUG + '", subject "idp|admin".');
