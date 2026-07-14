import { AdminAuditLog } from '@modules/admin/admin-audit-log.entity';
import { Booking } from '@modules/booking/booking.entity';
import { Customer } from '@modules/customer/customer.entity';
import { IdempotencyKey } from '@modules/idempotency/idempotency-key.entity';
import { Invite } from '@modules/invite/invite.entity';
import { Membership } from '@modules/membership/membership.entity';
import { OutboxEvent } from '@modules/outbox/outbox-event.entity';
import { WebhookReceipt } from '@modules/payment/webhook-receipt.entity';
import { Plan } from '@modules/plan/plan.entity';
import { Recurrence } from '@modules/recurrence/recurrence.entity';
import { RefreshToken } from '@modules/refresh-token/refresh-token.entity';
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
  /** Superuser connection — bypasses RLS; use for cross-tenant seeding/cleanup only, never in the app. */
  dataSource: DataSource;
  /** Non-superuser connection the app runs on, so RLS is enforced end-to-end. */
  appDataSource: DataSource;
  app: Express;
  teardown: () => Promise<void>;
}

/** Opens a superuser DataSource for seeding/cleanup and a non-superuser one wired into the DI container so the app under test executes every statement under RLS. Call in `beforeAll`; `teardown` in `afterAll`. */
export async function initIntegrationContext(): Promise<IntegrationContext> {
  const adminUrl = process.env.TEST_DATABASE_URL;
  const appUrl = process.env.TEST_APP_DATABASE_URL;
  if (!adminUrl || !appUrl) {
    throw new Error(
      'TEST_DATABASE_URL / TEST_APP_DATABASE_URL unset — is the integration global-setup registered?',
    );
  }

  const dataSource = new DataSource({
    type: 'postgres',
    url: adminUrl,
    entities: TEST_ENTITIES,
    synchronize: false,
  });
  const appDataSource = new DataSource({
    type: 'postgres',
    url: appUrl,
    entities: TEST_ENTITIES,
    synchronize: false,
    // Headroom for concurrency tests where each request holds a tenant-tx connection.
    poolSize: 25,
  });
  await dataSource.initialize();
  await appDataSource.initialize();
  Container.set(DataSource, appDataSource);

  return {
    dataSource,
    appDataSource,
    app: createServer(),
    teardown: async () => {
      await appDataSource.destroy();
      await dataSource.destroy();
    },
  };
}
