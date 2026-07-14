# Code Review — Phase 05 Reporting/Analytics

Branch `develop` · commit `c065b9b` "feat(reporting): tenant-scoped bookings & revenue analytics"
Scope: `src/modules/reporting/**` + `test/integration/reporting.e2e.spec.ts` · read-only

## Overall Assessment

Clean, focused slice. Tenant scoping, auth (owner-only), status-filtered revenue, and
DST-aware local-day bucketing are all correct in the common (UTC/single-currency) path and
well covered by e2e. Two real correctness bugs surface for non-UTC tenants and mixed-currency
tenants, plus a raw-SQL-interpolation smell worth hardening before this pattern spreads. No
Critical (no data leak, no auth bypass, no crash). Ship-blocking items below are High.

---

## High

### H1 — Multi-currency revenue sums disparate minor units, reports arbitrary currency
`reporting.repository.ts:67-68` `SUM(b.price_amount)` + `MAX(b.price_currency)`.

Not theoretical: `price_currency` is settable per service (`create-service.dto.ts:29-30`,
`update-service.dto.ts:33-34`, `@Length(3,3)` only — no ISO whitelist), snapshotted onto each
booking (`booking.service.ts:75`). A tenant with a USD service and a VND service gets their raw
integer minor units added together and labelled with whichever currency `MAX()` happens to pick
— a meaningless number presented as authoritative revenue.

Fix (pick one):
- Group revenue by currency: add `b.price_currency` to `groupBy`/select and return one row per
  (bucket, currency). Cleanest, no new constraint.
- Or constrain a tenant to a single currency (tenant-level currency column; validate service
  currency against it on create/update) and keep the current shape.

Recommend the group-by-currency option — it is correct regardless of future multi-currency support.

### H2 — from/to interpreted as UTC instants, but buckets are tenant-local → off-by-a-day at edges
`reporting.service.ts:31-32` `new Date(query.from)` (date-only ⇒ **UTC** midnight) feeds the
range filter `reporting.repository.ts:87` on `starts_at` (a UTC instant), while
`bucketExpr` truncates in the **tenant** timezone (`repository.ts:107`). For any non-UTC tenant
the window edges disagree with the local calendar the buckets are expressed in.

Worked example — NY tenant (UTC−5), `from=2026-12-01&to=2026-12-08`:
- Booking `2026-12-01T02:00Z` → local `2026-11-30 21:00` → bucket **`2026-11-30`**, i.e. a bucket
  *outside* the range the user asked for still appears in the result.
- Booking `2026-12-08T02:00Z` → local `2026-12-07 21:00` (bucket `2026-12-07`, inside the desired
  local window) is **excluded** because it is `>= to` in UTC.

So edge local-days are silently truncated/leaked. The existing NY test (`spec.ts:126-135`) only
asserts a mid-window bucket is *present*, so it does not catch this. Correctness bug for every
non-UTC tenant, which is the majority real-world case.

Fix: interpret from/to in the tenant timezone. Load `timezone` before computing boundaries and
convert the local wall-clock to an instant in SQL, e.g. bind `from`/`to` as timestamps and filter
`b.starts_at >= (:from::timestamp AT TIME ZONE :tz) AND b.starts_at < (:to::timestamp AT TIME ZONE :tz)`.
Then range and buckets share one calendar. (If UTC boundaries are intentional, document it and make
the bucket boundary UTC too — but local buckets + UTC range is the inconsistent state.)

---

## Medium

### M1 — Raw `${groupBy}` string-interpolated into SQL (defense-in-depth)
`reporting.repository.ts:107` `date_trunc('${groupBy}', ...)`. Safe *today*: `@IsIn(day|week|
month|service|staff)` (`report-query.dto.ts:12`) plus the switch routes service/staff away, so only
`day|week|month` reach the interpolated branch. But it is raw interpolation into a SQL string — one
dropped decorator, one new enum value, or one direct service call away from injection. `:tz`,
`:from`, `:to` are correctly parameterized (`setParameter`/bound where args) — confirmed, good.

Fix: map the enum to constant fragments instead of interpolating the input:
```ts
const TRUNC: Record<'day'|'week'|'month', string> = { day: 'day', week: 'week', month: 'month' };
// ... `date_trunc('${TRUNC[groupBy]}', ...)`  // value is now a compile-time constant, not input
```
Cheap, removes the smell permanently.

### M2 — Datetime-without-offset parses as server-local; validation is status-inconsistent
- `IsISO8601` accepts date-only and offset-less datetimes. `new Date('2026-12-01T00:00:00')`
  (no `Z`/offset) is parsed by JS as **server-local** time, so report boundaries become dependent
  on the host timezone — non-deterministic across environments. Tighten by requiring a date-only
  form (and interpreting it in tenant tz per H2), or `@IsISO8601({ strict: true })` + explicit
  offset handling.
- Status inconsistency: DTO validation failures return **422** (`error-handler.middleware.ts:55-57`),
  but the semantic range checks throw `BadRequestException` = **400** (`reporting.service.ts:34,37`).
  Phase plan called for 422 on oversized range. Prefer `ValidationException` (422) for
  inverted/oversized range so all input-validation failures are consistent with earlier slices.

---

## Low

- **L1 — No zero-filled buckets.** Empty days/weeks are absent rather than `0` (`repository.ts`
  aggregates existing rows only). Acceptable for now; note as a known gap for the UI (client must
  fill gaps) or add a `generate_series` join later.
- **L2 — service/staff groupBy returns raw UUIDs**, no name join (`repository.ts:102-103`).
  Acceptable per scope; consumer must resolve names.
- **L3 — `Number()` coercion of bigint COUNT/SUM** (`repository.ts:53-58,74`). Safe under 2^53;
  SUM(price_amount) would need ~9e15 minor units to lose precision — not reachable. No action.
- **L4 — No ISO-4217 whitelist on `priceCurrency`** (`create-service.dto.ts:29`, `@Length(3,3)`
  only). Ties into H1; a whitelist would also prevent junk currency codes in reports.

---

## Confirmed Safe (verified, do not re-flag)

- **Tenant fallback** `getTenantManager() ?? dataSource.manager` (`repository.ts:81`):
  `getTenantId()` (`repository.ts:85`) throws `UnauthorizedException` when context is absent
  (`tenant-context.ts:26-32`), so the fallback manager never runs unscoped; and the app filter
  `tenant_id = :tenantId` is applied unconditionally. Safe.
- **Foreign staffId/serviceId filter** → 0 rows, no cross-tenant leak (tenant_id AND-ed first,
  `repository.ts:85,92-94`). Safe.
- **Revenue = completed only** — decided/documented, not re-litigated.
- **`:tz` / `:from` / `:to` parameterization** — bound, not interpolated. Safe.

---

## Blockers before Phase 06

- **H1 (multi-currency)** and **H2 (UTC-vs-local boundary)** are correctness defects reachable with
  supported inputs. Recommend fixing (or explicitly accepting + documenting) before building
  anything on top of these numbers. M1 is a cheap hardening fix worth folding in with H2.

## Unresolved Questions

1. Is multi-currency-per-tenant a supported scenario, or is single-currency an intended invariant?
   Answer decides H1 fix direction (group-by-currency vs tenant currency constraint).
2. Are report from/to meant to be tenant-local calendar dates (expected) or UTC instants? Confirms
   H2 fix vs documentation-only.
3. Should inverted/oversized range be 422 to match the phase plan and DTO-validation status, or is
   400 intentional for these semantic (non-schema) checks?

---
**Status:** DONE_WITH_CONCERNS
**Summary:** Reporting slice is solid on the UTC/single-currency happy path with good e2e, but has two reachable correctness bugs (multi-currency SUM, UTC-range vs local-bucket boundary) plus a raw-SQL-interpolation smell to harden.
**Concerns/Blockers:** H1 and H2 are correctness defects — recommend resolving or documenting before Phase 06.
