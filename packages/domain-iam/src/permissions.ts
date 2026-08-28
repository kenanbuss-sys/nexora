/**
 * IAM — permission evaluation (docs/security/04_PERMISSION_MODEL.md).
 *
 * Evaluation order: authenticated identity -> tenant -> account active ->
 * permission -> scope. Default deny. Approval authority and field/record
 * policies arrive in later sprints.
 *
 * The scope matcher is a pure function so it is unit-testable without a DB.
 */

export type PermissionScopeType =
  'TENANT' | 'LEGAL_ENTITY' | 'BUSINESS_UNIT' | 'BRANCH' | 'FACTORY';

export interface GrantedPermission {
  permissionKey: string;
  scopeType: PermissionScopeType;
  scopeId: string;
}

export interface ScopeRef {
  type: Exclude<PermissionScopeType, 'TENANT'>;
  id: string;
}

/**
 * Does a set of granted permissions allow `permissionKey` at `scope`?
 *
 * - A TENANT-scoped grant covers every scope in the tenant.
 * - An org-scoped grant covers exactly its node (hierarchy expansion is a
 *   later-sprint concern and must stay server-side when it arrives).
 * - No scope requested => any grant of the key suffices.
 */
export function isAllowed(
  grants: readonly GrantedPermission[],
  permissionKey: string,
  scope?: ScopeRef,
): boolean {
  for (const grant of grants) {
    if (grant.permissionKey !== permissionKey) continue;
    if (grant.scopeType === 'TENANT') return true;
    if (!scope) continue; // org-scoped grant cannot satisfy an unscoped (tenant-wide) requirement
    if (grant.scopeType === scope.type && grant.scopeId === scope.id) return true;
  }
  return false;
}
