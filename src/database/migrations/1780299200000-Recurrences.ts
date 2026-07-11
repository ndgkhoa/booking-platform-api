import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Recurrences1780299200000 implements MigrationInterface {
  name = 'Recurrences1780299200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "recurrences" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "tenant_id" uuid NOT NULL,
        "service_id" uuid NOT NULL,
        "staff_id" uuid NOT NULL,
        "customer_id" uuid NOT NULL,
        "freq" character varying NOT NULL,
        "interval" integer NOT NULL,
        "weekdays" integer[],
        "start_date" character varying NOT NULL,
        "start_minutes" integer NOT NULL,
        "count" integer,
        "until" character varying,
        "timezone" character varying NOT NULL,
        CONSTRAINT "PK_recurrences" PRIMARY KEY ("id"),
        CONSTRAINT "FK_recurrences_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query('CREATE INDEX "IDX_recurrences_tenant" ON "recurrences" ("tenant_id")');

    await queryRunner.query('ALTER TABLE "bookings" ADD "recurrence_id" uuid');
    await queryRunner.query(
      'CREATE INDEX "IDX_bookings_recurrence" ON "bookings" ("recurrence_id")',
    );
    await queryRunner.query(`
      ALTER TABLE "bookings" ADD CONSTRAINT "FK_bookings_recurrence"
        FOREIGN KEY ("recurrence_id") REFERENCES "recurrences"("id") ON DELETE SET NULL
    `);

    await queryRunner.query('ALTER TABLE "recurrences" ENABLE ROW LEVEL SECURITY');
    await queryRunner.query('ALTER TABLE "recurrences" FORCE ROW LEVEL SECURITY');
    await queryRunner.query(`
      CREATE POLICY "tenant_isolation" ON "recurrences"
        USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
        WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP POLICY IF EXISTS "tenant_isolation" ON "recurrences"');
    await queryRunner.query(
      'ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "FK_bookings_recurrence"',
    );
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_bookings_recurrence"');
    await queryRunner.query('ALTER TABLE "bookings" DROP COLUMN "recurrence_id"');
    await queryRunner.query('DROP TABLE "recurrences"');
  }
}
