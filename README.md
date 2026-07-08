# booking-platform-api

Production-ready Express API on the TypeStack ecosystem — decorator-based controllers, dependency injection, ORM, validation — with structured responses, JWT auth, OpenAPI docs, background jobs, metrics, and graceful shutdown.

## Stack

| Concern | Library |
|---------|---------|
| HTTP / routing | Express 4 + routing-controllers |
| DI | TypeDI |
| ORM / migrations | TypeORM + PostgreSQL |
| Validation / serialization | class-validator + class-transformer |
| Auth | passport-jwt + jsonwebtoken + bcryptjs |
| Config | dotenv + envalid |
| Logging | winston + morgan |
| API docs | routing-controllers-openapi + swagger-ui-express |
| Cache / jobs | ioredis + BullMQ |
| Monitoring | prom-client + @godaddy/terminus |
| Testing | jest + supertest + testcontainers |
| Lint / format | Biome + husky + lint-staged |
| Dev / build | @swc-node + node --watch (dev) + tsc + tsc-alias (build) |

## Quick start

```bash
pnpm install
cp .env.example .env          # then fill in secrets
docker compose up -d          # Postgres + Redis
pnpm migration:run            # create schema
pnpm seed                     # admin@example.com / Abc@123456 + 10 users
pnpm dev                      # http://localhost:3000
```

- API base: `http://localhost:<PORT>/api`
- Swagger UI: `http://localhost:<PORT>/api-docs`
- Health: `/health/ready` (readiness), `/health/live` (liveness)
- Metrics: `/metrics` (Prometheus)
- Background worker: `pnpm worker`
- API client collection: [`bruno/`](./bruno) (open with [Bruno](https://www.usebruno.com))
- Full stack in Docker: `docker compose --profile full up -d` (api + Postgres + Redis)
- CI: `.github/workflows/ci.yml` (lint, typecheck, test, build, integration)

## Scripts

| Script | Purpose |
|--------|---------|
| `pnpm dev` | Hot-reload dev server (@swc-node + node --watch) |
| `pnpm build` / `pnpm start` | Compile to `dist/` / run compiled |
| `pnpm worker` | Run the BullMQ worker process |
| `pnpm test` / `pnpm test:int` | Unit / integration (testcontainers) tests |
| `pnpm typecheck` | Type-check src + tests (no emit) |
| `pnpm lint` / `pnpm lint:fix` | Biome lint/format |
| `pnpm migration:gen\|run\|revert` | TypeORM migrations |
| `pnpm seed` | Seed the database |

## Conventions

- **Path aliases** for all imports (`@config`, `@common`, `@modules`, `@database`, `@jobs`) — no relative `../../`.
- **Layering:** controller → service → **repository** (all DB access lives in `*.repository.ts`; services never touch QueryBuilder).
- **Structured responses:** `{ success, data, meta? }` / errors `{ success:false, error:{ code, message, details } }`.
- **Custom exceptions** extend routing-controllers `HttpError` with a stable `errorCode`.

## Documentation

See [`docs/`](./docs): [overview](./docs/project-overview-pdr.md) · [architecture](./docs/system-architecture.md) · [code standards](./docs/code-standards.md) · [codebase summary](./docs/codebase-summary.md) · [deployment](./docs/deployment-guide.md).
