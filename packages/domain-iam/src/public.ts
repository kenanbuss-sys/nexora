/**
 * @nexora/domain-iam public application interface.
 * Other domains and apps import ONLY from here.
 */
export { UserService, type UserView } from './user.service';
export { RoleService, type AssignScopeType, type RoleView } from './role.service';
export {
  isAllowed,
  type GrantedPermission,
  type PermissionScopeType,
  type ScopeRef,
} from './permissions';
