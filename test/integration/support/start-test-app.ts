import { RefreshToken } from '@modules/auth/refresh-token.entity';
import { Tenant } from '@modules/tenant/tenant.entity';
import { TenantMember } from '@modules/tenant/tenant-member.entity';
import { User } from '@modules/user/user.entity';
import type { Express } from 'express';
import { Container } from 'typedi';
import { DataSource } from 'typeorm';
import { createServer } from '@/server';

export interface TestApp {
  app: Express;
  dataSource: DataSource;
}

export async function startTestApp(): Promise<TestApp> {
  const dataSource = new DataSource({
    type: 'postgres',
    url: process.env.TEST_DATABASE_URL,
    entities: [User, Tenant, TenantMember, RefreshToken],
    synchronize: false,
  });
  await dataSource.initialize();
  Container.set(DataSource, dataSource);

  return { app: createServer(), dataSource };
}

export async function stopTestApp({ dataSource }: TestApp): Promise<void> {
  await dataSource?.destroy();
}
