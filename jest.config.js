const { pathsToModuleNameMapper } = require('ts-jest');
const ts = require('typescript');

// Read tsconfig through the TypeScript parser so JSONC (comments, trailing
// commas written by the formatter) is tolerated — a plain require() is not.
const { config } = ts.readConfigFile('./tsconfig.json', ts.sys.readFile);
const { compilerOptions } = config;

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
