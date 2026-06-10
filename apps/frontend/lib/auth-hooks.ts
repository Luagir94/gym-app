/**
 * auth-hooks.ts
 *
 * Higher-level auth hook utilities used by auth.ts and other server-side code.
 * Provides the interface that admin member management (PR3+) will call to
 * maintain the pre-registration gate.
 *
 * NOTE: In PR3, these functions will call Prisma to read/write `PreRegistration`
 * records instead of the in-memory store.
 */

export {
  isEmailPreRegistered,
  addPreRegistration,
  removePreRegistration,
} from './pre-registration-store';
