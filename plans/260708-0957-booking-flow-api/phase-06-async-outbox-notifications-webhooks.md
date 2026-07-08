# Phase 6 — Async: transactional outbox, notifications, webhooks

## Context links
- Depends on Phase 4. Reuse `jobs/queues`, `jobs/workers`, `src/worker.ts`.

## Overview
- **Priority:** high (event-driven maturity) · **Status:** pending.
- Reliable event emission on booking state changes → email notifications + tenant outbound webhooks, with no lost events.

## Key insights
- **Transactional outbox**: write the event row in the *same* transaction as the booking state change → a relay worker publishes to BullMQ. Guarantees at-least-once delivery even on crash.

## Architecture
- `outbox_events` (id, tenant_id, aggregate, type, payload jsonb, created_at, processed_at). Written in the booking transaction.
- Relay worker polls unprocessed outbox rows → enqueues BullMQ jobs → marks processed.
- Notifications: email confirm on booking + reminder cron ~24h before; `notifications` log table.
- Outbound webhooks: `webhook_endpoints` (tenant_id, url, secret), `webhook_deliveries` (attempts, status, next_retry). Sign payload `HMAC-SHA256(secret)`; retry with backoff; dead-letter after N.

## Todo
- [ ] `outbox_events` + write in booking tx
- [ ] Relay worker (poll → enqueue → mark)
- [ ] Email confirm + 24h reminder cron + `notifications` log
- [ ] `webhook_endpoints` + `webhook_deliveries` + HMAC signing
- [ ] Retry/backoff + DLQ
- [ ] Tests: status change → email + webhook delivered; webhook 5xx → retry

## Success criteria
- Booking status change → outbox row → email + signed webhook delivered; failed webhook retried then dead-lettered; no event lost on worker restart (integration test).

## Risks
- Outbox growth → periodic prune of processed rows. Webhook to attacker-controlled URL → SSRF guard (block internal ranges), per-tenant enable flag (Phase 7 gating).

## Next
- Webhooks become a Pro-plan feature gated in Phase 7.
