import { check } from 'k6';
import http from 'k6/http';
import { Counter } from 'k6/metrics';

/**
 * Flagship guarantee, proven under real HTTP concurrency: many virtual users
 * POST the SAME staff + time slot at once; the Postgres EXCLUDE constraint lets
 * exactly one win (201) and rejects the rest (409). A 201 means the row was
 * inserted and committed, so "exactly one 201" is equivalent to "one DB row".
 *
 * Run:  BASE_URL=http://localhost:3000 k6 run load-tests/booking-double-booking.k6.js
 * See load-tests/README.md for setup and how to read the result.
 */

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const API = `${BASE_URL}/api/v1`;
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

function post(path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return http.post(`${API}${path}`, JSON.stringify(body), { headers });
}

/** Builds a tenant that can take a booking, then returns the contested slot. */
export function setup() {
  const email = `k6-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;
  const reg = post('/auth/register', { email, name: 'Owner', password: 'password123' });
  const userId = reg.json('data.user.id');

  const onboard = post(
    '/tenants',
    { name: 'LoadSpa', slug: `k6-${Date.now()}` },
    reg.json('data.token'),
  );
  const token = onboard.json('data.token');

  const staff = post('/staff', { userId, displayName: 'Stylist' }, token);
  const staffId = staff.json('data.id');
  const service = post('/services', { name: 'Cut', durationMin: 60, priceAmount: 200000 }, token);
  const serviceId = service.json('data.id');
  post(`/staff/${staffId}/services`, { serviceId }, token);
  const customer = post('/customers', { name: 'Jane', email: `c-${Date.now()}@test.com` }, token);
  const customerId = customer.json('data.id');

  // A single fixed slot every VU will fight over.
  const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  return { token, staffId, serviceId, customerId, startsAt };
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
