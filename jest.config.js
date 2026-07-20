const { pathsToModuleNameMapper } = require('ts-jest');
const ts = require('typescript');

// Read tsconfig through the TypeScript parser so JSONC (comments, trailing
// commas written by the formatter) is tolerated — a plain require() is not.
const { config } = ts.readConfigFile('./tsconfig.json', ts.sys.readFile);
const { compilerOptions } = config;

const base = {
  testEnvironment: 'node',
  setupFiles: ['reflect-metadata', '<rootDir>/test/support/test-env.ts'],
  transform: { '^.+\\.ts$': 'ts-jest' },
  moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths, { prefix: '<rootDir>/' }),
  clearMocks: true,
};

module.exports = {
  projects: [
    { ...base, displayName: 'unit', roots: ['<rootDir>/test/unit'], testMatch: ['**/*.spec.ts'] },
    {
      ...base,
      displayName: 'integration',
      roots: ['<rootDir>/test/integration'],
      testMatch: ['**/*.e2e.spec.ts'],
      testTimeout: 120000,
      globalSetup: '<rootDir>/test/support/global-setup.ts',
      globalTeardown: '<rootDir>/test/support/global-teardown.ts',
    },
  ],
  // The shared BullMQ queue keeps a Redis connection open during integration
  // runs; force-exit after the suite so it doesn't hold the process open.
  forceExit: true,
};
