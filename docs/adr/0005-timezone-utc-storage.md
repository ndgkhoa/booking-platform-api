# ADR 0005 — UTC storage, tenant-timezone compute, DST-safe math

**Status:** Accepted · **Date:** 2026-07-09

## Context

A booking platform is inherently time-zoned: a salon in Asia/Saigon and one in
Europe/Berlin both say "9:00" and mean different instants, and Berlin's wall
clock jumps an hour twice a year. Storing local times, or doing time math by
adding minutes to an instant, silently breaks around DST transitions and across
tenants.

## Decision

- **Store UTC.** All timestamps are `timestamptz`; the database holds instants.
- **Interpret in the tenant's IANA timezone.** Each tenant has a `timezone`
  (e.g. `Asia/Saigon`); availability, reporting buckets, and day boundaries are
  computed in that zone, then converted to UTC for storage/queries.
- **DST-safe wall-clock math with luxon.** To land on a wall-clock time we use
  `.set({ hour, minute })` in the tenant zone, never `.plus({ minutes })` on an
  instant — so "next day 09:00" stays 09:00 across a DST change. Reporting ranges
  interpret local dates as `:from::timestamp AT TIME ZONE :tz`.

## Consequences

- **+** One canonical instant per event; no ambiguity about what a stored time
  means. Cross-tenant and cross-zone correctness by construction.
- **+** DST transitions don't shift bookings or double-count report buckets;
  explicit DST test cases guard the math.
- **+** Clients can render in any zone from the UTC value.
- **−** Every read that shows or buckets time must know the tenant zone; a
  missing conversion is a bug (mitigated by centralising the logic).
- **−** luxon wall-clock vs instant arithmetic is a distinction developers must
  keep in mind.

## Alternatives considered

- **Store local time + a zone column:** every comparison needs conversion, range
  queries get error-prone, and DST-ambiguous local times have no single instant.
- **Assume one server/global timezone:** breaks the moment a second tenant lives
  in another zone; not viable for multi-tenant.
- **Add/subtract minutes on instants for scheduling:** silently wrong across DST
  boundaries — the exact bug this decision prevents.
