# Code Standards

## Imports — path aliases only
Use aliases; never relative `../../`.

| Alias | Path |
|-------|------|
| `@/*` | `src/*` |
| `@config/*` | `src/config/*` |
| `@common/*` | `src/common/*` |
| `@health/*` | `src/health/*` |
| `@modules/*` | `src/modules/*` |
| `@database/*` | `src/database/*` |
| `@jobs/*` | `src/jobs/*` |

Resolved by tsconfig `paths` (dev via ts-node + tsconfig-paths; build via tsc-alias). Biome `organizeImports` sorts them.

## Layering (non-negotiable)
- **Controller** — routing + DTO binding only. No business logic, no DB.
- **Service** — business rules; throws domain exceptions; depends on repositories, never the ORM directly.
- **Repository** — the *only* place with `getRepository`/`QueryBuilder`. One per aggregate (`*.repository.ts`).

## Responses
Every success is enveloped by `ResponseInterceptor`: `{ success:true, data, meta?, timestamp }`. Pre-enveloped payloads (e.g. `paginated()`) pass through untouched. Never hand-build success envelopes in controllers.

## Errors & exceptions
- Throw subclasses of `AppException` (extends routing-controllers `HttpError`) from `@common/exceptions` — `NotFound`, `Conflict`, `Unauthorized`, `Forbidden`, `Validation`, `BadRequest`.
- Each carries an `errorCode`; the global `ErrorHandler` renders `{ success:false, error:{ code, message, details }, timestamp }`, maps validation failures to 422 with `{ field, messages }` (never echoes submitted values), and hides 500 details in production.

## Validation & serialization
- DTOs use class-validator decorators; global `validation: { whitelist, forbidNonWhitelisted }`.
- Sensitive entity fields use class-transformer `@Exclude` (e.g. `passwordHash`) — stripped from all responses.

## Files & naming
- kebab-case, descriptive (`user.repository.ts`, `error-handler.middleware.ts`).
- Keep files focused/small; one concern per file.
- Tests: `*.spec.ts` (unit, next to code) and `test/**/*.e2e.spec.ts` (integration).

## Tooling
- **Biome** for lint + format (single quotes, 2-space, width 100, trailing commas). Parameter decorators enabled (`unsafeParameterDecoratorsEnabled`).
- Pre-commit: lint-staged runs Biome on staged files. Pre-push: `pnpm test`.
- Before pushing: `pnpm lint`, `pnpm typecheck`, `pnpm test` should all pass.

## Security defaults
helmet, CORS, rate-limit on `/api`, hpp, `x-powered-by` off, bcrypt cost 12, short-lived JWT, generic auth errors (no user enumeration), `synchronize:false` (migrations only).
