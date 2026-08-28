import { describe, expect, it } from 'vitest';
import { isAllowed, type GrantedPermission } from './permissions';

const grants: GrantedPermission[] = [
  { permissionKey: 'order.read', scopeType: 'TENANT', scopeId: 't1' },
  { permissionKey: 'inventory.pick', scopeType: 'BRANCH', scopeId: 'branch-a' },
];

describe('isAllowed', () => {
  it('default-denies unknown permissions', () => {
    expect(isAllowed(grants, 'order.cancel')).toBe(false);
  });

  it('tenant-scoped grant covers any scope', () => {
    expect(isAllowed(grants, 'order.read')).toBe(true);
    expect(isAllowed(grants, 'order.read', { type: 'BRANCH', id: 'branch-x' })).toBe(true);
  });

  it('branch-scoped grant covers only its branch', () => {
    expect(isAllowed(grants, 'inventory.pick', { type: 'BRANCH', id: 'branch-a' })).toBe(true);
    expect(isAllowed(grants, 'inventory.pick', { type: 'BRANCH', id: 'branch-b' })).toBe(false);
    expect(isAllowed(grants, 'inventory.pick', { type: 'FACTORY', id: 'branch-a' })).toBe(false);
  });

  it('org-scoped grant does not satisfy a tenant-wide requirement', () => {
    expect(isAllowed(grants, 'inventory.pick')).toBe(false);
  });

  it('empty grants deny everything', () => {
    expect(isAllowed([], 'order.read')).toBe(false);
  });
});
