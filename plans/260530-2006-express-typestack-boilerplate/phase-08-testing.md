# Phase 08 — Testing

**Priority:** High | **Status:** pending | **Depends:** 04

Jest + ts-jest (decorator metadata via tsc), unit tests, supertest integration tests against a real Postgres via testcontainers, faker for data.

## Jest config — `jest.config.js`
```js
const { pathsToModuleNameMapper } = require('ts-jest');
const { compilerOptions } = require('./tsconfig.json');
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  setupFiles: ['reflect-metadata'],            // metadata before any decorator code
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths, { prefix: '<rootDir>/' }),
  testTimeout: 60000,                           // testcontainers need headroom
};
```
> ts-jest uses tsc → `emitDecoratorMetadata` honored automatically. `setupFiles:['reflect-metadata']` is essential or DI/typeorm throw at import.

## Unit tests (no DB) — mock the repository
- `auth.service.spec.ts`: inject a fake `UserRepository` (plain object) + real `TokenService`; assert register hashes + throws `ConflictException` on dup; login throws `UnauthorizedException` on bad password.
- Pattern proves the layering pays off: services are unit-testable because all DB sits behind the repository interface.

## Integration tests — testcontainers Postgres
`test/setup-db.ts`:
```ts
import { PostgreSqlContainer } from '@testcontainers/postgresql';
let container; export let testDataSource;
export async function startTestDb() {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  // build a DataSource pointing at container.getConnectionUri(), synchronize:true for tests
  await testDataSource.initialize();
}
export async function stopTestDb() { await testDataSource.destroy(); await container.stop(); }
```
> Install split package `@testcontainers/postgresql` (part of testcontainers org) for the typed Postgres module. Requires Docker running locally/CI.

`test/integration/auth.e2e.spec.ts`:
- `beforeAll` startTestDb + build app via `createServer()` (point container in typedi).
- supertest: `POST /api/auth/register` → 201 enveloped; `POST /api/auth/login` → token; `GET /api/users/me` with Bearer → 200, no `passwordHash` in body; without token → 401.
- Use `@faker-js/faker` for emails/names.
- `afterAll` stopTestDb.

## Files
jest.config.js, jest.int.config.js (or projects), test/setup.ts, test/setup-db.ts, src/**/*.spec.ts, test/integration/*.e2e.spec.ts

## Todo
- [ ] jest config + pathsToModuleNameMapper + reflect-metadata setupFiles
- [ ] AuthService unit tests (mock repo)
- [ ] testcontainers Postgres harness (`@testcontainers/postgresql`)
- [ ] supertest e2e: register/login/me/authz + envelope + hash-excluded
- [ ] faker data factories in tests
- [ ] `pnpm test` (unit) + `pnpm test:int` (integration) green

## Success Criteria
- Unit tests run without Docker; integration spins real Postgres, all green.
- Coverage on services/controllers; envelope + auth + validation asserted.
- No mocks/fakes that bypass real logic (only the DB boundary is swapped in unit tests).

## Risks
- CI must have Docker (testcontainers). Document in deployment guide. Increase timeout if image pull slow.
