# Mobile & Shop-floor UX

Mobile primary flows: receive, putaway, count, pick, pack, transfer, material issue, work-order operation, QC, service/field, photos/signatures.

Design: scan-first, large touch targets, minimal typing, one primary action, clear offline state, hardware success/failure feedback where supported.

Kiosk typical flow: SCAN ID -> SCAN WORK ORDER -> VERIFY MACHINE/MATERIAL -> START -> INSTRUCTIONS -> CHECKS -> COMPLETE. No full ERP navigation.

Wrong scan is blocking and shows expected vs scanned plus safe recovery. Supervisor override only if configured, permissioned and audited.

Offline always shows pending, synced/rejected and last-sync status; do not falsely show authoritative completion when server validation is required.
