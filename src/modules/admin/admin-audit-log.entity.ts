import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type AdminAction = 'tenant.view' | 'tenant.suspend' | 'tenant.reactivate';

/** Immutable, platform-wide (not tenant-scoped) log; migration also blocks UPDATE/DELETE at the DB level. */
@Entity('admin_audit_logs')
@Index(['targetTenantId', 'createdAt'])
export class AdminAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'actor_user_id', type: 'uuid' })
  actorUserId!: string;

  @Column({ type: 'varchar' })
  action!: AdminAction;

  @Column({ name: 'target_tenant_id', type: 'uuid' })
  targetTenantId!: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;
}
