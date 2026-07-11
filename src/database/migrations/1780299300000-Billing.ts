import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Billing1780299300000 implements MigrationInterface {
  name = 'Billing1780299300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Plans are global (not tenant-scoped, no RLS).
    await queryRunner.query(`
      CREATE TABLE "plans" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "code" character varying NOT NULL,
        "name" character varying NOT NULL,
        "price_amount" integer NOT NULL,
        "price_currency" character varying(3) NOT NULL DEFAULT 'VND',
        "max_staff" integer NOT NULL DEFAULT -1,
        "max_bookings_per_month" integer NOT NULL DEFAULT -1,
        CONSTRAINT "PK_plans" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query('CREATE UNIQUE INDEX "UQ_plans_code" ON "plans" ("code")');

    await queryRunner.query(`
      CREATE TABLE "subscriptions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "tenant_id" uuid NOT NULL,
        "plan_id" uuid NOT NULL,
        "provider" character varying NOT NULL,
        "provider_reference" character varying NOT NULL,
        "status" character varying NOT NULL DEFAULT 'trialing',
        CONSTRAINT "PK_subscriptions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_subscriptions_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_subscriptions_plan" FOREIGN KEY ("plan_id") REFERENCES "plans"("id")
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "IDX_subscriptions_tenant" ON "subscriptions" ("tenant_id")',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "UQ_subscriptions_reference" ON "subscriptions" ("provider_reference")',
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_subscriptions_active" ON "subscriptions" ("tenant_id") WHERE "status" <> 'canceled' AND "deleted_at" IS NULL`,
    );
    await queryRunner.query('ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY');
    await queryRunner.query('ALTER TABLE "subscriptions" FORCE ROW LEVEL SECURITY');
    await queryRunner.query(`
      CREATE POLICY "tenant_isolation" ON "subscriptions"
        USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
        WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
    `);

    // System-level inbound webhook idempotency (no tenant context).
    await queryRunner.query(`
      CREATE TABLE "webhook_receipts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "provider" character varying NOT NULL,
        "event_id" character varying NOT NULL,
        CONSTRAINT "PK_webhook_receipts" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_webhook_receipts" UNIQUE ("provider", "event_id")
      )
    `);

    // Seed two default plans (free + pro).
    await queryRunner.query(`
      INSERT INTO "plans" ("code", "name", "price_amount", "price_currency", "max_staff", "max_bookings_per_month")
      VALUES ('free', 'Free', 0, 'VND', 2, 100), ('pro', 'Pro', 20000000, 'VND', -1, -1)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP POLICY IF EXISTS "tenant_isolation" ON "subscriptions"');
    await queryRunner.query('DROP TABLE "webhook_receipts"');
    await queryRunner.query('DROP TABLE "subscriptions"');
    await queryRunner.query('DROP TABLE "plans"');
  }
}
