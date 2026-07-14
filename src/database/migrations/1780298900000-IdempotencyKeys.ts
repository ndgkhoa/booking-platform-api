import type { MigrationInterface, QueryRunner } from 'typeorm';

export class IdempotencyKeys1780298900000 implements MigrationInterface {
  name = 'IdempotencyKeys1780298900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "idempotency_keys" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "tenant_id" uuid NOT NULL,
        "key" character varying NOT NULL,
        "request_hash" character varying NOT NULL,
        "response_body" jsonb,
        CONSTRAINT "PK_idempotency_keys" PRIMARY KEY ("id"),
        CONSTRAINT "FK_idempotency_keys_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX "UQ_idempotency_keys_tenant_key" ON "idempotency_keys" ("tenant_id", "key")',
    );

    await queryRunner.query('ALTER TABLE "idempotency_keys" ENABLE ROW LEVEL SECURITY');
    await queryRunner.query('ALTER TABLE "idempotency_keys" FORCE ROW LEVEL SECURITY');
    await queryRunner.query(`
      CREATE POLICY "tenant_isolation" ON "idempotency_keys"
        USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
        WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP POLICY IF EXISTS "tenant_isolation" ON "idempotency_keys"');
    await queryRunner.query('DROP TABLE "idempotency_keys"');
  }
}
