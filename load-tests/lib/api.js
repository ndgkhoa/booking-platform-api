import { check, sleep } from 'k6';
import http from 'k6/http';

// Shared helpers for every scenario: one JSON client, one tenant-provisioning
// fixture, and the availability workload — so scenarios only declare load shape.

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const API = `${BASE_URL}/api/v1`;

function headers(token) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

export const post = (path, body, token) =>
  http.post(`${API}${path}`, JSON.stringify(body), { headers: headers(token) });

export const get = (path, token) => http.get(`${API}${path}`, { headers: headers(token) });

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

/**
 * Provisions a throwaway tenant with one bookable staff + service (linked) + a
 * customer + working hours on the target date, so `/availability` returns slots
 * and `/bookings` accepts the slot. Runs once in a scenario's `setup()`.
 */
export function provisionBookableTenant() {
  const reg = post('/auth/register', {
    email: `k6-${uid()}@test.com`,
    name: 'Owner',
    password: 'password123',
  });
  const userId = reg.json('data.user.id');

  const onboard = post(
    '/tenants',
    { name: 'LoadSpa', slug: `k6-${uid()}` },
    reg.json('data.token'),
  );
  const token = onboard.json('data.token');

  const staffId = post('/staff', { userId, displayName: 'Stylist' }, token).json('data.id');
  const serviceId = post(
    '/services',
    { name: 'Cut', durationMin: 60, priceAmount: 200000 },
    token,
  ).json('data.id');
  post(`/staff/${staffId}/services`, { serviceId }, token);
  const customerId = post('/customers', { name: 'Jane', email: `c-${uid()}@test.com` }, token).json(
    'data.id',
  );

  // Tomorrow (tenant tz defaults to UTC); open 09:00–17:00 so availability yields slots.
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  post(`/staff/${staffId}/working-hours`, { weekday, startMin: 540, endMin: 1020 }, token);

  return { token, staffId, serviceId, customerId, date, startsAt: `${date}T09:00:00.000Z` };
}

/**
 * The read workload under test: one availability query for the provisioned slot,
 * with response checks and `think` seconds of pacing after (0 disables pacing).
 */
export function queryAvailability(data, think = 1) {
  const res = get(`/availability?serviceId=${data.serviceId}&date=${data.date}`, data.token);
  check(res, {
    'status is 200': (r) => r.status === 200,
    'returns slots array': (r) => Array.isArray(r.json('data')),
  });
  if (think) sleep(think);
  return res;
}
