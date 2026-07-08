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

  protected get repo(): Repository<T> {
    const manager: EntityManager = getTenantManager() ?? this.dataSource.manager;
    return manager.getRepository(this.target);
  }

  protected scopedWhere(where: FindOptionsWhere<T> = {}): FindOptionsWhere<T> {
    return { ...where, tenantId: getTenantId() } as FindOptionsWhere<T>;
  }

  protected findOne(options: FindOneOptions<T> = {}): Promise<T | null> {
    return this.repo.findOne({
      ...options,
      where: this.scopedWhere(options.where as FindOptionsWhere<T>),
    });
  }

  protected findMany(options: FindManyOptions<T> = {}): Promise<T[]> {
    return this.repo.find({
      ...options,
      where: this.scopedWhere(options.where as FindOptionsWhere<T>),
    });
  }

  protected findAndCount(options: FindManyOptions<T> = {}): Promise<[T[], number]> {
    return this.repo.findAndCount({
      ...options,
      where: this.scopedWhere(options.where as FindOptionsWhere<T>),
    });
  }

  protected persist(data: DeepPartial<T>): Promise<T> {
    const entity = this.repo.create({ ...data, tenantId: getTenantId() } as DeepPartial<T>);
    return this.repo.save(entity);
  }
}
