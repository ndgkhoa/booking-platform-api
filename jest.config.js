const { pathsToModuleNameMapper } = require('ts-jest');
const { compilerOptions } = require('./tsconfig.json');

const base = {
  testEnvironment: 'node',
  setupFiles: ['reflect-metadata'],
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
    },
  ],
};
