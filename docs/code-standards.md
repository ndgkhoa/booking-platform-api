# Code Standards

## Imports — path aliases only
Use aliases; never relative `../../`.

| Alias | Path |
|-------|------|
| `@/*` | `src/*` |
| `@config/*` | `src/config/*` |
| `@common/*` | `src/common/*` |
| `@modules/*` | `src/modules/*` |
| `@database/*` | `src/database/*` |
| `@jobs/*` | `src/jobs/*` |
| `@test/*` | `test/*` |

Resolved by tsconfig `paths` (dev via ts-node + tsconfig-paths; build via tsc-alias). Biome `organizeImports` sorts them.

## Layering (non-negotiable)
- **Controller** — routing + DTO binding only. No business logic, no DB.
- **Service** — business rules; throws domain exceptions; depends on repositories, never the ORM directly.
- **Repository** — the *only* place with `getRepository`/`QueryBuilder`. One per aggregate (`*.repository.ts`). Methods that participate in a caller's transaction take an optional `EntityManager` last param.
- **Exception:** a service orchestrating an atomic multi-entity unit of work may open `dataSource.transaction` and pass the `manager` to repositories; it must not call `getRepository` for querying itself.

## Responses
Every success is enveloped by `ResponseInterceptor`: `{ success:true, data, meta? }`. Pre-enveloped payloads (e.g. `paginated()`) pass through untouched. Never hand-build success envelopes in controllers.

## Errors & exceptions
- Throw subclasses of `AppException` (extends routing-controllers `HttpError`) from `@common/exceptions` — `NotFound`, `Conflict`, `Unauthorized`, `Forbidden`, `Validation`, `BadRequest`.
- Each carries an `errorCode`; the global `ErrorHandler` renders `{ success:false, error:{ code, message, details } }`, maps validation failures to 422 with `{ field, messages }` (never echoes submitted values), and hides 500 details in production.

## Validation & serialization
- DTOs use class-validator decorators; global `validation: { whitelist, forbidNonWhitelisted }`.
- Sensitive entity fields use class-transformer `@Exclude` (e.g. `passwordHash`) — stripped from all responses.

## Files & naming
- kebab-case, descriptive. **Stereotype is the last segment**: `<name>.<stereotype>.ts` — `user.repository.ts`, `error-handler.middleware.ts`, `tenant-role.enum.ts`, `base.entity.ts` (base classes are `base.<stereotype>.ts` → class `Base<Stereotype>`).
- Plain function-module utilities carry no forced stereotype suffix (`tenant-context.ts`, `postgres-error.ts`, `timeout.ts`).
- Symbols say what they are and disambiguate their axis: `TenantRole` vs `PlatformRole` (never a bare `Role`); classes PascalCase, files kebab-case matching.
- Cross-cutting infra lives under `common/` by concern (`common/context`, `common/persistence`), never mirroring a domain module name.
- Keep files focused/small; one concern per file.
- Tests: `test/unit/**/*.spec.ts` (unit) and `test/integration/**/*.e2e.spec.ts` (integration).

## Tooling
- **Biome** for lint + format (single quotes, 2-space, width 100, trailing commas). Parameter decorators enabled (`unsafeParameterDecoratorsEnabled`).
- Pre-commit: lint-staged runs Biome on staged files. Pre-push: `pnpm test`.
- Before pushing: `pnpm lint`, `pnpm typecheck`, `pnpm test` should all pass.

## Security defaults
helmet, CORS, rate-limit on `/api`, hpp, `x-powered-by` off, bcryptjs cost 12, short-lived JWT, generic auth errors (no user enumeration), `synchronize:false` (migrations only).
