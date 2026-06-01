# System Architecture

## Layers

```
HTTP request
  │
  ▼
Security middleware  (helmet, cors, json, hpp, rate-limit, morgan→winston, metrics, passport)
  │
  ▼
routing-controllers  ── @Authorized → authorizationChecker (passport-jwt + role check)
  │                                   └→ currentUserChecker (@CurrentUser)
  ▼
Controller (@JsonController)   thin — no business logic
  │
  ▼
Service (@Service)             business rules, throws domain exceptions
  │
  ▼
Repository (@Service)          ALL TypeORM access (getRepository / QueryBuilder)
  │
  ▼
PostgreSQL  (TypeORM DataSource)
```

Response path: controller return → **ResponseInterceptor** wraps in `{ success, data, meta? }`.
Error path: any throw → **ErrorHandler** (`@Middleware after`, `defaultErrorHandler:false`) → `{ success:false, error:{ code, message, details } }`.

## Dependency Injection

- TypeDI is the container; `useContainer(Container)` wires routing-controllers to it.
- Controllers/services/repositories are `@Service()` — constructor-injected.
- The TypeORM `DataSource` is registered in the container at bootstrap (`Container.set(DataSource, AppDataSource)`); repositories inject it and call `getRepository(Entity)`. (TypeORM 1.x dropped its own container integration, so we do not use `@InjectRepository`.)

## Request lifecycle for a protected route (`GET /api/users/me`)

1. Security middleware runs (incl. `passport.initialize()`).
2. `@Authorized()` → `authorizationChecker` → `passport.authenticate('jwt')` extracts + verifies the Bearer token, loads the user via `UserRepository`, attaches it to the request.
3. `@CurrentUser()` → `currentUserChecker` returns that user.
4. Controller returns the `User`; `classTransformer` strips `@Exclude` fields (password hash); `ResponseInterceptor` envelopes it.

## Background jobs

- Producer (`enqueueWelcomeEmail`) adds jobs to a BullMQ queue backed by Redis.
- A separate worker process (`pnpm worker`) consumes them. Queue and worker use independent Redis connections (`maxRetriesPerRequest: null`).

## Observability & lifecycle

- prom-client `/metrics`; per-request latency histogram via metrics middleware.
- terminus exposes `/health/ready` (DB + Redis readiness) and `/health/live`, and on SIGINT/SIGTERM closes the DataSource + Redis before exit (graceful shutdown).

## Build/runtime note

Decorator metadata (`emitDecoratorMetadata`) is required by TypeORM/TypeDI/routing-controllers. esbuild (tsx/tsup) does **not** emit it, so dev/CLI use **ts-node** and the build uses **tsc** (+ `tsc-alias` to resolve path aliases in `dist`).
