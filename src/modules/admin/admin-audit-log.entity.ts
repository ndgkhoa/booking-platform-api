import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Super-admin action a log entry records. */
export type AdminAction = 'tenant.view' | 'tenant.suspend' | 'tenant.reactivate';

/**
 * Immutable, append-only record of every privileged cross-tenant super-admin
 * action. Not tenant-scoped (a platform-wide log). No update/delete columns —
 * the production migration additionally blocks UPDATE/DELETE at the DB level.
 */
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
