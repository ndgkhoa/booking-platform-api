const base = require('./jest.config.js');

// Integration-test config: spins a real Postgres via testcontainers (Docker
// required). Specs live under test/integration/ as *.e2e.spec.ts.
module.exports = {
  ...base,
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.e2e.spec.ts'],
  testTimeout: 120000,
};
