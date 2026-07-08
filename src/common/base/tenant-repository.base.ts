import { getTenantId, getTenantManager } from '@common/tenant/tenant-context';
import type {
  DataSource,
  DeepPartial,
  EntityManager,
  EntityTarget,
  FindManyOptions,
  FindOneOptions,
  FindOptionsWhere,
  ObjectLiteral,
  Repository,
} from 'typeorm';

/**
 * Base repository for tenant-scoped aggregates. Two-layer isolation:
 *  - Layer 1 (here): every read is narrowed to the active tenant and every
 *    write stamped with it — sourced from the tenant context, never the caller.
 *  - Layer 2: when a tenant transaction is active, its RLS-scoped EntityManager
 *    is used so Postgres RLS enforces the same boundary at the database.
 *
 * Subclasses expose intent-revealing methods and reuse the protected helpers;
 * they never accept a `tenant_id` argument.
 */
export abstract class BaseTenantRepository<T extends ObjectLiteral> {
  protected constructor(
    private readonly dataSource: DataSource,
    private readonly target: EntityTarget<T>,
  ) {}

  /**
   * Resolves the repository. Inside `runInTenantContext` this is the RLS-scoped
   * transaction manager; otherwise it falls back to the pooled manager where
   * only Layer-1 filtering applies. NOTE: once RLS is FORCEd (phase-02), reads on
   * the fallback connection see no rows because `app.tenant_id` is unset — the
   * per-request RLS strategy is a phase-02 decision.
   */
  protected get repo(): Repository<T> {
    const manager: EntityManager = getTenantManager() ?? this.dataSource.manager;
    return manager.getRepository(this.target);
  }

  protected scopedWhere(
    where: FindOptionsWhere<T> | FindOptionsWhere<T>[] = {},
  ): FindOptionsWhere<T> | FindOptionsWhere<T>[] {
    const tenantId = getTenantId();
    // Array `where` is an OR of branches — each branch must carry the tenant
    // filter, otherwise the spread would drop them and leak across tenants.
    if (Array.isArray(where)) {
      return where.map((branch) => ({ ...branch, tenantId }) as FindOptionsWhere<T>);
    }
    return { ...where, tenantId } as FindOptionsWhere<T>;
  }

  protected findOne(options: FindOneOptions<T> = {}): Promise<T | null> {
    return this.repo.findOne({ ...options, where: this.scopedWhere(options.where) });
  }

  protected findMany(options: FindManyOptions<T> = {}): Promise<T[]> {
    return this.repo.find({ ...options, where: this.scopedWhere(options.where) });
  }

  protected findAndCount(options: FindManyOptions<T> = {}): Promise<[T[], number]> {
    return this.repo.findAndCount({ ...options, where: this.scopedWhere(options.where) });
  }

  protected persist(data: DeepPartial<T>): Promise<T> {
    const entity = this.repo.create({ ...data, tenantId: getTenantId() } as DeepPartial<T>);
    return this.repo.save(entity);
  }
}
