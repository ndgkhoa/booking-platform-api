# Phase 0 — Rename repo + API versioning ✅ DONE

## Overview
- **Priority:** foundational · **Status:** completed (commit `feat(api): rebrand to booking-flow-api and version routes under /api/v1`)
- Rename `express-typeorm` → `booking-flow-api` (local + git remote), move API to `/api/v1`, scaffold ADRs.

## What was done
- `gh repo rename booking-flow-api` → remote now `git@github.com:ndgkhoa/booking-flow-api.git`.
- `package.json` name/description; `README.md` title + API base; `docker-compose.yml` default DB `booking_flow`; `.env.example` `DB_NAME=booking_flow`.
- `src/server.ts` `routePrefix: '/api/v1'` (rate limiter left at `/api` — covers all versions).
- Updated integration tests (`auth.e2e`, `user.e2e`, `support/user.fixture`) + Bruno env `apiUrl` to `/api/v1`.
- ADR scaffold: `docs/adr/0000-adr-template.md`, `0001-multi-tenancy-isolation-strategy.md`, `0002-booking-concurrency-control.md`.

## Success criteria (met)
- typecheck ✓ · biome lint ✓ (52 files) · unit 7/7 ✓ · integration 9/9 ✓ · repo renamed.

## Follow-ups
- Push branch + confirm CI green on rename (remote switched HTTPS→SSH — verify SSH key works on first push).
- Physical local folder rename optional (would change CWD; defer).
