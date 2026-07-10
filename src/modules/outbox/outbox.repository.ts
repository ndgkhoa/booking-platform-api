import { getTenantId, getTenantManager } from '@common/tenant/tenant-context';
import { OutboxEvent } from '@modules/outbox/outbox-event.entity';
import { OutboxStatus } from '@modules/outbox/outbox-status';
import { Service } from 'typedi';
import { DataSource, type EntityManager } from 'typeorm';

export interface RecordEventInput {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
}

const BACKOFF_BASE_MS = 30_000;
const MAX_ATTEMPTS = 5;

@Service()
export class OutboxRepository {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Writes an event on the ACTIVE tenant transaction (the request's manager), so
   * it commits atomically with the state change. tenant_id comes from context.
   */
  record(input: RecordEventInput): Promise<OutboxEvent> {
    const manager: EntityManager = getTenantManager() ?? this.dataSource.manager;
    const repo = manager.getRepository(OutboxEvent);
    return repo.save(repo.create({ ...input, tenantId: getTenantId() }));
  }

  /**
   * System (cross-tenant) relay claim: locks a batch of due pending events with
   * `FOR UPDATE SKIP LOCKED` so concurrent relays never pick the same row.
   */
  claimBatch(manager: EntityManager, limit: number): Promise<OutboxEvent[]> {
    return manager
      .getRepository(OutboxEvent)
      .createQueryBuilder('e')
      .where('e.status = :status', { status: OutboxStatus.Pending })
      .andWhere('e.available_at <= now()')
      .orderBy('e.created_at', 'ASC')
      .limit(limit)
      .setLock('pessimistic_write')
      .setOnLocked('skip_locked')
      .getMany();
  }

  markDispatched(manager: EntityManager, id: string): Promise<unknown> {
    return manager.getRepository(OutboxEvent).update(id, { status: OutboxStatus.Dispatched });
  }

  /** Bumps attempts; schedules a backoff retry, or marks dead past the cap. */
  markFailed(manager: EntityManager, event: OutboxEvent): Promise<unknown> {
    const attempts = event.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      return manager
        .getRepository(OutboxEvent)
        .update(event.id, { attempts, status: OutboxStatus.Dead });
    }
    const availableAt = new Date(Date.now() + BACKOFF_BASE_MS * 2 ** (attempts - 1));
    return manager.getRepository(OutboxEvent).update(event.id, { attempts, availableAt });
  }
}
