/**
 * @nexora/domain-hcm public application interface.
 */
export { EmployeeService, type EmployeeView } from './employee.service';
export {
  WorkforceService,
  type LeaveApprovalGate,
  type PayrollConnectorGate,
  type WorkforceConfigGate,
} from './workforce.service';
export {
  AttendanceMatrixService,
  DEFAULT_ATTENDANCE_STATUSES,
  type AttendanceModel,
  type AttendanceStatusDef,
  type GrantedLeaveGate,
} from './attendance.service';
export {
  PayrollService,
  SALARY_PERMISSIONS,
  type SalaryPermissionGate,
  type WorkedDaysGate,
} from './payroll.service';
export {
  CONTRACT_PLACEHOLDERS,
  EmploymentContractService,
  HCM_DOC_PERMISSIONS,
  type ContractTemplateGate,
  type ExpiryTaskGate,
  type PrivateDocumentGate,
} from './contract.service';
export { amountInWordsBs, integerInWordsBs } from './localization/amount-in-words-bs';
