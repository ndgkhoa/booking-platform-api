# Phase 04 — Transactional Outbox: Notifications & Webhooks

## Context Links
- Overview: [plan.md](plan.md) · Depends: [phase-03](phase-03-availability-booking-core.md)
- Existing: BullMQ email queue+worker (`src/jobs/queues/email.queue.ts`, `src/jobs/workers/email.worker.ts`).

## Overview
- **Priority:** P1
- **Status:** pending
- **Description:** Reliable event delivery via Transactional Outbox. Booking status changes write an `outbox_events` row in the SAME transaction as the state change; a relay dispatches to BullMQ (email: confirm/reminder) and internal webhooks. Avoids dual-write inconsistency.

## Key Insights
- **Dual-write problem:** writing booking to PG then enqueuing BullMQ in a separate step can lose events if the process dies between. Outbox fixes: event persisted atomically with the booking change; relay reads committed rows.
- Relay = poller (SELECT unprocessed FOR UPDATE SKIP LOCKED) OR listen/notify; start with poller (KISS) + interval.
- Outbox row is tenant-scoped but relay runs cross-tenant (system context) → relay uses a privileged path (bypass RLS or per-row SET tenant) — decide (open question in phase-07).
- Reminders = scheduled: a booking `confirmed` schedules a reminder job at `starts_at − lead`; cancellation must cancel/skip the reminder (check status at send time).
- Webhook = tenant-configured URL; sign payload (HMAC), retry with backoff, dead-letter.

## Requirements
**Functional**
- Every booking status change emits an outbox event atomically.
- Relay delivers: `booking.created/confirmed` → confirmation email; scheduled reminder email; `booking.*` → internal webhook if configured.
- At-least-once delivery; consumers idempotent.

**Non-functional**
- Outbox lag metric (prom-client). Dead-letter after N retries.

## Architecture
```
booking.service (inside tenant tx):
   UPDATE booking ... ; INSERT outbox_events(type,payload,status='pending')   ← atomic

OutboxRelay (worker, interval):
   SELECT * FROM outbox_events WHERE status='pending' FOR UPDATE SKIP LOCKED LIMIT k
   → enqueue BullMQ (email / webhook jobs) → mark 'dispatched'
   → on repeated failure → 'dead'

Email worker: send confirm/reminder (re-check booking status for reminders)
Webhook worker: POST signed payload to tenant webhook URL, retry/backoff
```
- **Data flow:** state change → outbox row (committed) → relay → queue → worker → external (email/webhook). Booking is single writer; delivery decoupled + retryable.

## Related Code Files
**Create**
- `src/modules/outbox/outbox-event.entity.ts` (`outbox_events`) — tenant_id, aggregate_type, aggregate_id, event_type, payload jsonb, status, attempts, available_at, created_at.
- `src/modules/outbox/outbox.repository.ts` — insert (called within booking tx), claimBatch (FOR UPDATE SKIP LOCKED), markDispatched/markDead.
- `src/jobs/workers/outbox-relay.worker.ts` — poller loop.
- `src/jobs/queues/webhook.job.ts` + `src/jobs/workers/webhook.worker.ts` — signed delivery, retry.
- Generalize `src/jobs/queues/email.queue.ts` payload to `{ template, to, data }` (replace single WelcomeEmailJob shape; keep welcome as one template).
- `src/modules/webhook/webhook-endpoint.entity.ts` (`webhook_endpoints`) — tenant_id, url, secret, active.
- `src/modules/webhook/{webhook.repository,webhook.service,webhook.controller}.ts` (owner configures URL).
- `src/common/monitoring/metrics.ts` — add outbox lag / dispatch counters.
- `src/database/migrations/{ts}-outbox-and-webhooks.ts`.

**Modify**
- `src/modules/booking/booking.service.ts` — write outbox event within each status-change tx (replaces phase-03 stub).
- `src/worker.ts` — register outbox relay + webhook worker.
- `src/jobs/workers/email.worker.ts` — handle template-based payloads incl. reminder status re-check.

**Delete** — none.

## Implementation Steps
1. OutboxEvent entity + migration (+RLS; relay path privileged).
2. Insert outbox row inside booking status-change transactions (atomic with booking write).
3. OutboxRelay worker: claim batch (SKIP LOCKED), dispatch to queues, mark dispatched/dead, backoff via `available_at`.
4. Generalize email queue payload; add confirmation + reminder templates.
5. Reminder scheduling: on confirm, enqueue delayed job at `starts_at − lead`; worker re-checks booking still confirmed before sending.
6. Webhook endpoint config (owner) + signed delivery worker with retry/dead-letter.
7. Metrics: outbox pending count, oldest-pending age, dispatch success/fail.
8. Tests: atomicity (rollback → no event), relay exactly-processes-once-ish (idempotent consumer), reminder skip on cancel, webhook signature.

## Todo
- [ ] OutboxEvent entity + repo (claim SKIP LOCKED)
- [ ] Migration: outbox_events + webhook_endpoints (+RLS)
- [ ] Booking tx writes outbox event atomically
- [ ] OutboxRelay worker (poller + backoff + dead-letter)
- [ ] Email payload generalized + confirm/reminder templates
- [ ] Reminder scheduling + status re-check
- [ ] Webhook endpoint config + signed delivery worker
- [ ] Outbox metrics
- [ ] Atomicity + delivery tests

## Success Criteria
- Booking tx rollback leaves zero outbox rows (atomicity test).
- Killing relay mid-run loses no events (resume from pending).
- Cancelled booking does not send reminder.
- Webhook payload HMAC-verifiable; failures retried then dead-lettered.

## Risk Assessment
| Risk | L×I | Mitigation |
|------|-----|-----------|
| Relay double-dispatch | Med×Med | SKIP LOCKED + idempotent consumers + dedupe key |
| Reminder sent after cancel | Med×Med | Re-check status at send time |
| Outbox table growth | Med×Low | Archive/delete dispatched after retention |
| Webhook SSRF to internal hosts | Med×High | Validate/allowlist URL host; block private ranges |

## Security Considerations
- Webhook payloads signed (HMAC secret per endpoint); reject non-https; SSRF guard on configured URL.
- Relay privileged DB path must be tightly scoped (system role), audited.

## Next Steps
- Decouples delivery from booking write. Enables reliable customer comms. Feeds nothing downstream (leaf), but hardened in phase-08.
