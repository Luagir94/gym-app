// Tests for the pre-registration gate logic.
// The gate is implemented as a pure function that checks whether
// a given email is in the pre-registration store. This is extracted
// for easy testing without needing a live Better Auth instance.

import {
  isEmailPreRegistered,
  addPreRegistration,
  removePreRegistration,
  clearAllRegistrations,
} from '../lib/pre-registration-store';

describe('Pre-registration store', () => {
  beforeEach(() => {
    // Reset ALL state between tests — clearAllRegistrations() is the correct API
    clearAllRegistrations();
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

  it('normalizes email case — ALICE@example.com registered matches alice@example.com lookup', () => {
    // Register with uppercase
    addPreRegistration('ALICE@example.com', 'tenant-a');

    // Lookup with lowercase must still match
    expect(isEmailPreRegistered('alice@example.com', 'tenant-a')).toBe(true);
  });

  it('normalizes email case — lowercase registered matches UPPERCASE lookup', () => {
    addPreRegistration('alice@example.com', 'tenant-a');

    expect(isEmailPreRegistered('ALICE@example.com', 'tenant-a')).toBe(true);
  });

  it('clearAllRegistrations() removes every entry across all tenants', () => {
    addPreRegistration('alice@example.com', 'tenant-a');
    addPreRegistration('bob@example.com', 'tenant-b');

    clearAllRegistrations();

    expect(isEmailPreRegistered('alice@example.com', 'tenant-a')).toBe(false);
    expect(isEmailPreRegistered('bob@example.com', 'tenant-b')).toBe(false);
  });
});
