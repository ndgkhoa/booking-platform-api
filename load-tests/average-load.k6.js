import { provisionBookableTenant, queryAvailability } from './lib/api.js';

/**
 * Average-load test — sustained, realistic traffic on the availability read model
 * (the heaviest read: it aggregates working hours, time-off, existing bookings and
 * capability). Ramps to a steady concurrency the system is expected to handle
 * comfortably and holds it, so the latency percentiles reflect normal operation.
 *
 * Run: BASE_URL=http://localhost:3000 k6 run load-tests/average-load.k6.js
 */
export const options = {
  scenarios: {
    steady: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 30 }, // ramp up
        { duration: '2m', target: 30 }, // hold at normal load
        { duration: '30s', target: 0 }, // ramp down
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<800', 'p(99)<1500'],
  },
};

export function setup() {
  return provisionBookableTenant();
}

export default function (data) {
  queryAvailability(data);
}
