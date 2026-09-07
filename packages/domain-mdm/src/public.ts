/**
 * @nexora/domain-mdm public application interface.
 */
export { normalizeName, PartyService, type PartyView } from './party.service';
export { DataQualityService, type QualityCheck, type QualityReport } from './quality.service';
export { ConsentService, type ConsentRecordView, type ConsentStateView } from './consent.service';
export {
  MasterDataApprovalService,
  type ChangeRequestView,
  type PartyUpdateGate,
  type ProductUpdateGate,
} from './approval.service';
export { UomService, DEFAULT_UOMS, type UomConfigGate, type UomView } from './uom.service';
