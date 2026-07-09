import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Services1780298600000 implements MigrationInterface {
  name = 'Services1780298600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "services" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "tenant_id" uuid NOT NULL,
        "name" character varying NOT NULL,
        "duration_min" integer NOT NULL,
        "price_amount" integer NOT NULL,
        "price_currency" character varying(3) NOT NULL DEFAULT 'VND',
        "buffer_before_min" integer NOT NULL DEFAULT 0,
        "buffer_after_min" integer NOT NULL DEFAULT 0,
        "active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_services" PRIMARY KEY ("id"),
        CONSTRAINT "FK_services_tenant" FOREIGN KEY ("tenant_id")
          REFERENCES "tenants"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query('CREATE INDEX "IDX_services_tenant" ON "services" ("tenant_id")');
    // Partial: a soft-deleted service must not block re-creating the same name.
    await queryRunner.query(
      'CREATE UNIQUE INDEX "UQ_services_tenant_name" ON "services" ("tenant_id", "name") WHERE "deleted_at" IS NULL',
    );

    // Row-Level Security: defence-in-depth over the app-layer tenant filter.
    // Reads current_setting('app.tenant_id') set per request via SET LOCAL; fails
    // closed (NULL → no rows) when unset. NOTE: superusers and table owners with
    // BYPASSRLS ignore RLS — the app must connect as a non-superuser role in
    // production for this to take effect.
    await queryRunner.query('ALTER TABLE "services" ENABLE ROW LEVEL SECURITY');
    await queryRunner.query('ALTER TABLE "services" FORCE ROW LEVEL SECURITY');
    await queryRunner.query(`
      CREATE POLICY "tenant_isolation" ON "services"
        USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
        WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP POLICY IF EXISTS "tenant_isolation" ON "services"');
    await queryRunner.query('DROP TABLE "services"');
  }
}
