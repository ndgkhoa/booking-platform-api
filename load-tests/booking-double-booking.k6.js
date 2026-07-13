import { check } from 'k6';
import { Counter } from 'k6/metrics';
import { post, provisionBookableTenant } from './lib/api.js';

/**
 * Flagship guarantee, proven under real HTTP concurrency: many virtual users POST
 * the SAME staff + time slot at once; the Postgres EXCLUDE constraint lets exactly
 * one win (201) and rejects the rest (409). A 201 means the row was inserted and
 * committed, so "exactly one 201" is equivalent to "one DB row".
 *
 * Run:  BASE_URL=http://localhost:3000 VUS=50 k6 run load-tests/booking-double-booking.k6.js
 * See load-tests/README.md for setup and how to read the result.
 */

const VUS = Number(__ENV.VUS || 50);

const created = new Counter('bookings_created'); // expect exactly 1
const conflicts = new Counter('booking_conflicts'); // expect VUS - 1

export const options = {
  scenarios: {
    race: { executor: 'shared-iterations', vus: VUS, iterations: VUS, maxDuration: '30s' },
  },
  thresholds: {
    // The whole point: one winner, everyone else a clean 409 — nothing else.
    bookings_created: ['count==1'],
    booking_conflicts: [`count==${VUS - 1}`],
  },
};

export function setup() {
  return provisionBookableTenant(); // returns a single fixed slot every VU fights over
}

export default function (data) {
  const res = post(
    '/bookings',
    {
      staffId: data.staffId,
      serviceId: data.serviceId,
      customerId: data.customerId,
      startsAt: data.startsAt,
    },
    data.token,
  );
  if (res.status === 201) created.add(1);
  else if (res.status === 409) conflicts.add(1);
  else console.log(`unexpected status=${res.status} body=${String(res.body).slice(0, 200)}`);
  check(res, { 'won (201) or lost cleanly (409)': (r) => r.status === 201 || r.status === 409 });
}
