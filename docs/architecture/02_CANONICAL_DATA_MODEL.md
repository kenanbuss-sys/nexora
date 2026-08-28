# Canonical Data Model

## Universal conventions
Every transactional aggregate carries immutable ID, tenant ownership, timestamps/actor, explicit lifecycle state and optimistic version where contention matters. No customer-specific columns.

Money is decimal + explicit currency. Quantities are decimal + UOM. Instants stored UTC; sites retain business timezone. External identities use governed mapping, not random provider columns.

```mermaid
erDiagram
  TENANT ||--o{ LEGAL_ENTITY : contains
  LEGAL_ENTITY ||--o{ BUSINESS_UNIT : contains
  BUSINESS_UNIT ||--o{ BRANCH : contains
  BUSINESS_UNIT ||--o{ FACTORY : contains
  TENANT ||--o{ USER : has
  USER }o--o{ ROLE : assigned
  TENANT ||--o{ PARTY : governs
  PARTY ||--o| CUSTOMER_ACCOUNT : may_be
  PARTY ||--o| SUPPLIER_ACCOUNT : may_be
  PRODUCT ||--o{ SKU : has
  SKU ||--o{ BARCODE : identified_by
  CUSTOMER_ACCOUNT ||--o{ QUOTE : receives
  CUSTOMER_ACCOUNT ||--o{ SALES_ORDER : places
  SALES_ORDER ||--o{ FULFILLMENT_ORDER : orchestrates
  WAREHOUSE ||--o{ WAREHOUSE_LOCATION : has
  SKU ||--o{ STOCK_MOVEMENT : moved
  SALES_ORDER ||--o{ STOCK_RESERVATION : reserves
  SUPPLIER_ACCOUNT ||--o{ PURCHASE_ORDER : receives
  PURCHASE_ORDER ||--o{ INBOUND_SHIPMENT : supplied_by
  INBOUND_SHIPMENT ||--o{ GOODS_RECEIPT : received_as
  PRODUCT_REVISION ||--o{ BOM_REVISION : defines
  PRODUCT_REVISION ||--o{ ROUTING_REVISION : routed_by
  SALES_ORDER ||--o{ WORK_ORDER : may_generate
  WORK_ORDER ||--o{ PRODUCTION_OPERATION : contains
  PRODUCTION_OPERATION ||--o{ VERIFICATION_EVENT : verified_by
  WORK_ORDER ||--o{ QUALITY_INSPECTION : checked_by
  FULFILLMENT_ORDER ||--o{ SHIPMENT : ships
```

## Inventory truth
Authoritative inputs: immutable StockMovement, StockReservation and inventory status dimensions (available/QC/damaged/blocked/lot/serial/location). Derived: on hand, reserved, available, incoming, QC hold.

## Product vs engineering
PIM Product/SKU = commercial/logistics identity. ENG ProductRevision/BOM/Routing = engineering/manufacturing definition. Configured order lines reference a released revision or an immutable order-specific specification.

## Party
Canonical Party prevents duplicate customer/supplier/contact universes; role-specific data belongs in customer/supplier profiles.

## Documents
Rendered PDF is evidence/output, not business truth. Preserve template version, source aggregate, rendered hash and issued snapshot.

## Audit vs events
Audit answers who changed what/from-to/when/source. Business events answer what business fact occurred. Audit is not the event bus.
