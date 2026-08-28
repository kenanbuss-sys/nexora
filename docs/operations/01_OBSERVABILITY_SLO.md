# Observability & Service Objectives

Every request/job/event/integration/device sync carries correlation ID. Collect structured logs, traces, metrics, integration run logs and device health; audit remains a separate purpose.

Operations dashboards: API latency/errors, DB/Redis, queue/outbox lag, integration/webhook failures, device health/version, storage and tenant-level error/usage signals without sensitive leakage.

Design objectives: ordinary interactions feel sub-second; scan/check path optimized for near-immediate feedback; bulk work async; dashboard queries do not degrade OLTP.

Alert on high error rate, saturation, outbox/job backlog, repeated connector failure, backup failure and suspicious security events. Critical alerts require runbooks.
