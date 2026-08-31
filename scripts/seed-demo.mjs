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
  'bom.read',
  'bom.manage',
  'bom.release',
  'plan.read',
  'plan.manage',
  'production.read',
  'production.manage',
  'production.execute',
  'qc.read',
  'qc.record',
  'qc.approve',
  'qc.manage',
  'finance.read',
  'finance.invoice',
  'finance.pay',
  'analytics.read',
  'portal.manage',
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

// 7) Sprint 007-014 demo data: orders, procurement, engineering,
//    production, quality, finance — everything idempotent.
try {
  const accountsRes = await call('GET', '/api/v1/crm/accounts', admin);
  const account = (accountsRes.body.accounts ?? [])[0];
  const whRes = await call('GET', '/api/v1/warehouses', admin);
  const wh = (whRes.body.warehouses ?? []).find((w) => w.code === 'WH-MAIN');
  const productsRes = await call('GET', '/api/v1/products/search', admin);
  const allSkus = [];
  for (const product of productsRes.body.products ?? []) {
    const detail = await call('GET', `/api/v1/products/${product.id}`, admin);
    for (const sku of detail.body.skus ?? []) allSkus.push(sku);
  }
  const chair = allSkus.find((s) => s.code === 'CHAIR-ERGO-BLK');
  const cable = allSkus.find((s) => s.code === 'CABLE-USBC-2M');
  const lamp = allSkus.find((s) => s.code === 'LAMP-LED-W');

  // Orders: one confirmed, one fulfilled (only on first run).
  const ordersRes = await call('GET', '/api/v1/orders', admin);
  if (account && wh && chair && (ordersRes.body.orders ?? []).length === 0) {
    const o1 = await call('POST', '/api/v1/orders', admin, {
      accountId: account.id,
      warehouseId: wh.id,
      currency: 'EUR',
    });
    await call('POST', `/api/v1/orders/${o1.body.id}/lines`, admin, {
      skuId: chair.id,
      quantity: 4,
      unitPrice: 249.9,
    });
    await call('POST', `/api/v1/orders/${o1.body.id}/confirm`, admin);
    const o2 = await call('POST', '/api/v1/orders', admin, {
      accountId: account.id,
      warehouseId: wh.id,
      currency: 'EUR',
    });
    await call('POST', `/api/v1/orders/${o2.body.id}/lines`, admin, {
      skuId: cable?.id ?? chair.id,
      quantity: 10,
      unitPrice: 9.9,
    });
    await call('POST', `/api/v1/orders/${o2.body.id}/confirm`, admin);
    await call('POST', `/api/v1/orders/${o2.body.id}/fulfill`, admin);
    // Finance: invoice the fulfilled order and pay half.
    const inv = await call('POST', '/api/v1/finance/invoices/customer', admin, {
      orderId: o2.body.id,
      dueInDays: 30,
    });
    if (inv.body.id) {
      await call('POST', `/api/v1/finance/invoices/${inv.body.id}/payments`, admin, {
        amount: Math.round(Number(inv.body.total) * 50) / 100,
        reference: 'Bank statement 2026-08 (demo)',
      });
    }
    console.log('- 2 sales orders (1 fulfilled + invoiced, half paid)');
  }

  // Procurement: supplier + received PO (only on first run).
  const suppliersRes = await call('GET', '/api/v1/suppliers', admin);
  if (wh && cable && (suppliersRes.body.suppliers ?? []).length === 0) {
    const supplier = await call('POST', '/api/v1/suppliers', admin, {
      name: 'Komponenta Uvoz d.o.o.',
      leadTimeDays: 10,
    });
    const requisition = await call('POST', '/api/v1/requisitions', admin, { currency: 'EUR' });
    await call('POST', `/api/v1/requisitions/${requisition.body.id}/lines`, admin, {
      skuId: cable.id,
      quantity: 100,
      estUnitPrice: 3.5,
    });
    await call('POST', `/api/v1/requisitions/${requisition.body.id}/submit`, admin);
    const po = await call('POST', '/api/v1/purchase-orders', admin, {
      requisitionId: requisition.body.id,
      supplierId: supplier.body.id,
      warehouseId: wh.id,
    });
    const poLine = (po.body.lines ?? [])[0];
    if (poLine) {
      await call('POST', `/api/v1/purchase-orders/${po.body.id}/receive`, admin, {
        receiptKey: 'seed-receipt-1',
        lines: [{ lineId: poLine.id, quantity: 60 }],
      });
    }
    console.log('- 1 supplier + 1 PO (partially received into the ledger)');
  }

  // Engineering: released BOM + routing for the lamp (only on first run).
  const bomsRes = await call('GET', '/api/v1/boms', admin);
  if (lamp && cable && (bomsRes.body.boms ?? []).length === 0) {
    const bom = await call('POST', '/api/v1/boms', admin, { skuId: lamp.id });
    await call('POST', `/api/v1/boms/${bom.body.id}/lines`, admin, {
      componentSkuId: cable.id,
      quantity: 1,
      scrapPct: 5,
    });
    await call('POST', `/api/v1/boms/${bom.body.id}/release`, admin);
    const routing = await call('POST', '/api/v1/routings', admin, { skuId: lamp.id });
    await call('POST', `/api/v1/routings/${routing.body.id}/operations`, admin, {
      name: 'Assemble base',
      workCenter: 'BENCH-1',
      setupMinutes: 10,
      runMinutesPerUnit: 4,
    });
    await call('POST', `/api/v1/routings/${routing.body.id}/operations`, admin, {
      name: 'Final test',
      workCenter: 'QC-1',
      runMinutesPerUnit: 1.5,
    });
    await call('POST', `/api/v1/routings/${routing.body.id}/release`, admin);
    console.log('- released BOM + routing for LAMP-LED-W');

    // Quality plan for the lamp.
    await call('POST', '/api/v1/qc/plans', admin, {
      skuId: lamp.id,
      name: 'Lamp final inspection',
      items: [
        { name: 'Power-on test', requirement: 'Lamp lights within 1s' },
        { name: 'Cable strain relief', requirement: 'Withstands 20N pull' },
      ],
    });
    console.log('- QC plan for LAMP-LED-W (production now gated)');

    // Production: one work order released and in progress.
    const wo = await call('POST', '/api/v1/work-orders', admin, {
      skuId: lamp.id,
      warehouseId: wh.id,
      quantity: 10,
    });
    if (wo.body.id) {
      await call('POST', `/api/v1/work-orders/${wo.body.id}/release`, admin);
      await call('POST', `/api/v1/work-orders/${wo.body.id}/start`, admin);
      console.log('- 1 work order in progress (material issued)');
    }

    // Planning: policy + an MRP run so the screen has a snapshot.
    await call('PUT', '/api/v1/planning/policies', admin, {
      skuId: cable.id,
      safetyStock: 50,
      leadTimeDays: 10,
    });
    await call('POST', '/api/v1/planning/runs', admin);
    console.log('- planning policy + 1 MRP run');
  }
} catch (e) {
  console.log(`- (Sprint 007-014 seed skipped: ${e.message})`);
}

console.log('\nDone. Sign in with tenant "' + SLUG + '", subject "idp|admin".');
