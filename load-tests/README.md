# Load tests

Empirical, HTTP-level proof of the platform's flagship guarantee: **no double
booking under concurrency**. Complements the deterministic integration test
(`test/integration/booking-concurrency.e2e.spec.ts`) by driving the running API
from an external process at high request rates.

## `booking-double-booking.k6.js`

Many virtual users POST the **same** staff + time slot simultaneously. The
Postgres `EXCLUDE USING gist` constraint on `bookings` lets exactly one insert
win (`201`) and rejects every overlapping insert with `409` (SQLSTATE `23P01`).
Because a `201` is only returned after the row is inserted and the tenant
transaction commits, **"exactly one 201" is equivalent to "exactly one row in
the database"** for the contested slot.

### Prerequisites

- k6 (`brew install k6`)
- Postgres + Redis running and migrated (`docker compose up -d postgres redis`
  then `pnpm migration:run`) — the `bookings_no_overlap` EXCLUDE constraint ships
  in the BookingsCore migration.
- API running with the per-IP rate limit raised so the burst is not throttled
  (all VUs share one source IP): `RATE_LIMIT_MAX=1000000 pnpm dev`. A wider DB
  pool avoids connection starvation under high VUs: `DB_POOL_MAX=60`.

### Run

```bash
BASE_URL=http://localhost:3000 VUS=50 k6 run load-tests/booking-double-booking.k6.js
```

`setup()` provisions a throwaway tenant (owner → staff → service → link →
customer) and picks one fixed future slot; every VU then races to book it.

### Reading the result

The run passes only if both thresholds hold:

| Metric | Expected | Meaning |
| --- | --- | --- |
| `bookings_created` | `count == 1` | exactly one VU won the slot |
| `booking_conflicts` | `count == VUS - 1` | every other VU got a clean `409` |

A green `✓ bookings_created` line is the proof: regardless of how many VUs raced,
the database holds exactly one booking for the slot. Any value other than 1 (a
second success, or a 5xx) fails the threshold and the run exits non-zero.

To double-check at the database level after a run:

```sql
SELECT staff_id, starts_at, count(*)
FROM bookings
WHERE deleted_at IS NULL AND status IN ('pending', 'confirmed')
GROUP BY staff_id, starts_at
HAVING count(*) > 1;   -- returns zero rows
```
