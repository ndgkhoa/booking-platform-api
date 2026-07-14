import { BaseTenantEntity } from '@common/base/tenant-entity.base';
import { OutboxStatus } from '@common/types';
import { Column, Entity, Index } from 'typeorm';

/** Written in the same transaction as the state change it describes, so it can never be lost to a dual-write; intentionally NOT under RLS so the system relay can drain it across tenants. */
@Entity('outbox_events')
@Index(['availableAt'], { where: `"status" = 'pending'` })
export class OutboxEvent extends BaseTenantEntity {
  @Column({ name: 'aggregate_type' })
  aggregateType!: string;

  @Column({ name: 'aggregate_id', type: 'uuid' })
  aggregateId!: string;

  @Column({ name: 'event_type' })
  eventType!: string;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({ type: 'varchar', default: OutboxStatus.Pending })
  status!: OutboxStatus;

  @Column({ type: 'int', default: 0 })
  attempts!: number;

  @Column({ name: 'available_at', type: 'timestamptz', default: () => 'now()' })
  availableAt!: Date;
}
