import type { MigrationInterface, QueryRunner } from 'typeorm';

export class WebhookEndpoints1780299100000 implements MigrationInterface {
  name = 'WebhookEndpoints1780299100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "webhook_endpoints" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "tenant_id" uuid NOT NULL,
        "url" character varying NOT NULL,
        "secret" character varying NOT NULL,
        "active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_webhook_endpoints" PRIMARY KEY ("id"),
        CONSTRAINT "FK_webhook_endpoints_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "IDX_webhook_endpoints_tenant" ON "webhook_endpoints" ("tenant_id")',
    );

    await queryRunner.query('ALTER TABLE "webhook_endpoints" ENABLE ROW LEVEL SECURITY');
    await queryRunner.query('ALTER TABLE "webhook_endpoints" FORCE ROW LEVEL SECURITY');
    await queryRunner.query(`
      CREATE POLICY "tenant_isolation" ON "webhook_endpoints"
        USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
        WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP POLICY IF EXISTS "tenant_isolation" ON "webhook_endpoints"');
    await queryRunner.query('DROP TABLE "webhook_endpoints"');
  }
}
