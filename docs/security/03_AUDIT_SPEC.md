# Audit Specification

Audit event minimum: audit ID, tenant, actor type/ID, action, object type/ID, timestamp UTC, correlation ID, source channel/device/integration, previous/new values or meaningful diff where appropriate, reason for sensitive override, IP/session metadata when policy permits.

Audit is append-only and permission-restricted. Critical examples: permission/role changes, configuration publish, price override, order cancellation, stock adjustment, QC release override, work-order override, document issue/void, financial correction, support impersonation, bulk export and integration secret/config changes.

Do not store passwords, tokens or unnecessarily large/sensitive document bodies in audit payloads.
