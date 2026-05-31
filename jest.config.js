const { pathsToModuleNameMapper } = require('ts-jest');
const { compilerOptions } = require('./tsconfig.json');

// Unit-test config: fast, no external services. Specs live next to the code as
// *.spec.ts under src/. `isolatedModules` transpiles per-file (still emits the
// decorator metadata the stack needs) and sidesteps TS-version diagnostics.
module.exports = {
  testEnvironment: 'node',
  setupFiles: ['reflect-metadata'],
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.spec.ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths, { prefix: '<rootDir>/' }),
  clearMocks: true,
};
