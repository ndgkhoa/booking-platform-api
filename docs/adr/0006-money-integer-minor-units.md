# ADR 0006 — Money as integer minor units

**Status:** Accepted · **Date:** 2026-07-09

## Context

Prices (services, plans, revenue reports) are money. Representing money as a
floating-point number invites rounding drift — `0.1 + 0.2 !== 0.3` — which
accumulates across sums and breaks reconciliation. Currencies also differ in how
many minor units they have (VND has none; USD/EUR have two).

## Decision

Store and compute money as an **integer count of the currency's minor units**,
paired with an explicit currency code:

- `price_amount` is an `integer` (e.g. `20000000` = ₫20,000,000 for VND, which
  has zero decimal places; for USD it would be cents).
- `price_currency` is a 3-letter code stored alongside the amount.
- Arithmetic (revenue sums, totals) is integer arithmetic; formatting to a
  decimal string happens only at the presentation edge, per currency.
- Revenue reporting groups by currency — amounts in different currencies are
  never summed into one number.

## Consequences

- **+** Exact arithmetic; no float rounding drift in prices or revenue totals.
- **+** Currency is explicit, so multi-currency data can't be silently added.
- **+** Values are safe within JS integer range for realistic amounts.
- **−** The minor-unit scale is per currency, so formatting/parsing must know the
  currency's exponent; a raw amount is meaningless without its code.
- **−** Very large aggregates would eventually need `bigint`; acceptable at
  current scale.

## Alternatives considered

- **Floating-point (`float`/`double`):** rounding errors accumulate; unacceptable
  for money.
- **Decimal/numeric type only:** exact, but invites treating money as a bare
  number without a currency and pushes formatting concerns into every layer;
  integer-minor-units + explicit currency is simpler and JS-friendly.
- **A money value object wrapping amount+currency everywhere:** more ceremony
  than needed now; the integer+code convention plus per-currency grouping
  captures the essential guarantees.
