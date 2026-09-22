import { describe, it, expect } from 'vitest';
import { identityKey, resolveIdentityKey } from '../identity-key';
import type { Identity } from '../jmap/types';

const identity = (id: string, email: string, name?: string) =>
  ({ id, email, name } as Identity);

// What a member of three shared mailboxes actually sees: every group
// account numbers its own identity from scratch, so all three are "b".
const KEVIN = identity('c', 'kevin@example.com', 'Kevin');
const LOOKUP = {
  identities: [KEVIN],
  identitiesByAccount: {
    g: [KEVIN],
    c: [identity('b', 'support@example.com', 'Support')],
    d: [identity('b', 'info@example.com', 'Info')],
    e: [identity('b', 'billing@example.com', 'Billing')],
  },
  primaryAccountId: 'g',
  primaryIdentity: KEVIN,
};

describe('identity keys across accounts', () => {
  it('tells apart three identities that share an id', () => {
    for (const [accountId, email] of [
      ['c', 'support@example.com'],
      ['d', 'info@example.com'],
      ['e', 'billing@example.com'],
    ] as const) {
      const resolved = resolveIdentityKey(identityKey(accountId, 'b'), LOOKUP);
      expect(resolved.identity?.email).toBe(email);
      expect(resolved.accountId).toBe(accountId);
    }
  });

  it('reports no account for the primary one, which is what an ordinary send needs', () => {
    const resolved = resolveIdentityKey(identityKey(null, 'c'), LOOKUP);
    expect(resolved.identity?.email).toBe('kevin@example.com');
    expect(resolved.accountId).toBeNull();
  });

  it('reads a bare id as the primary account, so a stored template keeps working', () => {
    const resolved = resolveIdentityKey('c', LOOKUP);
    expect(resolved.identity?.email).toBe('kevin@example.com');
    expect(resolved.accountId).toBeNull();
  });

  it('qualifies the primary account explicitly without turning it into a send-as', () => {
    const resolved = resolveIdentityKey(identityKey('g', 'c'), LOOKUP);
    expect(resolved.identity?.email).toBe('kevin@example.com');
    expect(resolved.accountId).toBeNull();
  });

  it('falls back to the primary identity when the key names nothing', () => {
    expect(resolveIdentityKey(identityKey('zz', 'nope'), LOOKUP).identity).toBe(KEVIN);
    expect(resolveIdentityKey(null, LOOKUP).identity).toBe(KEVIN);
  });

  it('leaves a primary-account identity unqualified, so old and new keys agree', () => {
    expect(identityKey(null, 'c')).toBe('c');
    expect(identityKey('d', 'b')).toBe('d:b');
  });
});
