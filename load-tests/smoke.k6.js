import { provisionBookableTenant, queryAvailability } from './lib/api.js';

/**
 * Smoke test — minimal load to confirm the availability read path is healthy
 * before running the heavier scenarios. A couple of VUs for a short time; near-zero
 * errors and fast responses are the bar. Run this first.
 *
 * Run: BASE_URL=http://localhost:3000 k6 run load-tests/smoke.k6.js
 */
export const options = {
  vus: 2,
  duration: '30s',
  thresholds: {
    http_req_failed: ['rate<0.01'], // <1% failed requests
    http_req_duration: ['p(95)<500'], // 95% under 500ms at trivial load
  },
};

export function setup() {
  return provisionBookableTenant();
}

export default function (data) {
  queryAvailability(data);
}
