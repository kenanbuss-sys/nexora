# API Conventions

REST/OpenAPI first. Base `/api/v1`. Important business transitions use explicit command endpoints such as `POST /orders/{id}/confirm`.

Every request gets actor, resolved tenant, correlation ID, locale/timezone, and device/service identity where relevant.

Canonical error: stable `code`, human-safe `message`, `correlationId`, `details`, `fieldErrors`; never stack trace/secrets.

Cursor pagination for high-volume collections; allowlisted filter/sort fields; asynchronous jobs for expensive bulk work.

External/retriable mutations use idempotency keys. High-contention aggregate conflicts return 409 stable error.

Public integration API is narrower and explicitly versioned. Webhooks are signed, timestamped, replay-protected, versioned, retried and observable.
