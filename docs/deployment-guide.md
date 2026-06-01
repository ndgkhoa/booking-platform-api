# Deployment Guide

## Environment variables (envalid-validated at startup)

| Var | Required | Default | Notes |
|-----|----------|---------|-------|
| `NODE_ENV` | — | development | development \| test \| production |
| `PORT` | — | 3000 | HTTP port |
| `CORS_ORIGIN` | — | * | tighten in production |
| `DB_HOST/PORT/USER/PASSWORD/NAME` | yes | localhost/5432 | PostgreSQL |
| `JWT_SECRET` | yes | — | use a long random value |
| `JWT_EXPIRES_IN` | — | 15m | access-token TTL |
| `REDIS_HOST/PORT` | — | localhost/6379 | |
| `REDIS_PASSWORD` | — | (empty) | empty = no auth |
| `LOG_LEVEL` | — | info | |
| `SWAGGER_ENABLED` | — | true | set false to hide `/api-docs` in prod |
| `METRICS_ENABLED` | — | true | set false / gate `/metrics` internally |

The app **fails fast** at startup if a required var is missing or malformed.

## Local infrastructure
```bash
docker compose up -d        # Postgres 17 + Redis 7 (reads .env)
```
`docker-compose.yml` substitutes `${DB_*}` / `${REDIS_*}` from `.env`. `POSTGRES_PASSWORD` only applies on first volume creation — change it ⇒ `docker compose down -v` to reset.

## Build & run (production)
```bash
pnpm install --prod=false
pnpm build                  # tsc + tsc-alias → dist/
pnpm migration:run          # apply migrations (never synchronize)
node dist/index.js          # or: pnpm start
pnpm worker                 # separate process for background jobs
```

## Docker

Multi-stage `Dockerfile` (build with full deps → slim non-root runtime). All deps are pure-JS, so no native build toolchain is needed in the image.

```bash
docker build -t express-typestack .
# full stack (app + postgres + redis) via compose:
docker compose --profile full up -d        # app is behind the "full" profile
docker compose up -d                        # plain: only postgres + redis (dev)
```
The `app` compose service reads `.env` and overrides `DB_HOST=postgres` / `REDIS_HOST=redis` for the compose network.

## CI

`.github/workflows/ci.yml` runs on push to `main`/`develop` and on PRs: install → lint → typecheck → unit tests → build → integration tests (testcontainers; Docker is preinstalled on GitHub runners). DB/JWT env vars are injected as dummies for envalid.

## Migrations
- Generate after entity changes: `pnpm migration:gen` (needs a reachable DB).
- Apply: `pnpm migration:run`. Revert: `pnpm migration:revert`.
- `synchronize` is always `false` — schema changes go through migrations.

## Health & monitoring (for orchestrators)
- **Liveness:** `GET /health/live` — process up.
- **Readiness:** `GET /health/ready` — 200 when Postgres + Redis reachable, else 503.
- **Metrics:** `GET /metrics` — Prometheus scrape target.
- **Graceful shutdown:** SIGTERM/SIGINT → terminus drains connections, closes DataSource + Redis, then exits (set a generous `terminationGracePeriodSeconds` in k8s).

## CI checklist
Docker is required for integration tests (testcontainers). Run in order:
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm test:int && pnpm build
```

## Unresolved / future
- Refresh-token flow is out of scope (only short-lived access tokens).
- `/api-docs` and `/metrics` exposure in production should be gated (env flags provided) behind internal network or auth.
