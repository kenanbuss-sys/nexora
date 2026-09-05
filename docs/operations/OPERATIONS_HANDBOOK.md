# NexoraOS — Operations handbook

The short version for whoever runs a self-hosted NexoraOS. The
authoritative install steps live in
[deployment/SELF_HOSTING.md](../deployment/SELF_HOSTING.md); a Bosnian
quick start is in [deployment/BRZI_START.md](../deployment/BRZI_START.md).

## Identity & access

- **Password sign-in** (`POST /auth/login`): scrypt hashes only, five
  failed attempts lock the account for 15 minutes, every outcome lands
  in the security event log (Users → Security log).
- **Admin resets** (Users → Set password) force a change at first
  sign-in and clear any lockout.
- **MFA (TOTP)**: self-service under Users → Two-factor authentication.
  Armed accounts demand a 6-digit code at login.
- **Step-up**: the tenant data export re-asks for the password and the
  elevation lasts 5 minutes.
- **API keys** (Users → API keys): `nxk_…` shown once, stored hashed,
  authorized against an explicit permission allowlist.
- Access is default-deny; roles grant permissions. Hidden UI is never
  the authorization — the server checks every call.

## Tenant configuration (Settings)

All of it is versioned: every publish creates an immutable
configuration version (history on the Settings page).

- **Branding**: workspace name + accent colors, applied as design tokens.
- **Modules**: switching one off removes its pages *and* its API
  (server-side guard), per tenant.
- **Terminology**: per-locale navigation vocabulary.
- **Approvals**: the requisition threshold; the effective value is
  recorded in every approval title.

## Data

- **Inventory is a ledger.** Stock is the sum of immutable movements;
  corrections are new movements (counts post ADJUSTMENT_IN/OUT with
  segregation of duties — the counter cannot post their own count).
- **Imports** (Import/export page) are idempotent: re-running a file
  skips existing rows; opening stock uses idempotency keys.
- **Exports**: CSV per entity any time; the full JSON tenant export is
  audited and step-up protected.
- **Data quality** (Parties page): live report of missing e-mails,
  duplicate names, unassigned territories, SKUs without barcodes,
  products without SKUs, suppliers without lead times.
- **Consents** (GDPR, Parties page): append-only per channel; the
  current state is the newest record and nothing is ever deleted.

## Routine operations

| Task              | How                                                                                       |
| ----------------- | ----------------------------------------------------------------------------------------- |
| Update            | `cd /opt/nexora && git pull && docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build` |
| DB backup         | `docker compose … exec -T db pg_dump -U app enterprise_os > backup-$(date +%F).sql`        |
| Restore           | `cat backup.sql \| docker compose … exec -T db psql -U app enterprise_os`                  |
| Logs              | `docker compose … logs -f api worker web`                                                  |
| Health            | `GET /api/v1/health` (DB + Redis)                                                          |

## Troubleshooting

- **Certificate not issued**: the A record must point at the server
  before the first visit; Caddy retries automatically.
- **Account locked**: wait 15 minutes, or an admin resets the password
  (clears the lock immediately).
- **Module page missing**: check Settings → Modules — a disabled module
  removes its navigation and API on purpose.
- **Import rows skipped**: that is the idempotency working — the rows
  already exist; the per-row report says so explicitly.
