import { describe, expect, it } from 'vitest';
import { findTransition, validateWorkflowSpec } from './workflow-spec';

const valid = {
  initial: 'DRAFT',
  states: [{ name: 'DRAFT' }, { name: 'REVIEW' }, { name: 'APPROVED', terminal: true }],
  transitions: [
    { from: 'DRAFT', to: 'REVIEW', trigger: 'submit' },
    { from: 'REVIEW', to: 'APPROVED', trigger: 'approve', requiredPermission: 'approval.act' },
    { from: 'REVIEW', to: 'DRAFT', trigger: 'reject' },
  ],
};

describe('validateWorkflowSpec', () => {
  it('accepts a valid graph', () => {
    expect(validateWorkflowSpec(valid).initial).toBe('DRAFT');
  });

  it('rejects unknown initial state', () => {
    expect(() => validateWorkflowSpec({ ...valid, initial: 'NOPE' })).toThrowError(/Initial state/);
  });

  it('rejects transitions referencing unknown states', () => {
    expect(() =>
      validateWorkflowSpec({
        ...valid,
        transitions: [{ from: 'DRAFT', to: 'MISSING', trigger: 'go' }],
      }),
    ).toThrowError(/unknown state MISSING/);
  });

  it('rejects duplicate states and malformed names', () => {
    expect(() =>
      validateWorkflowSpec({
        ...valid,
        states: [...valid.states, { name: 'DRAFT' }],
      }),
    ).toThrowError(/Duplicate state/);
    expect(() =>
      validateWorkflowSpec({ ...valid, states: [{ name: 'lower' }], initial: 'lower' }),
    ).toThrowError();
  });
});

describe('findTransition', () => {
  const spec = validateWorkflowSpec(valid);

  it('finds an allowed transition with its permission and terminality', () => {
    const match = findTransition(spec, 'REVIEW', 'approve');
    expect(match).toEqual({ to: 'APPROVED', requiredPermission: 'approval.act', toTerminal: true });
  });

  it('returns null for a transition not allowed from the current state', () => {
    expect(findTransition(spec, 'DRAFT', 'approve')).toBeNull();
    expect(findTransition(spec, 'APPROVED', 'submit')).toBeNull();
  });
});
