# Project Overview

## What
A production-ready starting point for building REST APIs in TypeScript on the TypeStack ecosystem (routing-controllers + TypeDI + TypeORM). It ships the cross-cutting concerns every real service needs so a new feature only requires adding a module (entity + repository + service + controller + DTOs).

## Why these choices
- **routing-controllers + TypeDI** — declarative controllers and clean constructor injection; less boilerplate than hand-wired Express.
- **Repository layering** — keeps SQL out of services, making business logic unit-testable by mocking one boundary.
- **Structured responses + custom exceptions** — every client gets a predictable envelope and stable error codes.
- **First-class ops** — OpenAPI docs, Prometheus metrics, health checks, and graceful shutdown are built in, not bolted on.

## Locked technical decisions
| Decision | Reason |
|----------|--------|
| Express **4** (not 5) | routing-controllers 0.11 is incompatible with Express 5 routing |
| Build with **tsc** (dev/CLI **ts-node**), not tsx/tsup | esbuild does not emit `emitDecoratorMetadata` required by the decorator stack |
| **PostgreSQL** | testcontainers + migrations tuned for it |
| Repositories inject `DataSource` (no `@InjectRepository`) | TypeORM 1.x dropped container integration |

## Scope
**In:** auth (register/login, JWT, roles), user module, validation, OpenAPI, caching + job queue, metrics, health, migrations + seeding, unit + integration tests, lint/format/hooks.

**Out (intentional):** refresh tokens, email provider integration (worker stub only), production secrets management, multi-tenant concerns.

## Success criteria
- `pnpm dev` boots with DB + Redis; `pnpm build`/`start` run the compiled app.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:int` all green.
- Swagger UI documents every route with DTO schemas + bearer auth.
- Graceful shutdown closes all resources cleanly.
