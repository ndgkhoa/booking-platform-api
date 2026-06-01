# Codebase Summary

```
src/
  index.ts                      bootstrap: DataSource init → DI register → terminus → listen
  server.ts                     createServer(): security chain + routing-controllers + swagger + 404
  worker.ts                     standalone BullMQ worker entry (pnpm worker)
  config/
    env.ts                      envalid-validated, typed environment
    container.ts                TypeDI ↔ routing-controllers wiring
    logger.ts                   winston (dev pretty / prod JSON)
    data-source.ts              TypeORM DataSource (postgres, migrations)
    redis.ts                    ioredis client + shared connection options
    swagger.ts                  OpenAPI spec from decorators + class-validator schemas
  common/
    base/                       entity.base (BaseEntity), query.base (BaseQuery pagination)
    exceptions/                 AppException + concrete HTTP exceptions (barrel)
    interceptors/               ResponseInterceptor (success envelope)
    middlewares/                error-handler, http-logger, metrics
    monitoring/                 prom-client registry + http histogram
    types/                      api-response (ApiResponse/ApiError/paginated), express.d.ts
    utils/                      JSON cache helpers over Redis (cache.ts)
  modules/
    user/                       entity, repository, service, controller
    auth/                       dto, token.service, jwt.strategy, auth.service, auth.controller
  database/
    migrations/                 generated TypeORM migrations
    factories/user.factory.ts   faker-based factory
    seeds/                      UserSeeder + run-seeds.ts
test/unit/                      unit tests (mocked repository)
test/integration/               supertest + testcontainers e2e
bruno/                          API client collection (auth, users, system)
```

## Config files
- `tsconfig.json` — editor + typecheck + ts-node/jest (includes `src` + `test`, jest types).
- `tsconfig.build.json` — emit only (`src`, excludes tests) → used by `pnpm build`.
- `jest.config.js` / `jest.int.config.js` — unit / integration runners.
- `biome.json`, `.lintstagedrc.json`, `.husky/` — quality gates.
- `docker-compose.yml` — Postgres 17 + Redis 7.

## Key endpoints
`POST /api/auth/register|login` · `GET /api/users/me|/:id` · `GET /api/users` (admin) · `GET /api-docs` · `GET /health/ready` · `GET /health/live` · `GET /metrics`
