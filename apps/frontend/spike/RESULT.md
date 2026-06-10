# Spike Result: Better Auth JWT Plugin — Claim Injection Verification

**Date**: 2026-06-10
**Status**: PASS — Architecture gate is OPEN

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

### 4. Token Endpoint

- Path: `/token` → full URL: `http://localhost:3000/api/auth/token`
- Method: GET (requires active session cookie)
- Returns: `{ token: string }` — the signed JWT

### 5. Spike Script Execution

```
SPIKE RESULT: PASS
✓ TypeScript compilation: no errors
✓ betterAuth() accepts jwt() plugin with definePayload
✓ Script ran without runtime errors
```

## Architecture Impact

| Concern | Status |
|---------|--------|
| `definePayload` injects `tenantId` + `role` | CONFIRMED |
| JWKS endpoint exposed at `/api/auth/jwks` | CONFIRMED |
| NestJS can use `jwks-rsa` to validate tokens | CONFIRMED |
| Pre-registration gate via `databaseHooks.user.create.before` | CONFIRMED |

## Implementation Notes

1. `definePayload` return value **replaces** `ctx.context.session.user` as the payload base.
   Include all claims you want in the JWT — the user ID is set separately via `sub`.

2. The `role` and `tenantId` must be stored on the `User` model (PR3 Prisma columns).
   For the spike, `additionalFields` in Better Auth stores them in the memory adapter.

3. Better Auth requires `BETTER_AUTH_SECRET` to be ≥32 chars and high-entropy.
   `.env.example` must document this clearly.

4. The JWT plugin adds a `jwks` table schema. In PR3, this table will be created
   by the Better Auth Prisma adapter migration.

## Next Steps (unblocked)

- PR3: Wire Prisma adapter; create `PreRegistration` table; remove memory adapter
- PR6: Frontend login page, axios interceptor with token endpoint, role-based layouts
