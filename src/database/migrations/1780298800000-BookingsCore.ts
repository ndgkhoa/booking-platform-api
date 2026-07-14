import type { MigrationInterface, QueryRunner } from 'typeorm';

const RLS_TABLES = ['customers', 'bookings'];

export class BookingsCore1780298800000 implements MigrationInterface {
  name = 'BookingsCore1780298800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "customers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "tenant_id" uuid NOT NULL,
        "name" character varying NOT NULL,
        "email" character varying NOT NULL,
        "phone" character varying,
        CONSTRAINT "PK_customers" PRIMARY KEY ("id"),
        CONSTRAINT "FK_customers_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query('CREATE INDEX "IDX_customers_tenant" ON "customers" ("tenant_id")');
    await queryRunner.query(
      'CREATE UNIQUE INDEX "UQ_customers_tenant_email" ON "customers" ("tenant_id", "email") WHERE "deleted_at" IS NULL',
    );

    await queryRunner.query(`
      CREATE TABLE "bookings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "tenant_id" uuid NOT NULL,
        "staff_id" uuid NOT NULL,
        "service_id" uuid NOT NULL,
        "customer_id" uuid NOT NULL,
        "starts_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "ends_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "status" character varying NOT NULL DEFAULT 'pending',
        "price_amount" integer NOT NULL,
        "price_currency" character varying(3) NOT NULL,
        "version" integer NOT NULL DEFAULT 1,
        CONSTRAINT "PK_bookings" PRIMARY KEY ("id"),
        CONSTRAINT "FK_bookings_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_bookings_staff" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_bookings_service" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_bookings_customer" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "IDX_bookings_staff_starts" ON "bookings" ("tenant_id", "staff_id", "starts_at")',
    );

    // Flagship guarantee: no two active bookings for the same staff overlap (tstzrange +
    // btree_gist GiST exclusion); a conflicting INSERT/UPDATE raises SQLSTATE 23P01 → 409.
    await queryRunner.query(`
      ALTER TABLE "bookings" ADD CONSTRAINT "bookings_no_overlap"
        EXCLUDE USING gist (
          "tenant_id" WITH =,
          "staff_id" WITH =,
          tstzrange("starts_at", "ends_at") WITH &&
        ) WHERE (status IN ('pending', 'confirmed') AND "deleted_at" IS NULL)
    `);

    for (const table of RLS_TABLES) {
      await queryRunner.query(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
      await queryRunner.query(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`);
      await queryRunner.query(`
        CREATE POLICY "tenant_isolation" ON "${table}"
          USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
          WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of RLS_TABLES) {
      await queryRunner.query(`DROP POLICY IF EXISTS "tenant_isolation" ON "${table}"`);
    }
    await queryRunner.query('DROP TABLE "bookings"');
    await queryRunner.query('DROP TABLE "customers"');
  }
}
