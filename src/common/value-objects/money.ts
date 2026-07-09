/**
 * Money as an integer count of minor units (e.g. VND đồng, or cents) plus an
 * ISO currency. Never a float — all arithmetic stays in integers to avoid
 * rounding drift. Immutable; equality is by value.
 */
export class Money {
  private constructor(
    readonly amount: number,
    readonly currency: string,
  ) {}

  static of(amount: number, currency = 'VND'): Money {
    if (!Number.isInteger(amount)) {
      throw new Error('Money amount must be an integer in minor units');
    }
    if (amount < 0) {
      throw new Error('Money amount must be non-negative');
    }
    return new Money(amount, currency.toUpperCase());
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amount + other.amount, this.currency);
  }

  multiply(factor: number): Money {
    if (!Number.isInteger(factor) || factor < 0) {
      throw new Error('Money multiplier must be a non-negative integer');
    }
    return new Money(this.amount * factor, this.currency);
  }

  equals(other: Money): boolean {
    return this.amount === other.amount && this.currency === other.currency;
  }

  private assertSameCurrency(other: Money): void {
    if (other.currency !== this.currency) {
      throw new Error(`Currency mismatch: ${this.currency} vs ${other.currency}`);
    }
  }
}
