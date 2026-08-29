import { describe, expect, it } from 'vitest';
import { matchesConditions, validateRuleSpec } from './rule-spec';

describe('validateRuleSpec', () => {
  it('accepts a valid rule', () => {
    const spec = validateRuleSpec({
      when: 'tenant.configuration.changed',
      if: [{ path: 'configVersion', op: 'gt', value: 1 }],
      then: [{ action: 'create_task', title: 'Review configuration change' }],
    });
    expect(spec.when).toBe('tenant.configuration.changed');
  });

  it('rejects unknown actions and empty then', () => {
    expect(() =>
      validateRuleSpec({ when: 'a.b', if: [], then: [{ action: 'run_code' }] }),
    ).toThrowError();
    expect(() => validateRuleSpec({ when: 'a.b', if: [], then: [] })).toThrowError();
  });
});

describe('matchesConditions', () => {
  const payload = { tenantId: 't1', configVersion: 3, nested: { flag: true } };

  it('matches eq/ne/gt/lt/exists', () => {
    expect(matchesConditions([{ path: 'configVersion', op: 'eq', value: 3 }], payload)).toBe(true);
    expect(matchesConditions([{ path: 'configVersion', op: 'ne', value: 4 }], payload)).toBe(true);
    expect(matchesConditions([{ path: 'configVersion', op: 'gt', value: 2 }], payload)).toBe(true);
    expect(matchesConditions([{ path: 'configVersion', op: 'lt', value: 2 }], payload)).toBe(false);
    expect(matchesConditions([{ path: 'nested.flag', op: 'exists' }], payload)).toBe(true);
    expect(matchesConditions([{ path: 'missing', op: 'exists' }], payload)).toBe(false);
  });

  it('all conditions must hold (AND semantics); empty set matches', () => {
    expect(
      matchesConditions(
        [
          { path: 'configVersion', op: 'gt', value: 1 },
          { path: 'tenantId', op: 'eq', value: 't1' },
        ],
        payload,
      ),
    ).toBe(true);
    expect(
      matchesConditions(
        [
          { path: 'configVersion', op: 'gt', value: 1 },
          { path: 'tenantId', op: 'eq', value: 'other' },
        ],
        payload,
      ),
    ).toBe(false);
    expect(matchesConditions([], payload)).toBe(true);
  });

  it('type-mismatched comparisons fail closed', () => {
    expect(matchesConditions([{ path: 'tenantId', op: 'gt', value: 1 }], payload)).toBe(false);
  });
});
