# Event Architecture

## Envelope
```json
{"eventId":"uuid","eventType":"order.confirmed","eventVersion":1,"tenantId":"uuid","aggregateType":"SalesOrder","aggregateId":"uuid","occurredAt":"UTC","actor":{"type":"user|service|device","id":"..."},"correlationId":"uuid","causationId":"uuid|null","payload":{}}
```

Rules: state change + outbox in one DB transaction; consumers idempotent; breaking contract -> version; no secrets/unnecessary personal data; retries cannot duplicate physical/financial effects.

| Event | Owner | Meaning | Required payload |
|---|---|---|---|
| `tenant.created` | CORE | Tenant created | tenantId |
| `tenant.configuration.changed` | CORE | Configuration published | tenantId, configVersion |
| `user.invited` | IAM | User invitation created | userId, email |
| `permission.changed` | IAM | Authorization changed | subjectId, scope |
| `party.created` | MDM | Canonical party created | partyId |
| `customer.approved` | CRM | Customer onboarding approved | customerId |
| `product.created` | PIM | Product created | productId |
| `sku.activated` | PIM | SKU activated | skuId |
| `price_list.published` | CPQ | Price list effective | priceListId, version |
| `quote.created` | CPQ | Quote created | quoteId, customerId |
| `quote.approved` | CPQ | Quote approved | quoteId |
| `quote.accepted` | CPQ | Quote accepted | quoteId |
| `order.created` | OMS | Sales order captured | orderId, customerId, channel |
| `order.validated` | OMS | Order validation passed | orderId |
| `order.confirmed` | OMS | Order firm demand | orderId |
| `order.held` | OMS | Order held | orderId, reason |
| `order.released` | OMS | Hold released | orderId |
| `order.cancelled` | OMS | Order cancelled | orderId, reason |
| `order.fulfillment.planned` | OMS | Fulfillment plan generated | orderId, fulfillmentIds |
| `stock.reserved` | WMS | Inventory reserved | reservationId, skuId, quantity, locationScope |
| `stock.released` | WMS | Reservation released | reservationId |
| `stock.moved` | WMS | Stock movement posted | movementId, skuId, quantity, from, to |
| `goods.receipt.created` | WMS | Receiving session created | receiptId, inboundShipmentId |
| `goods.received` | WMS | Receipt posted | receiptId |
| `goods.receipt.discrepancy` | WMS | Inbound discrepancy | receiptId, type |
| `inventory.count.started` | WMS | Count started | countId |
| `inventory.adjustment.requested` | WMS | Adjustment requested | adjustmentId |
| `inventory.adjusted` | WMS | Adjustment posted | adjustmentId |
| `transfer.created` | WMS | Transfer created | transferId |
| `transfer.dispatched` | WMS | Transfer dispatched | transferId |
| `transfer.received` | WMS | Transfer received | transferId |
| `pick.task.created` | WMS | Pick task created | pickTaskId |
| `pick.completed` | WMS | Pick completed | pickTaskId |
| `pack.completed` | WMS | Pack completed | packTaskId, packageIds |
| `purchase.requested` | PROC | Purchase demand requested | purchaseRequestId |
| `purchase.approved` | PROC | Purchase request approved | purchaseRequestId |
| `purchase_order.issued` | PROC | PO issued | purchaseOrderId |
| `purchase_order.acknowledged` | PROC | Supplier acknowledged PO | purchaseOrderId |
| `inbound_shipment.created` | PROC | Inbound created | inboundShipmentId |
| `inbound_shipment.arrived` | PROC | Inbound arrived | inboundShipmentId |
| `landed_cost.allocated` | PROC | Landed cost allocated | allocationId |
| `bom.revision.released` | ENG | BOM revision released | bomRevisionId |
| `routing.revision.released` | ENG | Routing released | routingRevisionId |
| `engineering_change.approved` | ENG | Engineering change approved | changeOrderId |
| `forecast.published` | PLAN | Forecast published | forecastId, version |
| `mrp.run.completed` | PLAN | MRP completed | mrpRunId |
| `planned_order.created` | PLAN | Planned supply created | plannedOrderId, type |
| `work_order.created` | MES | Work order created | workOrderId |
| `work_order.released` | MES | Work order released | workOrderId |
| `work_order.started` | MES | Work started | workOrderId |
| `work_order.completed` | MES | Work completed | workOrderId, goodQty, scrapQty |
| `work_order.cancelled` | MES | Work cancelled | workOrderId, reason |
| `operation.ready` | MES | Operation ready | operationId |
| `operation.started` | MES | Operation started | operationId, operatorId, machineId |
| `operation.paused` | MES | Operation paused | operationId, reason |
| `operation.completed` | MES | Operation completed | operationId, goodQty, scrapQty |
| `material.issued_to_production` | MES | Material issued | workOrderId, stockMovementIds |
| `scrap.recorded` | MES | Scrap recorded | scrapId, workOrderId |
| `rework.created` | MES | Rework created | reworkId |
| `verification.passed` | VER | Verification passed | verificationId, type, subjectId |
| `verification.failed` | VER | Verification blocked | verificationId, type, reason |
| `qc.inspection.created` | QMS | Inspection required | inspectionId |
| `qc.passed` | QMS | Inspection passed | inspectionId |
| `qc.failed` | QMS | Inspection failed | inspectionId |
| `ncr.created` | QMS | Nonconformance created | ncrId |
| `capa.created` | QMS | CAPA opened | capaId |
| `asset.breakdown.reported` | EAM | Breakdown reported | assetId, ticketId |
| `maintenance_order.created` | EAM | Maintenance created | maintenanceOrderId |
| `maintenance_order.completed` | EAM | Maintenance completed | maintenanceOrderId |
| `service_order.created` | SVC | Service created | serviceOrderId |
| `service_order.completed` | SVC | Service completed | serviceOrderId |
| `rma.created` | SVC | RMA created | rmaId |
| `shipment.created` | LOG | Shipment created | shipmentId |
| `shipment.dispatched` | LOG | Shipment dispatched | shipmentId |
| `shipment.delivered` | LOG | Shipment delivered | shipmentId |
| `delivery.exception` | LOG | Delivery exception | shipmentId, reason |
| `document.issued` | DOC | Document issued | documentId, type |
| `contract.expiring` | DOC | Contract approaching expiry | contractId |
| `invoice.issued` | FIN | Operational invoice issued/imported | invoiceId |
| `payment.received` | FIN | Payment received/imported | paymentId |
| `payment.matched` | FIN | Payment matched | paymentId |
| `budget.published` | FIN | Budget published | budgetId, version |
| `integration.failed` | INT | Integration failed | connectionId, runId |
| `integration.recovered` | INT | Integration recovered | connectionId |
| `device.enrolled` | DEV | Device enrolled | deviceId |
| `device.offline` | DEV | Device offline | deviceId |
| `device.event.received` | DEV | Canonical physical event | deviceEventId, type |
| `workflow.started` | WF | Workflow started | workflowInstanceId, definitionVersion |
| `workflow.transitioned` | WF | Workflow transitioned | workflowInstanceId, from, to |
| `approval.requested` | WF | Approval requested | approvalId |
| `approval.granted` | WF | Approval granted | approvalId |
| `approval.rejected` | WF | Approval rejected | approvalId |
