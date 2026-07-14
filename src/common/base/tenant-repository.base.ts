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

// Two-layer tenant isolation: reads/writes are scoped from tenant context here (Layer 1),
// and Postgres RLS re-enforces the same boundary via the RLS-scoped manager (Layer 2).
export abstract class BaseTenantRepository<T extends ObjectLiteral> {
  protected constructor(
    private readonly dataSource: DataSource,
    private readonly target: EntityTarget<T>,
  ) {}

  // Inside `runInTenantContext` this is the RLS-scoped tx manager; otherwise it falls
  // back to the pooled manager, which relies solely on Layer-1 filtering.
  protected get repo(): Repository<T> {
    const manager: EntityManager = getTenantManager() ?? this.dataSource.manager;
    return manager.getRepository(this.target);
  }

  protected scopedWhere(
    where: FindOptionsWhere<T> | FindOptionsWhere<T>[] = {},
  ): FindOptionsWhere<T> | FindOptionsWhere<T>[] {
    const tenantId = getTenantId();
    // Array `where` is an OR of branches; each must carry tenantId or it'd leak across tenants.
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
