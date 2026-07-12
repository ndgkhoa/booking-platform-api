import { NotFoundException } from '@common/exceptions';
import { runInTenantContext } from '@common/tenant/tenant-transaction';
import { TenantStatus } from '@common/types/enums/tenant-status';
import type { AdminAction } from '@modules/admin/admin-audit-log.entity';
import { AdminAuditLog } from '@modules/admin/admin-audit-log.entity';
import { AdminAuditLogRepository } from '@modules/admin/admin-audit-log.repository';
import type { Subscription } from '@modules/subscription/subscription.entity';
import { SubscriptionService } from '@modules/subscription/subscription.service';
import { Tenant } from '@modules/tenant/tenant.entity';
import { TenantService } from '@modules/tenant/tenant.service';
import { Service } from 'typedi';
import { DataSource } from 'typeorm';

/**
 * Super-admin platform console. Runs OUTSIDE any tenant context (the super-admin
 * token carries no tenant claim), and reads tenant-scoped data only through an
 * explicit, audited per-tenant `SET app.tenant_id` path — never a blanket RLS
 * bypass. Every cross-tenant action is recorded in the immutable audit log.
 */
@Service()
export class AdminService {
  constructor(
    private readonly tenants: TenantService,
    private readonly subscriptions: SubscriptionService,
    private readonly audit: AdminAuditLogRepository,
    private readonly dataSource: DataSource,
  ) {}

  listTenants(): Promise<Tenant[]> {
    return this.tenants.listAll();
  }

  /** Tenant detail plus its current subscription, read under that tenant's own
   * RLS scope; the privileged access is audited. */
  async getTenantDetail(
    actorUserId: string,
    tenantId: string,
  ): Promise<{ tenant: Tenant; subscription: Subscription | null }> {
    const tenant = await this.tenants.getById(tenantId);
    // Record the privileged access before reading, so an attempt is audited even
    // if the tenant-scoped read fails.
    await this.audit.record({
      actorUserId,
      action: 'tenant.view',
      targetTenantId: tenantId,
      metadata: null,
    });
    const subscription = await runInTenantContext(this.dataSource, tenantId, () =>
      this.subscriptions.currentSubscription(),
    );
    return { tenant, subscription };
  }

  suspend(actorUserId: string, tenantId: string, reason?: string): Promise<Tenant> {
    return this.changeStatus(
      actorUserId,
      tenantId,
      TenantStatus.Suspended,
      'tenant.suspend',
      reason,
    );
  }

  reactivate(actorUserId: string, tenantId: string): Promise<Tenant> {
    return this.changeStatus(actorUserId, tenantId, TenantStatus.Active, 'tenant.reactivate');
  }

  /**
   * Flips a tenant's status and writes the audit entry in ONE transaction, so a
   * privileged mutation can never land without its audit record (or vice versa).
   * Spans two aggregates as a deliberate unit of work — like tenant onboarding —
   * hence the direct manager access rather than routing through each service.
   */
  private async changeStatus(
    actorUserId: string,
    tenantId: string,
    status: TenantStatus,
    action: AdminAction,
    reason?: string,
  ): Promise<Tenant> {
    return this.dataSource.transaction(async (manager) => {
      const tenantRepo = manager.getRepository(Tenant);
      const tenant = await tenantRepo.findOne({ where: { id: tenantId } });
      if (!tenant) {
        throw new NotFoundException('Tenant not found');
      }
      tenant.status = status;
      await tenantRepo.save(tenant);
      const logRepo = manager.getRepository(AdminAuditLog);
      await logRepo.save(
        logRepo.create({
          actorUserId,
          action,
          targetTenantId: tenantId,
          metadata: reason ? { reason } : null,
        }),
      );
      return tenant;
    });
  }
}
