# Spike Result: Better Auth JWT Plugin — Claim Injection Verification

**Date**: 2026-06-10
**Status**: PASS — Architecture gate is OPEN (corrected gate design documented below)

## Hypothesis

Better Auth 1.6.15 JWT plugin exposes a `definePayload` option that injects custom claims
(`tenantId`, `role`) into issued JWTs alongside `sub`. This is the architectural foundation
for stateless NestJS JWT validation.

## Findings

### 1. `definePayload` API — EXISTS and correct

```typescript
// better-auth/dist/plugins/jwt/types.d.mts
jwt?: {
  definePayload?: (session: {
    user: User & Record<string, any>;
    session: Session & Record<string, any>;
  }) => Awaitable<Record<string, any>> | undefined;
}
```

The function receives `{ user, session }` and returns `Record<string, any>`.
The return value is used AS the JWT payload (not merged — it replaces the default user object).

### 2. Claim injection — CONFIRMED via source code

From `better-auth/dist/plugins/jwt/sign.mjs` line 53:
```javascript
const payload = !options?.jwt?.definePayload
  ? ctx.context.session.user
  : await options.jwt.definePayload(ctx.context.session);
```

Then the JWT is signed with this payload, and `sub` is set separately:
```javascript
if (payload.sub) jwt.setSubject(payload.sub);
// or options.jwt.getSubject(session) ?? session.user.id
```

**Conclusion**: `{ tenantId, role }` returned by `definePayload` appear as top-level
JWT claims. NestJS `JwtStrategy.validate(payload)` receives them as `payload.tenantId`
and `payload.role`. The architecture works.

### 3. JWKS Endpoint

- Default path: `/jwks` (relative to Better Auth base)
- Full URL via Next.js: `http://localhost:3000/api/auth/jwks`
- NestJS `JwtStrategy` configures `jwksUri` to this URL
- Returns `{ keys: JWK[] }` — standard JWKS format

### 4. JWT Signing Algorithm

From `sign.mjs` line 40:
```javascript
const alg = key.alg ?? options?.jwks?.keyPairConfig?.alg ?? "EdDSA";
```

Better Auth defaults to **EdDSA**. NestJS `JwtStrategy.algorithms` must be set to
`['EdDSA']` only — do NOT include RS256/ES256.

### 5. JWT issuer and audience defaults

From `sign.mjs` lines 16-20:
```javascript
const baseURLOrigin = typeof ctx.context.options.baseURL === "string"
  ? ctx.context.options.baseURL : "";
const defaultIss = options?.jwt?.issuer ?? baseURLOrigin;
const defaultAud = options?.jwt?.audience ?? baseURLOrigin;
```

Both `iss` and `aud` default to the `baseURL` string. NestJS `JwtStrategy` must
validate `issuer` AND `audience` against the same `BETTER_AUTH_URL` value.

### 6. Token Endpoint

- Path: `/token` → full URL: `http://localhost:3000/api/auth/token`
- Method: GET (requires active session cookie)
- Returns: `{ token: string }` — the signed JWT

### 7. Spike Script Execution

```
SPIKE RESULT: PASS
✓ TypeScript compilation: no errors
✓ betterAuth() accepts jwt() plugin with definePayload
✓ Script ran without runtime errors
```

## CORRECTED Gate Design

### Original claim (inaccurate)

The original spike documented `databaseHooks.user.create.before` as:
> "checks `user.tenantId`, which confirms the gate works"

This was **type-level only** — the check never verified that Google OAuth payloads
actually carry `tenantId`. They do NOT. The original code would reject ALL sign-ups.

### Corrected gate (PR2 review fixes applied)

**Fix 1a — user.create.before (new user registration)**:
Google OAuth payloads never include `tenantId`. The gate must:
1. Look up the email (normalized lowercase) in the pre-registration store
2. If found: inject `tenantId` and `role` from the store into the user data
3. If not found: throw to reject the registration

```typescript
// auth-gate.ts (pure function, unit-tested)
export async function checkUserCreateGate(
  userData: { email: string },
  tenantId: string | null | undefined,
  role: string | null | undefined,
): Promise<GatedUserData>
```

**Fix 1b — session.create.before (every sign-in)**:
Returning users bypass `user.create.before`. Without a session hook, deactivating
a member has no effect. The session hook:
1. Resolves the user via `context.internalAdapter.findUserById(session.userId)`
2. Checks the user's email in the pre-registration store
3. Blocks session creation (throws) if the email is no longer active

Hook API verified in `@better-auth/core dist/types/init-options.d.mts`:
```typescript
session.create.before: (
  session: Session & Record<string, unknown>,
  context: GenericEndpointContext | null
) => Promise<boolean | void | { data: ... }>
```

**Fix 2 — definePayload never emits null tenantId**:
`buildDefinePayload({ tenantId, role })` throws if `tenantId` is falsy.
NestJS `validate()` remains as defense-in-depth.

### Remaining e2e caveats

The real Google OAuth round-trip has NOT been exercised. The following cannot be
confirmed without a live OAuth flow:

- Whether Better Auth fires `session.create.before` on OAuth callbacks (confirmed
  in source code via `createWithHooks` → `createSession` call chain, but untested
  end-to-end against Google)
- Whether `context.internalAdapter.findUserById()` is non-null at session creation
  time (timing: user is created first, then session — so it should be non-null)
- The exact error shape returned to the OAuth client when the hooks throw
  (Better Auth may swallow the error or return a 400/500 depending on context)

These caveats are acceptable for PR2 (spike). PR3 (integration tests with the real
OAuth flow against a test Google app) will close them.

## Architecture Impact

| Concern | Status |
|---------|--------|
| `definePayload` injects `tenantId` + `role` | CONFIRMED |
| JWKS endpoint exposed at `/api/auth/jwks` | CONFIRMED |
| JWT signing alg: EdDSA (not RS256/ES256) | CONFIRMED |
| JWT iss/aud default: baseURL origin | CONFIRMED |
| NestJS validates iss + aud + EdDSA | IMPLEMENTED |
| Pre-registration gate via email lookup + injection | IMPLEMENTED (PR2 corrected) |
| Per-sign-in re-check via session.create.before | IMPLEMENTED (PR2 corrected) |
| definePayload throws on null tenantId | IMPLEMENTED |
| Real OAuth round-trip validation | NOT YET (PR3) |

## Implementation Notes

1. `definePayload` return value **replaces** `ctx.context.session.user` as the payload base.
   Include all claims you want in the JWT — the user ID is set separately via `sub`.

2. The `role` and `tenantId` must be stored on the `User` model (PR3 Prisma columns).
   For the spike, `additionalFields` in Better Auth stores them in the memory adapter.

3. Better Auth requires `BETTER_AUTH_SECRET` to be ≥32 chars and high-entropy.
   The app now throws at startup (outside build phase) if the secret is missing or short.

4. The JWT plugin adds a `jwks` table schema. In PR3, this table will be created
   by the Better Auth Prisma adapter migration.

5. Use `BETTER_AUTH_URL` on both frontend AND backend. `NEXT_URL` has been removed.
   A single var prevents silent issuer/audience drift across the auth boundary.

## Next Steps (unblocked)

- PR3: Wire Prisma adapter; create `PreRegistration` table; remove memory adapter
- PR6: Frontend login page, axios interceptor with token endpoint, role-based layouts
