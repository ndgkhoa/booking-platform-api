# Senior Add-ons — Research Backlog

Recruiter-impressing enhancements. Status legend:
- ✅ **opted-in** — fold into the phase noted, will implement.
- 🔬 **research-later** — recorded for the user to study; not committed yet.
- ⛔ **skip** — recorded with rationale; deliberately not doing (avoiding over-engineering is itself a senior signal).

Each row: what · why it scores · candidate lib/approach · lands in phase.

---

## Tier 1 — cheap, high-ROI, expected of any senior repo (ALL ✅)

| Status | Item | Why it scores | Candidate / approach | Phase |
|--------|------|---------------|----------------------|-------|
| ✅ | README architecture + booking sequence diagram | First thing read; shows communication | Mermaid (`/ck:mermaidjs-v11`) or C4; embed k6 result image | 08 |
| ✅ | Engineering narrative: the double-booking problem | Interview story recruiters remember | `docs/engineering-notes/*.md`: problem → options (app-lock vs advisory vs EXCLUDE) → choice → benchmark | 08 |
| ✅ | Live demo deploy + seeded demo tenant | "Click-to-run" beats any README | Railway/Fly.io; public Swagger; read-only demo creds | 08 |
| ✅ | RFC 7807 Problem Details for errors | Recognizable IETF standard = "company-grade" | Map `AppException` → `application/problem+json` (`type,title,status,detail,instance` + `errorCode`, `tenantId` ext). Keep success envelope | 00 (error-handler) |
| ✅ | Security scan in CI | Shift-left security signal | Trivy (image), Semgrep or GitHub CodeQL (SAST), `pnpm audit --prod` | 08 |
| ✅ | CI quality gates | "Chuẩn team" | Coverage threshold fail, migration up/down check, docker build job, pnpm cache, matrix | 08 |

## Tier 2 — real differentiators, few candidates do these

| Status | Item | Why it scores | Candidate / approach | Phase |
|--------|------|---------------|----------------------|-------|
| ✅ | OpenTelemetry distributed tracing | Trace spans HTTP→service→BullMQ→worker = strongest "operated prod" signal; supersedes correlation-id | `@opentelemetry/sdk-node` + auto-instrumentations (http, express, pg, ioredis); BullMQ manual span links (trace ctx in job data); OTLP→Jaeger dev; inject `trace_id` into winston | 00 |
| ✅ | Refresh token rotation + reuse detection | Detects stolen tokens (reused revoked refresh → revoke whole family) | Rotate refresh each use; store hashed token + family/generation (Redis/PG); theft response revokes family | 01 |
| ✅ | ETag / `If-Match` optimistic concurrency | HTTP-native concurrency, ties to `@VersionColumn` | `ETag` from version on booking GET; `If-Match` required on reschedule/cancel → `412` on stale | 03 |
| 🔬 | Mutation testing (Stryker) | Proves tests actually catch bugs, not just coverage %; <5% of candidates do it | `@stryker-mutator/core` + jest runner; gate mutation score on core domain (availability/state) | 08 |
| 🔬 | Property-based testing (fast-check) | Fuzz thousands of time-range/DST cases vs a few hand tests; "tests the hard part" | `fast-check` generators for `TimeRange`, working-hours vs bookings overlap invariants | 03 |
| 🔬 | Grafana dashboard JSON committed | "Observability = visualize, not just expose" | Prometheus (already) + committed dashboard JSON + docker-compose Grafana | 08 |
| 🔬 | Audit log (who/what/when per tenant) | Enterprise compliance signal | Append-only `audit_logs` table via subscriber/interceptor; immutable | later |

## Tier 3 — vanity / over-engineering at this scale (ALL ⛔, recorded with rationale)

| Status | Item | Rationale to skip |
|--------|------|-------------------|
| ⛔ | CQRS / Event Sourcing | No read/write asymmetry that justifies it; outbox covers async. Senior interviewer would ask "why?" and it's unjustifiable here. |
| ⛔ | Kafka / message broker | BullMQ + outbox is sufficient; Kafka is infra theatre at this scale. |
| ⛔ | Microservices split | Modular monolith is the correct call; premature decomposition = classic over-engineering. |
| ⛔ | GraphQL alongside REST | Doubles API surface for no requirement; scope bloat. |
| ⛔ | Full Kubernetes manifests / Helm | docker-compose + one multi-stage Dockerfile is enough; K8s only to "show off" dilutes focus. |
| ⛔ | Full Hexagonal everywhere | Already decided: Pragmatic Modular; domain extracted only for availability/state/VOs. |
