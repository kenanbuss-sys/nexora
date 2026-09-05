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
export {
  ServiceAccountService,
  type ApiKeyView,
  type ResolvedApiKey,
  type SecurityEventView,
} from './service-account.service';
export {
  CredentialService,
  hashPassword,
  totpCode,
  verifyPassword,
  verifyTotp,
  type LoginResult,
} from './credential.service';
