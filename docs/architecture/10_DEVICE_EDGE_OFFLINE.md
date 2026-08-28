# Device Hub, Industrial Edge & Offline Operations

A physical device produces input/events; it never owns business logic.

Ports: Scanner, Printer, RFID, NFC, Camera, Signature, Scale, Machine. Vendor implementations may target handheld scanners, built-in/Bluetooth/network/industrial printers, RFID, scales, Android kiosks/tablets and PLC/OPC UA gateways.

Device registry stores device ID, tenant, site/work center, model, capabilities, app version, assignment, last seen, online state, enrollment/revocation and supported health telemetry.

Verification can require worker, work order, SKU/material, lot/serial, machine, tool, location, quantity, QC, supervisor, photo/signature. Wrong required input blocks transition.

Offline events are append-only locally, sequence-aware, carry device/tenant/idempotency keys, and are re-authorized/revalidated server-side on replay. Duplicates are harmless; conflicts become explicit resolution work.

Machine signals may provide state/cycle/count/alarm/meter/telemetry but never bypass work-order association or domain validation.
