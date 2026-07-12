import { AdminAuditLog } from '@modules/admin/admin-audit-log.entity';
import { RefreshToken } from '@modules/auth/refresh-token.entity';
import { Booking } from '@modules/booking/booking.entity';
import { Customer } from '@modules/customer/customer.entity';
import { IdempotencyKey } from '@modules/idempotency/idempotency-key.entity';
import { Invite } from '@modules/invite/invite.entity';
import { Membership } from '@modules/membership/membership.entity';
import { OutboxEvent } from '@modules/outbox/outbox-event.entity';
import { WebhookReceipt } from '@modules/payment/webhook-receipt.entity';
import { Plan } from '@modules/plan/plan.entity';
import { Recurrence } from '@modules/recurrence/recurrence.entity';
import { Service } from '@modules/service/service.entity';
import { Staff } from '@modules/staff/staff.entity';
import { StaffService } from '@modules/staff-service/staff-service.entity';
import { Subscription } from '@modules/subscription/subscription.entity';
import { Tenant } from '@modules/tenant/tenant.entity';
import { TimeOff } from '@modules/time-off/time-off.entity';
import { User } from '@modules/user/user.entity';
import { WebhookEndpoint } from '@modules/webhook/webhook-endpoint.entity';
import { WorkingHours } from '@modules/working-hours/working-hours.entity';
import type { Express } from 'express';
import { Container } from 'typedi';
import { DataSource } from 'typeorm';
import { createServer } from '@/server';

/** Every entity the integration suite needs registered. Extend as modules land. */
export const TEST_ENTITIES = [
  User,
  Membership,
  Tenant,
  RefreshToken,
  Invite,
  Service,
  Staff,
  StaffService,
  WorkingHours,
  TimeOff,
  Customer,
  Booking,
  IdempotencyKey,
  OutboxEvent,
  WebhookEndpoint,
  Recurrence,
  Plan,
  Subscription,
  WebhookReceipt,
  AdminAuditLog,
];

export interface IntegrationContext {
  dataSource: DataSource;
  app: Express;
  teardown: () => Promise<void>;
}

/**
 * Opens a DataSource against the shared container (see global-setup.ts), wires it
 * into the DI container, and builds the app. Call in `beforeAll`; `teardown` in
 * `afterAll`. Specs stay free of container/bootstrap boilerplate.
 */
export async function initIntegrationContext(): Promise<IntegrationContext> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error('TEST_DATABASE_URL is unset — is the integration global-setup registered?');
  }

  const dataSource = new DataSource({
    type: 'postgres',
    url,
    entities: TEST_ENTITIES,
    synchronize: true,
    // Headroom for concurrency tests where each request holds a tenant-tx connection.
    poolSize: 25,
  });
  await dataSource.initialize();
  Container.set(DataSource, dataSource);

  return {
    dataSource,
    app: createServer(),
    teardown: () => dataSource.destroy(),
  };
}
