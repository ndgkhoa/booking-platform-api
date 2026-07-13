import { provisionBookableTenant, queryAvailability } from './lib/api.js';

/**
 * Spike test — a sudden jump from light to very heavy traffic and back, simulating
 * a flash of demand (e.g. a promo drop). Checks the system absorbs the burst and
 * recovers: errors during the spike and latency after it are the signals to watch.
 *
 * Run: BASE_URL=http://localhost:3000 k6 run load-tests/spike.k6.js
 */
export const options = {
  scenarios: {
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '20s', target: 10 }, // warm baseline
        { duration: '10s', target: 300 }, // spike up hard
        { duration: '30s', target: 300 }, // sustain the spike
        { duration: '10s', target: 10 }, // drop back
        { duration: '30s', target: 10 }, // observe recovery
        { duration: '10s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<2500'],
  },
};

export function setup() {
  return provisionBookableTenant();
}

export default function (data) {
  queryAvailability(data);
}
