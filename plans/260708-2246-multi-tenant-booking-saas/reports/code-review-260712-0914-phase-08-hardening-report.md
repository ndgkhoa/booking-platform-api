# Code Review — Phase 08 Hardening (uncommitted, HEAD f1b23af)

Scope: swagger.ts, env.ts, server.ts, admin-audit-log.entity.ts, k6 script, .env.example, README claims.
Verdict: **Ship-ready.** No Critical/High. All 4 key questions resolved in favour of the change. Only 3 Low nits.

## Verified sound

- **Rate-limit defaults byte-for-byte preserved.** `env.ts` `RATE_LIMIT_WINDOW_MS: num({default: 15*60*1000})` = 900000, `RATE_LIMIT_MAX: num({default: 100})`. Identical to prior hardcoded `windowMs: 15*60*1000, limit: 100` in `server.ts:98-99`. `num` is imported (env.ts:2). `.env.example` values (900000 / 100) match. Unset env → prod/tests unchanged. (Key Q2 ✔)
- **admin-audit-log fix correct and complete.** `action!: AdminAction` is a string-union → erases to `Object` at runtime → TypeORM `DataTypeNotSupportedError` at bootstrap. Explicit `@Column({ type: 'varchar' })` (entity:23) is the right fix. Swept all other bare `@Column()` across entities — every one backs a plain `string` property (customer, invite, user, service, plan, webhook-endpoint, tenant), which TypeORM infers correctly. `metadata` already has explicit `jsonb`. No other latent instance of this bug class.
- **Swagger post-processing cannot crash boot.** `routingControllersToSpec` emits `paths[route][method] = operationObject` only — path-item values are always objects, operations always objects. `operation.responses ??= {}` and `.default ??=` handle the missing-key cases. Spec build is also gated behind `env.SWAGGER_ENABLED` (server.ts:107), so it never runs in a default prod boot regardless. (Key Q1 ✔)
- **`default` injection doesn't clobber real responses.** routing-controllers-openapi emits numeric status keys (`200`, `201`…), never `default`; `??=` only fills when absent. Success responses are preserved. ✔
- **`servers: [{url: '/'}]` — no double-prefix regression.** Paths carry the `/api/v1` routePrefix; before this change the spec had **no** `servers`, which per OpenAPI implies exactly one server with url `/`. So the new explicit `/` is equivalent to prior behaviour — not a new concatenation. Swagger UI "Try it out" resolves the same as before. (Key Q1 ✔)
- **k6 proof is genuine and non-vacuous.** (Key Q3 ✔)
  - `created` increments only on HTTP 201; booking POST is `@HttpCode(201)` (booking.controller.ts:35) and returns only after the tenant transaction commits. `conflicts` increments only on 409, which is mapped exclusively from SQLSTATE `23P01` (booking.repository.ts:97-98).
  - Thresholds `bookings_created count==1` **AND** `booking_conflicts count==VUS-1` together force all VUS responses to be either the single winner or a clean conflict — a real double-book returns a 2nd 201 → `count==1` fails; a 5xx/429 → `count==VUS-1` fails. No path reports green while the DB double-booked.
  - `shared-iterations vus=VUS iterations=VUS` = exactly one attempt per VU on one shared `startsAt` → correctly races the same slot.
  - setup() fixture shapes match the live API envelope: `ResponseInterceptor` wraps `{user,token,refreshToken}` → `data.user.id` / `data.token`; tenant create returns `{tenant, ...session}` → `data.token`. Paths in the script resolve.
- **No secret/PII exposure.** OpenAPI `description` carries no creds. k6 uses throwaway random emails and the literal fixture password `password123` (not a real secret). (Key Q4 ✔)
- **`@ts-expect-error` / `noExplicitAny` warranted.** The deep import `class-transformer/cjs/storage` has no type root; `schemas as any` bridges the generated JSON-schema map to `components.schemas`. Both are pragmatic and scoped to one line.

## Low

1. **OpenAPI example code mismatches the real error code.** `swagger.ts` ProblemDetails example `code: 'BOOKING_CONFLICT'` (and detail `'Staff is already booked for this slot'`) but the actual emitted conflict is `code: 'BOOKING_SLOT_TAKEN'`, `detail: 'This time slot is no longer available'` (booking.repository.ts:98). Illustrative only, but an API consumer coding against the documented `code` string would match the wrong value. Fix: use the real code/detail in the example.

2. **Swagger loop not defensive against future path-level keys.** `operation.responses ??= {}` would throw only if a path-item value were a string/number primitive (e.g. a future `summary`/`$ref` path-level key). routing-controllers-openapi emits none today, so safe now. Optional hardening: `if (operation && typeof operation === 'object')` guard before the `??=`, to stay robust if the generator or a manual merge later adds path-level metadata.

3. **k6 setup() doesn't assert its provisioning steps.** register/onboard/staff/service/customer responses are consumed without `check()`. If a setup call fails, the ids go `undefined` and the run fails at the *threshold* rather than pointing at the broken step — harder to diagnose, but still fails loudly (not a false pass). Optional: `check()` each setup response for a non-null id.

## Notes (no action)

- k6 vs the app's own `/api` rate limiter (default 100/15min): at `VUS=50` (+~7 setup calls) the burst stays under 100, but higher VUS would draw 429s and fail the thresholds for the wrong reason. Already correctly documented in `load-tests/README.md` ("RATE_LIMIT_MAX=1000000 pnpm dev"). Script header defers to that README. Fine as-is.
- README concurrency section, `load-tests/README.md`, and the script agree with the code: EXCLUDE USING gist constraint, `23P01` → 409, 201-after-commit. No factual errors found.

## Unresolved questions

- None. Recommend applying Low #1 (1-line doc accuracy) before merge; #2/#3 optional.
