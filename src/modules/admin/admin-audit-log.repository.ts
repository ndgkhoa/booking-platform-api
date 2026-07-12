import { AdminAuditLog } from '@modules/admin/admin-audit-log.entity';
import { Service } from 'typedi';
import { DataSource, type Repository } from 'typeorm';

/** Persists and reads the append-only super-admin audit trail (global, not
 * tenant-scoped — the super-admin path runs outside any tenant context). */
@Service()
export class AdminAuditLogRepository {
  private readonly repo: Repository<AdminAuditLog>;

  constructor(dataSource: DataSource) {
    this.repo = dataSource.getRepository(AdminAuditLog);
  }

  record(
    entry: Pick<AdminAuditLog, 'actorUserId' | 'action' | 'targetTenantId' | 'metadata'>,
  ): Promise<AdminAuditLog> {
    return this.repo.save(this.repo.create(entry));
  }
}
