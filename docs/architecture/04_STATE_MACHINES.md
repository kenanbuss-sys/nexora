# Canonical State Machines

Server-enforced. UI actions are projections of allowed transitions. Invalid transition is a domain error. Once downstream physical/financial effects exist, reversal uses compensation rather than history deletion.

## SalesOrder
Initial: `DRAFT`

| From | Action | To |
|---|---|---|
| DRAFT | `submit` | VALIDATING |
| VALIDATING | `validation_passed` | CONFIRMED |
| VALIDATING | `validation_failed` | DRAFT |
| CONFIRMED | `hold` | ON_HOLD |
| ON_HOLD | `release_hold` | CONFIRMED |
| CONFIRMED | `fulfillment_started` | IN_FULFILLMENT |
| IN_FULFILLMENT | `partial` | PARTIALLY_FULFILLED |
| IN_FULFILLMENT | `all_fulfilled` | FULFILLED |
| PARTIALLY_FULFILLED | `all_fulfilled` | FULFILLED |
| DRAFT | `cancel` | CANCELLED |
| CONFIRMED | `cancel_if_reversible` | CANCELLED |
| FULFILLED | `close` | CLOSED |

## PurchaseOrder
Initial: `DRAFT`

| From | Action | To |
|---|---|---|
| DRAFT | `submit` | PENDING_APPROVAL |
| PENDING_APPROVAL | `approve` | APPROVED |
| PENDING_APPROVAL | `reject` | DRAFT |
| APPROVED | `issue` | ISSUED |
| ISSUED | `supplier_ack` | ACKNOWLEDGED |
| ACKNOWLEDGED | `receive_partial` | PARTIALLY_RECEIVED |
| ACKNOWLEDGED | `receive_all` | RECEIVED |
| PARTIALLY_RECEIVED | `receive_remaining` | RECEIVED |
| DRAFT | `cancel` | CANCELLED |
| APPROVED | `cancel_before_issue` | CANCELLED |
| RECEIVED | `close` | CLOSED |

## GoodsReceipt
Initial: `OPEN`

| From | Action | To |
|---|---|---|
| OPEN | `start` | COUNTING |
| COUNTING | `difference_found` | DISCREPANCY |
| COUNTING | `qc_required` | QC_HOLD |
| COUNTING | `count_complete` | READY_TO_POST |
| DISCREPANCY | `resolve` | READY_TO_POST |
| QC_HOLD | `qc_release` | READY_TO_POST |
| READY_TO_POST | `post` | POSTED |
| OPEN | `void` | VOIDED |

## TransferOrder
Initial: `DRAFT`

| From | Action | To |
|---|---|---|
| DRAFT | `release` | RELEASED |
| RELEASED | `pick_start` | PICKING |
| PICKING | `dispatch` | DISPATCHED |
| DISPATCHED | `depart` | IN_TRANSIT |
| IN_TRANSIT | `partial_receive` | PARTIALLY_RECEIVED |
| IN_TRANSIT | `receive_all` | RECEIVED |
| PARTIALLY_RECEIVED | `receive_remaining` | RECEIVED |
| DRAFT | `cancel` | CANCELLED |
| RELEASED | `cancel_before_pick` | CANCELLED |
| RECEIVED | `close` | CLOSED |

## FulfillmentOrder
Initial: `PLANNED`

| From | Action | To |
|---|---|---|
| PLANNED | `release` | RELEASED |
| RELEASED | `pick_start` | PICKING |
| PICKING | `pick_complete` | PICKED |
| PICKED | `pack_start` | PACKING |
| PACKING | `pack_complete` | PACKED |
| PACKED | `ship` | SHIPPED |
| PACKED | `customer_collect` | COLLECTED |
| PLANNED | `cancel` | CANCELLED |

## WorkOrder
Initial: `PLANNED`

| From | Action | To |
|---|---|---|
| PLANNED | `material_shortage` | MATERIAL_HOLD |
| MATERIAL_HOLD | `material_resolved` | PLANNED |
| PLANNED | `release` | RELEASED |
| RELEASED | `start` | IN_PROGRESS |
| IN_PROGRESS | `pause` | PAUSED |
| PAUSED | `resume` | IN_PROGRESS |
| IN_PROGRESS | `qc_required` | QC_HOLD |
| QC_HOLD | `qc_rework` | IN_PROGRESS |
| QC_HOLD | `qc_release` | COMPLETED |
| IN_PROGRESS | `all_ops_complete` | COMPLETED |
| PLANNED | `cancel` | CANCELLED |
| COMPLETED | `close` | CLOSED |

## ProductionOperation
Initial: `PENDING`

| From | Action | To |
|---|---|---|
| PENDING | `dependency_missing` | BLOCKED |
| PENDING | `dependencies_met` | READY |
| BLOCKED | `unblocked` | READY |
| READY | `start_with_required_verifications` | IN_PROGRESS |
| IN_PROGRESS | `pause` | PAUSED |
| PAUSED | `resume` | IN_PROGRESS |
| IN_PROGRESS | `completion_requires_check` | AWAITING_CHECK |
| AWAITING_CHECK | `check_passed` | COMPLETED |
| IN_PROGRESS | `complete` | COMPLETED |
| AWAITING_CHECK | `check_failed` | FAILED |

## QualityInspection
Initial: `PENDING`

| From | Action | To |
|---|---|---|
| PENDING | `start` | IN_PROGRESS |
| IN_PROGRESS | `pass` | PASSED |
| IN_PROGRESS | `fail` | FAILED |
| IN_PROGRESS | `conditional_release` | CONDITIONAL |
| PENDING | `void` | VOIDED |

## Shipment
Initial: `DRAFT`

| From | Action | To |
|---|---|---|
| DRAFT | `ready` | READY |
| READY | `dispatch` | DISPATCHED |
| DISPATCHED | `carrier_accept` | IN_TRANSIT |
| IN_TRANSIT | `deliver` | DELIVERED |
| IN_TRANSIT | `partial` | PARTIALLY_DELIVERED |
| IN_TRANSIT | `exception` | EXCEPTION |
| EXCEPTION | `resume` | IN_TRANSIT |
| EXCEPTION | `return` | RETURNING |
| RETURNING | `returned` | RETURNED |
| DRAFT | `cancel` | CANCELLED |

## ServiceOrder
Initial: `NEW`

| From | Action | To |
|---|---|---|
| NEW | `triage` | TRIAGE |
| TRIAGE | `approval_needed` | WAITING_CUSTOMER |
| TRIAGE | `parts_needed` | WAITING_PARTS |
| TRIAGE | `schedule` | SCHEDULED |
| WAITING_CUSTOMER | `customer_approved` | SCHEDULED |
| WAITING_PARTS | `parts_available` | SCHEDULED |
| SCHEDULED | `start` | IN_PROGRESS |
| IN_PROGRESS | `repair_complete` | QC |
| QC | `qc_pass` | COMPLETED |
| QC | `qc_fail_rework` | IN_PROGRESS |
| NEW | `cancel` | CANCELLED |
| COMPLETED | `close` | CLOSED |

## Approval
Initial: `PENDING`

| From | Action | To |
|---|---|---|
| PENDING | `approve` | APPROVED |
| PENDING | `reject` | REJECTED |
| PENDING | `cancel` | CANCELLED |
| PENDING | `timeout` | EXPIRED |

## Invoice
Initial: `DRAFT`

| From | Action | To |
|---|---|---|
| DRAFT | `issue` | ISSUED |
| ISSUED | `partial_payment` | PARTIALLY_PAID |
| ISSUED | `full_payment` | PAID |
| PARTIALLY_PAID | `full_payment` | PAID |
| ISSUED | `due_date_passed` | OVERDUE |
| PARTIALLY_PAID | `due_date_passed` | OVERDUE |
| DRAFT | `void` | VOIDED |
| ISSUED | `credit` | CREDITED |

## InventoryCount
Initial: `PLANNED`

| From | Action | To |
|---|---|---|
| PLANNED | `freeze_scope` | FROZEN |
| FROZEN | `start` | COUNTING |
| COUNTING | `variance_threshold` | RECOUNT_REQUIRED |
| RECOUNT_REQUIRED | `recount` | COUNTING |
| COUNTING | `submit` | PENDING_APPROVAL |
| PENDING_APPROVAL | `approve_and_post` | POSTED |
| PLANNED | `cancel` | CANCELLED |

## NCR
Initial: `OPEN`

| From | Action | To |
|---|---|---|
| OPEN | `contain` | CONTAINED |
| CONTAINED | `analyze` | UNDER_ANALYSIS |
| UNDER_ANALYSIS | `root_cause_confirmed` | ACTION_REQUIRED |
| ACTION_REQUIRED | `actions_completed` | VERIFYING |
| VERIFYING | `effective` | CLOSED |
| VERIFYING | `ineffective` | ACTION_REQUIRED |
| OPEN | `void` | VOIDED |

## CAPA
Initial: `OPEN`

| From | Action | To |
|---|---|---|
| OPEN | `approve_plan` | PLANNED |
| PLANNED | `start` | IN_PROGRESS |
| IN_PROGRESS | `complete_actions` | VERIFYING |
| VERIFYING | `verify_effective` | EFFECTIVE |
| VERIFYING | `verify_ineffective` | INEFFECTIVE |
| INEFFECTIVE | `replan` | PLANNED |
| EFFECTIVE | `close` | CLOSED |
| OPEN | `cancel` | CANCELLED |

## MaintenanceOrder
Initial: `NEW`

| From | Action | To |
|---|---|---|
| NEW | `plan` | PLANNED |
| PLANNED | `parts_short` | WAITING_PARTS |
| PLANNED | `schedule` | SCHEDULED |
| WAITING_PARTS | `parts_available` | SCHEDULED |
| SCHEDULED | `start` | IN_PROGRESS |
| IN_PROGRESS | `pause` | PAUSED |
| PAUSED | `resume` | IN_PROGRESS |
| IN_PROGRESS | `complete` | COMPLETED |
| NEW | `cancel` | CANCELLED |
| COMPLETED | `close` | CLOSED |

## RMA
Initial: `REQUESTED`

| From | Action | To |
|---|---|---|
| REQUESTED | `authorize` | AUTHORIZED |
| REQUESTED | `reject` | REJECTED |
| AUTHORIZED | `ship_return` | IN_TRANSIT |
| IN_TRANSIT | `receive` | RECEIVED |
| RECEIVED | `inspect` | INSPECTING |
| INSPECTING | `decide` | DISPOSITIONED |
| DISPOSITIONED | `complete` | CLOSED |
| AUTHORIZED | `cancel` | CANCELLED |

## Contract
Initial: `DRAFT`

| From | Action | To |
|---|---|---|
| DRAFT | `submit` | UNDER_REVIEW |
| UNDER_REVIEW | `approve` | APPROVED |
| UNDER_REVIEW | `reject` | DRAFT |
| APPROVED | `activate` | ACTIVE |
| ACTIVE | `suspend` | SUSPENDED |
| SUSPENDED | `resume` | ACTIVE |
| ACTIVE | `expire` | EXPIRED |
| ACTIVE | `terminate` | TERMINATED |
| ACTIVE | `replace` | SUPERSEDED |

