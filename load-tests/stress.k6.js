import { provisionBookableTenant, queryAvailability } from './lib/api.js';

/**
 * Stress test — push concurrency well beyond normal to find where latency and
 * errors start degrading (the breaking point). The thresholds below are observation
 * markers, not an SLO: watch which one breaks first and at what VU level — that is
 * the capacity signal. Tune the top stage up until it consistently breaks.
 *
 * Run: BASE_URL=http://localhost:3000 k6 run load-tests/stress.k6.js
 */
export const options = {
  scenarios: {
    stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 50 },
        { duration: '1m', target: 100 },
        { duration: '1m', target: 200 },
        { duration: '1m', target: 300 },
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<2000'],
  },
};

export function setup() {
  return provisionBookableTenant();
}

export default function (data) {
  queryAvailability(data);
}
