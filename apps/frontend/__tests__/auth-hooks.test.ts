// Tests for the pre-registration gate logic.
// The gate is implemented as a pure function that checks whether
// a given email is in the pre-registration store. This is extracted
// for easy testing without needing a live Better Auth instance.

import { isEmailPreRegistered, addPreRegistration, removePreRegistration } from '../lib/pre-registration-store';

describe('Pre-registration store', () => {
  beforeEach(() => {
    // Reset state between tests (store is module-level)
    removePreRegistration('alice@example.com', 'tenant-a');
    removePreRegistration('carol@example.com', 'tenant-b');
    removePreRegistration('bob@example.com', 'tenant-a');
  });

  it('returns true when email+tenantId is pre-registered', () => {
    addPreRegistration('alice@example.com', 'tenant-a');

    expect(isEmailPreRegistered('alice@example.com', 'tenant-a')).toBe(true);
  });

  it('returns false when email is not pre-registered in any tenant', () => {
    expect(isEmailPreRegistered('bob@example.com', 'tenant-a')).toBe(false);
  });

  it('returns false when email is pre-registered in a different tenant', () => {
    addPreRegistration('carol@example.com', 'tenant-b');

    // carol is in tenant-b but NOT tenant-a
    expect(isEmailPreRegistered('carol@example.com', 'tenant-a')).toBe(false);
  });

  it('returns true for the correct tenant and false for a different tenant (isolation)', () => {
    addPreRegistration('carol@example.com', 'tenant-b');

    expect(isEmailPreRegistered('carol@example.com', 'tenant-b')).toBe(true);
    expect(isEmailPreRegistered('carol@example.com', 'tenant-a')).toBe(false);
  });
});
