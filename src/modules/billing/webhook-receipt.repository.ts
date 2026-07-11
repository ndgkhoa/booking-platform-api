import type { PaymentProviderName } from '@modules/billing/payment-provider.interface';
import { Service } from 'typedi';
import { DataSource } from 'typeorm';

/**
 * System-level idempotency for INBOUND provider webhooks (no tenant context).
 * Claims a (provider, event_id) once; a replay conflicts and is a no-op.
 */
@Service()
export class WebhookReceiptRepository {
  constructor(private readonly dataSource: DataSource) {}

  /** True if this event id was newly claimed; false if already processed. */
  async claim(provider: PaymentProviderName, eventId: string): Promise<boolean> {
    const result = await this.dataSource.query(
      `INSERT INTO "webhook_receipts" ("provider", "event_id")
       VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING "id"`,
      [provider, eventId],
    );
    return result.length > 0;
  }
}
