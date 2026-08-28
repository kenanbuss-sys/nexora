# Multi-Tenant & White-Label Architecture

## Isolation
Shared deployment uses mandatory tenant ownership in every shared record/query/cache/job/storage path. Dedicated deployment uses the same codebase/schema in a dedicated environment when scale, regulation or commercial terms justify it. PostgreSQL RLS may be added as defense in depth through ADR after connection-context design is validated.

## Tenant resolution
Trust verified custom domain -> authenticated session claims -> server tenant context. Never trust arbitrary client-supplied tenant ID as authority.

## Deep white-label
Configurable domain/subdomains, app title, logo/favicon, color/typography tokens, login shell, navigation, enabled modules, terminology, dashboards, documents, emails, locale/currency/UOM, portal theme, integrations, device profiles, custom objects/fields/forms.

## Configuration Studio
Authorized implementers configure organization, modules, roles, fields/objects, forms, workflows, rules, documents, dashboards, integrations, devices, branding and terminology.

Forbidden: tenant-name conditionals. Allowed: capability config, feature flag, workflow, rule, template, extension point.
