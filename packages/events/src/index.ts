import type { Db, Prisma } from '@nexora/db';
import { getOrCreateCorrelationId } from '@nexora/observability';

/**
 * Transactional outbox writer (docs/architecture/03_EVENT_ARCHITECTURE.md).
 *
 * State change + outbox row happen in ONE database transaction — pass the
 * transaction client. The worker dispatches PENDING rows; consumers must be
 * idempotent.
 */

/** Canonical event types published in Sprint 001 (specs/events.json). */
export const EVENT_TYPES = {
  TENANT_CREATED: 'tenant.created',
  TENANT_CONFIGURATION_CHANGED: 'tenant.configuration.changed',
  USER_INVITED: 'user.invited',
  PERMISSION_CHANGED: 'permission.changed',
  WORKFLOW_STARTED: 'workflow.started',
  WORKFLOW_TRANSITIONED: 'workflow.transitioned',
  APPROVAL_REQUESTED: 'approval.requested',
  APPROVAL_GRANTED: 'approval.granted',
  APPROVAL_REJECTED: 'approval.rejected',
  PARTY_CREATED: 'party.created',
  PRODUCT_CREATED: 'product.created',
  SKU_ACTIVATED: 'sku.activated',
  STOCK_MOVED: 'stock.moved',
  STOCK_RESERVED: 'stock.reserved',
  STOCK_RELEASED: 'stock.released',
  DEVICE_ENROLLED: 'device.enrolled',
  DEVICE_EVENT_RECEIVED: 'device.event.received',
  GOODS_RECEIPT_CREATED: 'goods.receipt.created',
  TRANSFER_CREATED: 'transfer.created',
  TRANSFER_RECEIVED: 'transfer.received',
  INVENTORY_COUNT_STARTED: 'inventory.count.started',
  PICK_TASK_CREATED: 'pick.task.created',
  PICK_COMPLETED: 'pick.completed',
  CUSTOMER_APPROVED: 'customer.approved',
  PRICE_LIST_PUBLISHED: 'price_list.published',
  QUOTE_CREATED: 'quote.created',
  QUOTE_APPROVED: 'quote.approved',
  QUOTE_ACCEPTED: 'quote.accepted',
  ORDER_CREATED: 'order.created',
  ORDER_VALIDATED: 'order.validated',
  ORDER_CONFIRMED: 'order.confirmed',
  ORDER_HELD: 'order.held',
  ORDER_RELEASED: 'order.released',
  ORDER_CANCELLED: 'order.cancelled',
  ORDER_FULFILLMENT_PLANNED: 'order.fulfillment.planned',
  PURCHASE_REQUESTED: 'purchase.requested',
  PURCHASE_APPROVED: 'purchase.approved',
  PURCHASE_ORDER_ISSUED: 'purchase_order.issued',
  PURCHASE_ORDER_ACKNOWLEDGED: 'purchase_order.acknowledged',
  BOM_REVISION_RELEASED: 'bom.revision.released',
  ROUTING_REVISION_RELEASED: 'routing.revision.released',
  ENGINEERING_CHANGE_APPROVED: 'engineering_change.approved',
  MRP_RUN_COMPLETED: 'mrp.run.completed',
  PLANNED_ORDER_CREATED: 'planned_order.created',
  WORK_ORDER_CREATED: 'work_order.created',
  WORK_ORDER_RELEASED: 'work_order.released',
  WORK_ORDER_STARTED: 'work_order.started',
  WORK_ORDER_COMPLETED: 'work_order.completed',
  WORK_ORDER_CANCELLED: 'work_order.cancelled',
  MATERIAL_ISSUED_TO_PRODUCTION: 'material.issued_to_production',
  SCRAP_RECORDED: 'scrap.recorded',
  QC_INSPECTION_CREATED: 'qc.inspection.created',
  QC_PASSED: 'qc.passed',
  QC_FAILED: 'qc.failed',
  NCR_CREATED: 'ncr.created',
  INVOICE_ISSUED: 'invoice.issued',
  PAYMENT_RECEIVED: 'payment.received',
  PAYMENT_MATCHED: 'payment.matched',
  COMMENT_ADDED: 'comment.added',
  ORDER_AMENDED: 'order.amended',
  RETURN_REQUESTED: 'return.requested',
  RETURN_APPROVED: 'return.approved',
  RETURN_REJECTED: 'return.rejected',
  RETURN_RECEIVED: 'return.received',
  STOCK_COUNT_POSTED: 'stock_count.posted',
  BACKORDER_CREATED: 'backorder.created',
  BACKORDER_RELEASED: 'backorder.released',
  ATTACHMENT_UPLOADED: 'attachment.uploaded',
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

export interface BusinessEvent {
  tenantId: string;
  eventType: EventType;
  eventVersion?: number | undefined;
  aggregateType: string;
  aggregateId: string;
  actorType: 'USER' | 'SERVICE' | 'SYSTEM';
  actorId?: string | undefined;
  payload: Prisma.InputJsonValue;
  causationId?: string | undefined;
  correlationId?: string | undefined;
}

export async function publishToOutbox(db: Db, event: BusinessEvent): Promise<void> {
  await db.outboxEvent.create({
    data: {
      tenantId: event.tenantId,
      eventType: event.eventType,
      eventVersion: event.eventVersion ?? 1,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      actorType: event.actorType,
      actorId: event.actorId ?? null,
      correlationId: event.correlationId ?? getOrCreateCorrelationId(),
      causationId: event.causationId ?? null,
      payload: event.payload,
    },
  });
}
