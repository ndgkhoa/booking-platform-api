import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Inbound webhook idempotency marker (system-wide, not tenant-scoped). */
@Entity('webhook_receipts')
@Index(['provider', 'eventId'], { unique: true })
export class WebhookReceipt {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column()
  provider!: string;

  @Column({ name: 'event_id' })
  eventId!: string;
}
