import { BaseTenantEntity } from '@common/base/tenant-entity.base';
import type { OutboxStatus } from '@modules/outbox/outbox-status';
import { Column, Entity, Index } from 'typeorm';

/**
 * A domain event written in the SAME transaction as the state change it
 * describes (transactional outbox), so it can never be lost to a dual-write.
 * `tenant_id` routes the event; the table is infrastructure and is intentionally
 * NOT under RLS so the system relay can drain it across tenants.
 */
@Entity('outbox_events')
@Index(['status', 'availableAt'])
export class OutboxEvent extends BaseTenantEntity {
  @Column({ name: 'aggregate_type' })
  aggregateType!: string;

  @Column({ name: 'aggregate_id', type: 'uuid' })
  aggregateId!: string;

  @Column({ name: 'event_type' })
  eventType!: string;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({ type: 'varchar', default: 'pending' })
  status!: OutboxStatus;

  @Column({ type: 'int', default: 0 })
  attempts!: number;

  @Column({ name: 'available_at', type: 'timestamptz', default: () => 'now()' })
  availableAt!: Date;
}
