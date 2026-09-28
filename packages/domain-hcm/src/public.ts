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
