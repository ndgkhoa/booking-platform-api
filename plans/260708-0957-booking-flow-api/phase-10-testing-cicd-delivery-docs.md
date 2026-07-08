# Phase 10 — Testing, CI/CD, delivery, docs

## Context links
- Final phase. Reuse `.github/workflows/ci.yml`, `Dockerfile`, `bruno/`, `docs/`.

## Overview
- **Priority:** high (portfolio delivery) · **Status:** pending.
- Harden test suite, ship a real CI/CD pipeline with image registry + SemVer tags, deploy publicly, finalize docs.

## Requirements
- Contract tests validate responses against generated OpenAPI schema (backward-compat).
- Coverage gate in CI + Codecov badge. k6 load test for booking endpoint.
- CI security: gitleaks (secrets), `pnpm audit`, CodeQL, Dependabot/Renovate.
- CD: build + push image to **GHCR**; SemVer via conventional commits + release automation; deploy on release.

## CI/CD + tag strategy (senior)
- **Registry:** GHCR, login via `GITHUB_TOKEN`; `docker buildx` multi-arch + cache.
- **Versioning:** Conventional Commits → **release-please** auto-bumps version, generates `CHANGELOG.md`, creates git tag `vX.Y.Z` + GitHub Release.
- **Image tags:** `:sha-<gitsha>` (immutable — deploy pins this), `:1.2.3`/`:1.2`/`:latest` (moving, human), `:develop`/`:pr-123` (preview). Production references immutable sha.
- **Environments:** GitHub Environments `staging` (auto from develop) / `production` (protected + manual approve) → deploy Railway/Render.
- **Pipeline:** lint → typecheck → unit → build → integration → security scan → build&push image → release-please → deploy.

## Todo
- [ ] Contract tests (OpenAPI schema validation)
- [ ] Coverage gate + Codecov badge
- [ ] k6 booking load test + report
- [ ] gitleaks + pnpm audit + CodeQL + Dependabot
- [ ] GHCR build+push (buildx) in CI
- [ ] release-please + tag/image strategy
- [ ] GitHub Environments + deploy Railway/Render
- [ ] Demo seed (1 tenant + data), hosted Swagger + Bruno
- [ ] Docs: architecture diagram, ADRs finalized, README badges, demo video

## Success criteria
- Tag release → CI pushes image to GHCR → `docker run` serves `/api/v1/health`; public deploy reachable with demo tenant; README shows CI/coverage/version badges; contract + load tests green.

## Risks
- Secrets in CI: use GitHub Environments secrets; never echo. release-please requires clean conventional-commit history.

## Open questions
- Deploy target: Railway (default) vs Render?
- Real subdomain tenant resolution (wildcard DNS) vs JWT+header only for demo?
