import type { MigrationInterface, QueryRunner } from 'typeorm';

export class TenantFoundation1780298200000 implements MigrationInterface {
  name = 'TenantFoundation1780298200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // btree_gist backs the exclusion constraint that prevents double-booking;
    // uuid-ossp backs the uuid_generate_v4() primary-key defaults.
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS btree_gist');

    await queryRunner.query(`
      CREATE TABLE "tenants" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "name" character varying NOT NULL,
        "slug" character varying NOT NULL,
        "timezone" character varying NOT NULL DEFAULT 'UTC',
        "status" character varying NOT NULL DEFAULT 'active',
        CONSTRAINT "PK_tenants" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query('CREATE UNIQUE INDEX "UQ_tenants_slug" ON "tenants" ("slug")');

    await queryRunner.query(`
      CREATE TABLE "memberships" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "user_id" uuid NOT NULL,
        "tenant_id" uuid NOT NULL,
        "role" character varying NOT NULL,
        CONSTRAINT "PK_memberships" PRIMARY KEY ("id"),
        CONSTRAINT "FK_memberships_tenant" FOREIGN KEY ("tenant_id")
          REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_memberships_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX "UQ_memberships_user_tenant" ON "memberships" ("user_id", "tenant_id")',
    );
    await queryRunner.query('CREATE INDEX "IDX_memberships_tenant" ON "memberships" ("tenant_id")');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "memberships"');
    await queryRunner.query('DROP TABLE "tenants"');
    // Extensions are left installed: harmless and shared with later migrations.
  }
}
