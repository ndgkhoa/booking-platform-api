# Code Review — Phase-04 Slice B: signed webhook delivery + SSRF guard + outbox metrics

Branch `develop` · HEAD `87ca2f7` "feat(webhook): signed webhook delivery" vs `HEAD~1`.
Read-only review. Scope: webhook module, webhook queue/worker, outbox-relay dispatch, metrics, migration.
Prereqs green: typecheck, lint, unit 29/29, integration 57/57.

## Verdict
**BLOCK before Phase 05.** The SSRF guard has a whole-address-family bypass (all IPv6, incl. loopback and IPv4-mapped cloud-metadata) plus redirect-follow and DNS-rebinding holes — the guard's core purpose is defeated for a determined tenant. Also two real production defects: fetch never aborted on timeout (socket leak), and the entire `outbox_*` metric family is invisible on `/metrics` (wrong process). Everything else is Medium/Low and can follow.

---

## CRITICAL

### C1 — SSRF: all IPv6 literals bypass the guard; `::1`/`fc`/`fd` branches are dead code
`src/modules/webhook/webhook-url.ts:10-23`

WHATWG `URL` keeps the brackets in `url.hostname` for IPv6 (verified: `new URL('https://[::1]/').hostname === '[::1]'`). Then `isIP('[::1]') === 0` (brackets make it a non-IP), so `isBlockedHost` hits the early `return false` at line 11 and never reaches the IPv6 comparisons. Consequently:
- `lower === '::1'`, `lower.startsWith('fc')`, `lower.startsWith('fd')` (lines 16, 21-22) are **unreachable dead code** — `lower` is always `[....]` when it's IPv6.
- Every IPv6 target is allowed: `https://[::1]/` (loopback), `https://[fe80::1]/` (link-local), `https://[fd00::1]/` (ULA), and worst — `https://[::ffff:169.254.169.254]/` (IPv4-mapped **cloud metadata**) and `https://[::ffff:127.0.0.1]/` (mapped loopback). Verified all parse with `isIP===0`.

Impact: full SSRF to loopback/link-local/metadata over IPv6, i.e. the exact thing the guard exists to stop.

Fix: normalise then validate against the *resolved numeric* address, not the raw hostname string. Concretely:
1. Strip brackets: `const host = url.hostname.replace(/^\[|\]$/g, '')`.
2. If `isIP(host) !== 0`, block on a parsed-IP basis: reject loopback (`127.0.0.0/8`, `::1`), link-local (`169.254.0.0/16`, `fe80::/10`), ULA (`fc00::/7`), private v4 (`10/8`, `172.16/12`, `192.168/16`), unspecified (`0.0.0.0/8`, `::`), and **IPv4-mapped IPv6** (`::ffff:0:0/96` — unwrap the embedded v4 and re-check). Prefer a vetted lib (`ip`, `ipaddr.js`) over hand-rolled prefix matching.
3. If it's a hostname, see C2.

### C2 — SSRF: hostnames are never resolved (DNS rebinding / internal names)
`src/modules/webhook/webhook-url.ts:10-11`

For a hostname `isIP===0` → `return false` (allowed) with no DNS lookup. So a public name resolving to `127.0.0.1`/`169.254.169.254`/an RFC1918 host passes registration *and* the send-time re-check. Rebinding: resolve-benign-at-register, resolve-internal-at-send. Internal corp names not ending in `.internal`/`.localhost` (e.g. `vault.prod`, bare `metadata`) also pass. Note: decimal/hex/short IPv4 (`2130706433`, `0x7f000001`, `127.1`) are **safe** — WHATWG URL normalises them to `127.0.0.1` and the literal check catches them (verified).

Fix (defence in depth):
- Registration: resolve the hostname (`dns.lookup(host, {all:true})`) and reject if **any** returned address is private/loopback/link-local (reuse the C1 IP classifier).
- Send time (the only point that defeats rebinding): resolve, pin, and connect to the checked IP — e.g. a custom `undici` Agent with a `lookup` hook that re-validates the address at connect, or resolve-then-connect-by-IP with SNI/Host preserved. At minimum, re-resolve immediately before the request and validate.

### C3 — SSRF: `fetch` follows redirects → 302 to internal target bypasses both https and IP checks
`src/modules/webhook/webhook-delivery.service.ts:26-34`

`assertSafeWebhookUrl` validates only the *initial* stored URL. Node global `fetch` defaults to `redirect:'follow'` (up to 20 hops), so a public `https://…` endpoint can `302 → http://169.254.169.254/…` or any private host, bypassing both the https-only and IP guards.

Fix: pass `redirect: 'manual'` and treat 3xx as a delivery failure (or follow manually, re-running `assertSafeWebhookUrl` — with C1/C2 fixes — on each `Location` and capping hops). Simplest correct default: `redirect: 'manual'`, throw on 3xx.

> C1-C3 are one attack surface. All three must land together; fixing only literals still leaves IPv6 + redirect + rebinding open.

---

## HIGH

### H1 — Timeout does not abort the fetch → socket/connection leak under load
`src/modules/webhook/webhook-delivery.service.ts:25-37`, `src/common/utils/timeout.ts`

`withTimeout` is `Promise.race([fetch, timeout])`. On timeout the race rejects but the underlying `fetch` keeps running — the TCP socket lingers until the OS/undici default (~300s). With `concurrency:5` + 5 retries against slow/black-hole endpoints, sockets and undici connections accumulate → pool/fd exhaustion. Secondary: the `setTimeout` in `withTimeout` is **never cleared**, so even on fast success a 5s timer stays armed each call (event-loop refs pile up).

Fix: use `AbortController`:
```ts
const ac = new AbortController();
const t = setTimeout(() => ac.abort(), DELIVERY_TIMEOUT_MS);
try {
  const res = await fetch(url, { ...opts, signal: ac.signal, redirect: 'manual' });
  ...
} finally { clearTimeout(t); }
```
Drop `withTimeout` for this path (or have it clear its timer on settle). Aborting frees the socket immediately.

### H2 — Entire `outbox_*` metric family is exposed on the wrong process → always stale/zero
`src/common/monitoring/metrics.ts:15-33`, `src/jobs/workers/outbox-relay.worker.ts:59-60`, `src/modules/outbox/outbox-relay.service.ts:36,41`, `src/server.ts:78-80`, `src/worker.ts`

`/metrics` is served only by the API process (`server.ts` → `index.ts` `createServer`). But `outboxPending`, `outboxOldestPendingSeconds` (set in the relay worker) and `outboxDispatched.inc` (set in `OutboxRelay.processBatch`) all run in the **worker** process (`worker.ts`, which starts no HTTP server — verified). Each process has its own in-memory prom registry, so on the API's registry these three metrics are registered but forever `0`/stale. Backlog and dispatch-rate alerting is silently blind — the worst kind of observability gap because the endpoint *looks* healthy.

Fix (pick one): (a) expose a minimal `/metrics` HTTP listener in `worker.ts` on its own registry and scrape both processes; (b) push to a Pushgateway from the worker; or (c) compute backlog gauges in the API on scrape (query `backlogStats` in the `/metrics` handler) — but the dispatch counter fundamentally belongs to the worker, so (a) is the clean answer.

---

## MEDIUM

### M1 — No timestamp in signed content → replay attack
`src/modules/webhook/webhook-signature.ts:7-9`, `webhook-delivery.service.ts:24-33`

Signature covers only the body. A captured request is replayable indefinitely; receivers can't bound freshness. Standard fix (Stripe-style): send `x-webhook-timestamp`, sign `` `${ts}.${body}` ``, and have receivers reject when `|now-ts|` exceeds a tolerance. Requires a matching verify helper + doc.

### M2 — Send/verify signature wire formats disagree
`webhook-delivery.service.ts:31` sends `x-webhook-signature: sha256=<hex>`; `webhook-signature.ts:12-17` `verifyWebhook` compares against **bare** `<hex>`. A receiver using our own helper with the raw header value fails on the length check. Decide one format, strip the `sha256=` prefix inside `verifyWebhook` (or fold the scheme in), and document it. Also fold M1's timestamp into the same helper.

### M3 — Single-active-endpoint enforced only by TOCTOU app check → duplicate active rows
`webhook.service.ts:25-29`, migration `1780299100000-WebhookEndpoints.ts`

`findActive()` then `createOne()` is check-then-act; two concurrent owner POSTs both pass and insert two `active=true` rows. `findActive()` (`findOne where active`) then returns an arbitrary one non-deterministically. Owner-only + low concurrency makes it unlikely, but it's unconstrained. Fix: partial unique index
`CREATE UNIQUE INDEX uq_webhook_active_per_tenant ON webhook_endpoints (tenant_id) WHERE active AND deleted_at IS NULL;`
and map the constraint violation to `ConflictException`.

### M4 — SSRF hardening gaps: `127.0.0.0/8` (except `.0.0.1`), `0.0.0.0/8`, arbitrary ports
`webhook-url.ts:14-20`

Even for literal IPv4: `127.0.0.2` and the rest of `127/8` pass (only `127.0.0.1` is listed — verified `isIP('127.0.0.2')===4`, no match). `0.0.0.0/8` beyond the exact `0.0.0.0` passes. No port restriction (`https://public-host:8500`). Folds into the C1 IP-classifier fix (use CIDR ranges, not exact strings); add an allowed-port policy if desired.

---

## LOW

- **L1 — Wasted webhook jobs + a tenant tx per booking event for tenants with no endpoint.** `outbox-relay.worker.ts:31-40` always enqueues; `webhook.worker.ts:24-29` opens `runInTenantContext` (a real tx) to `findActive()` → null → no-op. For the common no-webhook tenant this is a job + tx per event. Acceptable for now (documented), but at volume consider a cached per-tenant "has active webhook" check before enqueue. Trade-off: dispatch runs cross-tenant, so the check needs its own scoped query.
- **L2 — No permanent-vs-transient delivery classification.** `webhook-delivery.service.ts:38-39` throws on any non-2xx; BullMQ retries 4xx (400/401/404/410) 5× pointlessly. Consider not retrying 4xx (except 408/429).
- **L3 — `verifyWebhook` compares hex as UTF-8 buffers.** `webhook-signature.ts:14-17` — correct and constant-time given the length pre-check, but decoding hex→Buffer (`Buffer.from(sig,'hex')`) is the more conventional form. Cosmetic.

---

## Verified good (do not re-flag)
- Signed body **is** the sent body — `JSON.stringify(payload)` computed once, signed and sent (`webhook-delivery.service.ts:24-33`). ✔
- Secret exposure: `create()` returns a plain object with `secret` exactly once (`webhook.service.ts:18-31`); `@Exclude` strips it from `list()`/`findActive()` entity reads (`webhook-endpoint.entity.ts:12-14`); worker uses `endpoint.secret` internally, never serialised/logged. ✔
- Constant-time compare with length guard avoids `timingSafeEqual` throw on mismatched lengths (`webhook-signature.ts:14-17`). ✔
- No SSRF false-positive on public hosts: `isIP===0` early-returns before the `10.`/`192.168.` prefix checks, so `10.example.com` isn't misclassified. ✔
- Decimal/hex/short IPv4 loopback (`2130706433`, `0x7f000001`, `127.1`) normalised to `127.0.0.1` by WHATWG URL → caught. ✔
- Migration: RLS `ENABLE`+`FORCE`, tenant policy with `USING`+`WITH CHECK`, tenant index, FK `ON DELETE CASCADE`. ✔
- Worker tenant scoping: `runInTenantContext` reads the row under RLS; tenant-deleted → null → clean no-op; empty tx commits fine. Per-job tx overhead acceptable at this scale. ✔
- Send-time `assertSafeWebhookUrl` re-check guards against a guard-tightening after storage (good — though defeated by C2/C3 until fixed). ✔
- jobId dedup (`webhook:${event.id}`) makes at-least-once relay redelivery idempotent at enqueue. ✔

## Test-coverage gaps (informational)
E2E (`test/integration/webhook.e2e.spec.ts:51-75`) covers only literal `http://`, `https://127.0.0.1`, `https://localhost`. Missing: IPv6 (`[::1]`, `[::ffff:169.254.169.254]`), `127.0.0.2`, redirect-to-internal, hostname-resolving-to-private. Add these alongside the C1-C3 fix so the regressions are pinned.

## Blockers before Phase 05
- C1, C2, C3 (SSRF) — must fix together.
- H1 (abort on timeout), H2 (worker metrics exposure).
- M3 (unique index) recommended before multi-owner concurrency is exercised.

## Unresolved questions
1. Deployment topology of `/metrics`: is Prometheus expected to scrape the worker at all today, or is outbox alerting deferred? Determines whether H2 is fix-now vs tracked.
2. Is `verifyWebhook` shipped to receivers (SDK) or internal test-only? Governs urgency of M2 wire-format alignment.
3. Any requirement to support IPv6-only receiver endpoints? If not, a simpler stance is to reject all IPv6 literals outright (still need C2/C3).
4. Egress network posture — is the worker on a segment with a metadata endpoint / RFC1918 reachability? If fully egress-firewalled, SSRF severity drops from Critical to High, but code-level fix still required (defence in depth).

## Status
**Status:** DONE_WITH_CONCERNS
**Summary:** Reviewed webhook Slice B. SSRF guard has critical whole-IPv6 bypass (bracketed hostname defeats `isIP`, making `::1`/`fc`/`fd` branches dead code) plus redirect-follow and no-DNS-resolution holes; fetch isn't aborted on timeout (socket leak); and the entire `outbox_*` metric family is set in the worker but only exposed on the API process, so it's always zero.
**Concerns/Blockers:** C1-C3 (SSRF), H1 (abort), H2 (metrics process gap) block Phase 05. Empirically verified all bypass vectors and the process split.
