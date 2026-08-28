# Domain Map & Data Ownership

Every mutable business concept has one owning bounded context. Other domains reference stable IDs and public queries/commands/events; they never write the owner's tables directly.

| Concept | Owner | Meaning |
|---|---|---|
| Tenant | **CORE** | Tenant identity/configuration/branding/module activation |
| LegalEntity | **CORE** | Legal organizational entity |
| BusinessUnit | **CORE** | Operational hierarchy |
| Branch | **CORE** | Retail/office branch |
| Factory | **CORE** | Manufacturing site |
| Warehouse | **WMS** | Inventory-holding site |
| WarehouseLocation | **WMS** | Zone/bin/rack/location |
| User | **IAM** | Application identity |
| Role | **IAM** | Permission bundle |
| PermissionGrant | **IAM** | Scoped authorization |
| Party | **MDM** | Canonical person/organization identity |
| CustomerAccount | **CRM** | Customer commercial profile |
| SupplierAccount | **PROC** | Supplier commercial profile |
| Product | **PIM** | Canonical product |
| SKU | **PIM** | Inventory/sellable item |
| Barcode | **PIM** | SKU/package identifier |
| PriceList | **CPQ** | Pricing master |
| Quote | **CPQ** | Commercial quotation/configuration snapshot |
| SalesOrder | **OMS** | Canonical accepted demand |
| FulfillmentOrder | **OMS** | Fulfillment instruction |
| StockMovement | **WMS** | Inventory ledger movement |
| StockReservation | **WMS** | Demand reservation |
| InventoryCount | **WMS** | Count session |
| PurchaseRequest | **PROC** | Procurement demand |
| PurchaseOrder | **PROC** | Supplier order |
| InboundShipment | **PROC** | Supplier/import shipment before receipt |
| GoodsReceipt | **WMS** | Physical receipt posting |
| BOM | **ENG** | Engineering/manufacturing material definition |
| Routing | **ENG** | Production operation definition |
| Forecast | **PLAN** | Demand plan |
| PlannedOrder | **PLAN** | MRP/APS recommendation |
| WorkOrder | **MES** | Production execution order |
| ProductionOperation | **MES** | Executable production step |
| WIPUnit | **MES** | Tracked work in progress |
| VerificationEvent | **VER** | Physical verification record |
| QualityInspection | **QMS** | Quality check/result |
| NCR | **QMS** | Nonconformance |
| Asset | **EAM** | Machine/tool/maintainable asset |
| MaintenanceOrder | **EAM** | Maintenance execution |
| ServiceOrder | **SVC** | After-sales/field service |
| Shipment | **LOG** | Outbound logistics |
| Project | **PRJ** | Project/job-cost container |
| Employee | **HCM** | Workforce master |
| Document | **DOC** | Controlled business document |
| Contract | **DOC** | Controlled agreement |
| OperationalFinancialEvent | **FIN** | Management-finance event |
| Budget | **FIN** | Budget/plan |
| KPIDefinition | **BI** | Governed metric |
| WorkflowDefinition | **WF** | Versioned workflow |
| WorkflowInstance | **WF** | Running process |
| RuleDefinition | **WF** | Versioned rule |
| IntegrationConnection | **INT** | External connector config |
| IntegrationRun | **INT** | Sync/run log |
| Device | **DEV** | Registered physical device |
| DeviceEvent | **DEV** | Canonical device event |
| AuditEvent | **CORE** | Immutable audit event |

| SupportCase | **CSM** | Customer support/case record |

| KnowledgeArticle | **CSM** | Approved support knowledge content |

| MarketingCampaign | **MKT** | Campaign definition |

| SustainabilityMetricRecord | **ESG** | Environmental/sustainability measurement |

## Dependency rules
- CORE/IAM are foundational and do not depend on commercial/operational domains.
- MDM owns canonical party/reference governance; CRM/PROC own role-specific profiles.
- PIM owns product identity; ENG owns released engineering definitions; WMS owns stock.
- OMS owns accepted customer demand regardless of channel.
- MES requests physical stock effects through WMS.
- FIN consumes operational facts and does not become stock truth.
- BI owns metric definitions/read models, never transaction truth.
- INT/DEV translate external/physical inputs; they do not own business outcomes.
- WF orchestrates permitted behavior but cannot bypass domain invariants.

## Forbidden examples
CRM updating stock; MES writing warehouse quantity columns; webshop maintaining authoritative inventory/order truth; vendor scanner SDK calling domain repositories; BI correcting transactions; tenant-name conditionals.
