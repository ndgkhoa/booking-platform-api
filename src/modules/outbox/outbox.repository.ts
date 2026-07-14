import { OUTBOX_BACKOFF_BASE_MS, OUTBOX_MAX_ATTEMPTS } from '@common/constants';
import { getTenantId, getTenantManager } from '@common/tenant/tenant-context';
import { OutboxStatus } from '@common/types';
import { OutboxEvent } from '@modules/outbox/outbox-event.entity';
import { Service } from 'typedi';
import type { EntityManager } from 'typeorm';

export interface RecordEventInput {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
}

@Service()
export class OutboxRepository {
  /**
   * Writes an event on the ACTIVE tenant transaction (the request's manager), so
   * it commits atomically with the state change. Requires an in-flight tenant
   * transaction — falling back to autocommit would break atomicity, so it fails
   * fast instead.
   */
  record(input: RecordEventInput): Promise<OutboxEvent> {
    const manager = getTenantManager();
    if (!manager) {
      throw new Error('Outbox record must run inside a tenant transaction');
    }
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
      .addOrderBy('e.id', 'ASC') // stable tiebreaker for same-timestamp rows
      .limit(limit)
      .setLock('pessimistic_write')
      .setOnLocked('skip_locked')
      .getMany();
  }

  markDispatched(manager: EntityManager, id: string): Promise<unknown> {
    return manager.getRepository(OutboxEvent).update(id, { status: OutboxStatus.Dispatched });
  }

  /** Backlog snapshot for metrics: pending count + age of the oldest pending row. */
  async backlogStats(
    manager: EntityManager,
  ): Promise<{ pending: number; oldestAgeSeconds: number }> {
    const row = await manager
      .getRepository(OutboxEvent)
      .createQueryBuilder('e')
      .select('COUNT(*)', 'pending')
      .addSelect('COALESCE(EXTRACT(EPOCH FROM now() - MIN(e.created_at)), 0)', 'age')
      .where('e.status = :status', { status: OutboxStatus.Pending })
      .getRawOne<{ pending: string; age: string }>();
    return {
      pending: Number(row?.pending ?? 0),
      oldestAgeSeconds: Number(row?.age ?? 0),
    };
  }

  /** Bumps attempts; schedules a backoff retry, or marks dead past the cap. */
  markFailed(manager: EntityManager, event: OutboxEvent): Promise<unknown> {
    const attempts = event.attempts + 1;
    if (attempts >= OUTBOX_MAX_ATTEMPTS) {
      return manager
        .getRepository(OutboxEvent)
        .update(event.id, { attempts, status: OutboxStatus.Dead });
    }
    const availableAt = new Date(Date.now() + OUTBOX_BACKOFF_BASE_MS * 2 ** (attempts - 1));
    return manager.getRepository(OutboxEvent).update(event.id, { attempts, availableAt });
  }
}
