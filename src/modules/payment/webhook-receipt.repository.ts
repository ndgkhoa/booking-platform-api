import { getTenantManager } from '@common/tenant/tenant-context';
import type { PaymentProviderName } from '@modules/payment/payment-provider.interface';
import { Service } from 'typedi';
import { DataSource } from 'typeorm';

/**
 * System-level idempotency for INBOUND provider webhooks. `webhook_receipts` has
 * no tenant column and no RLS; the claim runs on the caller's transaction manager
 * so it commits or rolls back atomically with the event's side effects.
 */
@Service()
export class WebhookReceiptRepository {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * True if this event id was newly claimed; false if already processed. Runs on
   * the active tenant transaction so the claim and the apply are all-or-nothing.
   */
  async claim(provider: PaymentProviderName, eventId: string): Promise<boolean> {
    const manager = getTenantManager() ?? this.dataSource.manager;
    const result = await manager.query(
      `INSERT INTO "webhook_receipts" ("provider", "event_id")
       VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING "id"`,
      [provider, eventId],
    );
    return result.length > 0;
  }
}
