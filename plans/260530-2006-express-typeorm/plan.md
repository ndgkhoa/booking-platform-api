# Express + TypeORM

**Created:** 2026-05-30 | **Branch:** develop | **Pkg manager:** pnpm | **DB:** PostgreSQL

Production-ready Express API built on the TypeStack ecosystem (routing-controllers + typedi + typeorm), with structured responses, custom exceptions, strict layering (controller → service → repository), JWT auth, OpenAPI docs, BullMQ jobs, Prometheus metrics, graceful shutdown, and full test setup.

## Locked Decisions (from interview)
- **Express 4.22.2** — routing-controllers@0.11 peer-depends Express 4; Express 5 routing breaks it. NON-NEGOTIABLE.
- **Build = `tsc` + `tsc-alias`** — esbuild/tsup do NOT emit `emitDecoratorMetadata` correctly → breaks typeorm/typedi/routing-controllers at runtime. `tsup` is DROPPED. `tsx` kept for dev hot-reload.
- **PostgreSQL** (`pg` driver) — testcontainers uses postgres image.

## Cross-cutting Conventions (apply in every phase)
- **Path aliases** for all imports: `@/`, `@config/`, `@common/`, `@modules/`, `@database/`, `@jobs/`. No relative `../../`.
- **Custom exceptions** extend routing-controllers `HttpError`, carry `errorCode` + `details`.
- **Structured response envelope** everywhere: `{ success, data, meta?, timestamp }` / error `{ success:false, error:{ code, message, details }, timestamp }`.
- **Repository pattern** — services NEVER touch QueryBuilder/EntityManager. All DB access in `*.repository.ts` (`@Service`, injects `DataSource`).
- **Bruno** API collection committed under `/bruno`.

## Phases
| # | Phase | Status | Depends |
|---|-------|--------|---------|
| 01 | [Scaffold, tooling, config](phase-01-scaffold-tooling-config.md) | pending | — |
| 02 | [Core infra: server, logger, exceptions, response, security](phase-02-core-infrastructure.md) | pending | 01 |
| 03 | [Database: DataSource, entities, repositories, migrations, seeds](phase-03-database-layer.md) | pending | 02 |
| 04 | [Auth & security: JWT, passport, user module](phase-04-auth-and-modules.md) | pending | 03 |
| 05 | [API docs: routing-controllers-openapi + Swagger UI](phase-05-api-documentation.md) | pending | 04 |
| 06 | [Caching & jobs: ioredis + BullMQ](phase-06-caching-and-jobs.md) | pending | 02 |
| 07 | [Monitoring: prom-client + terminus health/shutdown](phase-07-monitoring-health.md) | pending | 02 |
| 08 | [Testing: jest, supertest, testcontainers, faker](phase-08-testing.md) | pending | 04 |
| 09 | [Bruno collection + docs](phase-09-bruno-and-docs.md) | pending | 05 |

## Final Folder Structure
```
src/
  config/        env.ts, data-source.ts, container.ts, logger.ts, redis.ts, swagger.ts
  common/        exceptions/ interceptors/ middlewares/ decorators/ types/ utils/
  modules/       auth/ user/   (each: *.controller *.service *.repository *.entity dto/)
  database/      migrations/ seeds/ factories/
  jobs/          queues/ workers/
  health/        health.controller.ts metrics.ts
  server.ts      (createExpressServer + options)
  index.ts       (bootstrap + terminus graceful shutdown)
test/            unit/ integration/ setup.ts
bruno/           API collection
```

## Top Risks
1. **Decorator metadata** — must keep `experimentalDecorators`+`emitDecoratorMetadata`; build only via `tsc`. (mitigated by decision)
2. **typedi ↔ typeorm repo injection** — use custom repository classes (`@Service` + inject `DataSource`), not `@InjectRepository`. Avoids version-coupling pain.
3. **typeorm@1.0.0** — pin exact; verify `pg` driver + migration CLI API on install. Fallback `0.3.x` if API regressions.
4. **reflect-metadata import order** — must be first import in `index.ts` AND in `test/setup.ts`.

See `references/cook` reminder at end. Each phase file is self-contained with code patterns + gotchas.
