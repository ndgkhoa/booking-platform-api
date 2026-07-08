import { RefreshToken } from '@modules/auth/refresh-token.entity';
import { Membership } from '@modules/membership/membership.entity';
import { Tenant } from '@modules/tenant/tenant.entity';
import { User } from '@modules/user/user.entity';
import type { Express } from 'express';
import { Container } from 'typedi';
import { DataSource } from 'typeorm';
import { createServer } from '@/server';

/** Every entity the integration suite needs registered. Extend as modules land. */
export const TEST_ENTITIES = [User, Membership, Tenant, RefreshToken];

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
  });
  await dataSource.initialize();
  Container.set(DataSource, dataSource);

  return {
    dataSource,
    app: createServer(),
    teardown: () => dataSource.destroy(),
  };
}
