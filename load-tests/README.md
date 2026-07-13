# Load tests

k6 scenarios that drive the running API from an external process. Two kinds:

- **Correctness under concurrency** — `booking-double-booking.k6.js` proves the
  flagship guarantee (no double booking) at high request rates.
- **Performance taxonomy** — smoke / average-load / stress / spike on the
  availability read model, to measure throughput and latency and find limits.

All scenarios share `lib/api.js`: one JSON client, one tenant-provisioning fixture
(`provisionBookableTenant`), and the availability workload — so each scenario file
only declares its load shape.

## Prerequisites

- k6 (`brew install k6`).
- Postgres + Redis running and migrated (`docker compose up -d postgres redis`
  then `pnpm migration:run`).
- API running with the per-IP rate limit raised so bursts aren't throttled (all VUs
  share one source IP) and a wider DB pool to avoid connection starvation:
  `RATE_LIMIT_MAX=1000000 DB_POOL_MAX=60 pnpm dev`.

Each scenario's `setup()` provisions a throwaway tenant (owner → staff → service →
link → customer → working hours) and returns the ids the VUs hit.

## Performance scenarios

Standard k6 test types, run in this order. Each targets `GET /availability` — the
heaviest read (it aggregates working hours, time-off, bookings and capability).

| Scenario | Type | Load shape | What it answers |
| --- | --- | --- | --- |
| `smoke.k6.js` | Smoke | 2 VUs, 30s | Is the read path healthy at all? Run first. |
| `average-load.k6.js` | Average-load | ramp to 30 VUs, hold 2m | Latency (p95/p99) at expected normal traffic. |
| `stress.k6.js` | Stress | ramp 50→300 VUs | Where do latency/errors degrade — the breaking point. |
| `spike.k6.js` | Spike | 10→300 VUs then back | Does it absorb a sudden burst and recover? |

```bash
BASE_URL=http://localhost:3000 k6 run load-tests/smoke.k6.js
BASE_URL=http://localhost:3000 k6 run load-tests/average-load.k6.js
BASE_URL=http://localhost:3000 k6 run load-tests/stress.k6.js
BASE_URL=http://localhost:3000 k6 run load-tests/spike.k6.js
```

Reading the result: smoke and average-load have thresholds that should hold
(`http_req_failed rate<1%`, `http_req_duration p(95)` bounds) — a green run means
the SLO held. Stress and spike thresholds are **observation markers**, not SLOs:
watch which breaks first and at what VU level; that is the capacity signal. Tune
the top stage until it consistently breaks.

## Correctness: `booking-double-booking.k6.js`

Many virtual users POST the **same** staff + time slot simultaneously. The Postgres
`EXCLUDE USING gist` constraint on `bookings` lets exactly one insert win (`201`)
and rejects every overlapping insert with `409` (SQLSTATE `23P01`). Because a `201`
is only returned after the row is inserted and the tenant transaction commits,
**"exactly one 201" is equivalent to "exactly one row in the database"** for the
contested slot. Complements the deterministic integration test
(`test/integration/booking-concurrency.e2e.spec.ts`).

```bash
BASE_URL=http://localhost:3000 VUS=50 k6 run load-tests/booking-double-booking.k6.js
```

The run passes only if both thresholds hold:

| Metric | Expected | Meaning |
| --- | --- | --- |
| `bookings_created` | `count == 1` | exactly one VU won the slot |
| `booking_conflicts` | `count == VUS - 1` | every other VU got a clean `409` |

Any value other than 1 (a second success, or a 5xx) fails the threshold and the run
exits non-zero. Double-check at the database level after a run:

```sql
SELECT staff_id, starts_at, count(*)
FROM bookings
WHERE deleted_at IS NULL AND status IN ('pending', 'confirmed')
GROUP BY staff_id, starts_at
HAVING count(*) > 1;   -- returns zero rows
```
