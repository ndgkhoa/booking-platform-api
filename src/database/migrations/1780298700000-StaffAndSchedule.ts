import type { MigrationInterface, QueryRunner } from 'typeorm';

const RLS_TABLES = ['staff', 'staff_services', 'working_hours', 'time_off'];

export class StaffAndSchedule1780298700000 implements MigrationInterface {
  name = 'StaffAndSchedule1780298700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "staff" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "tenant_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "display_name" character varying NOT NULL,
        "active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_staff" PRIMARY KEY ("id"),
        CONSTRAINT "FK_staff_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_staff_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query('CREATE INDEX "IDX_staff_tenant" ON "staff" ("tenant_id")');
    await queryRunner.query(
      'CREATE UNIQUE INDEX "UQ_staff_tenant_user" ON "staff" ("tenant_id", "user_id") WHERE "deleted_at" IS NULL',
    );

    await queryRunner.query(`
      CREATE TABLE "staff_services" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "tenant_id" uuid NOT NULL,
        "staff_id" uuid NOT NULL,
        "service_id" uuid NOT NULL,
        CONSTRAINT "PK_staff_services" PRIMARY KEY ("id"),
        CONSTRAINT "FK_staff_services_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_staff_services_staff" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_staff_services_service" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "IDX_staff_services_tenant" ON "staff_services" ("tenant_id")',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "UQ_staff_services" ON "staff_services" ("tenant_id", "staff_id", "service_id") WHERE "deleted_at" IS NULL',
    );

    await queryRunner.query(`
      CREATE TABLE "working_hours" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "tenant_id" uuid NOT NULL,
        "staff_id" uuid NOT NULL,
        "weekday" smallint NOT NULL,
        "start_min" smallint NOT NULL,
        "end_min" smallint NOT NULL,
        CONSTRAINT "PK_working_hours" PRIMARY KEY ("id"),
        CONSTRAINT "FK_working_hours_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_working_hours_staff" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "IDX_working_hours_staff_weekday" ON "working_hours" ("tenant_id", "staff_id", "weekday")',
    );
    // DB-level guarantee that a staff's intervals on a weekday never overlap
    // (half-open int4range), closing the check-then-insert race. Maps to 23P01.
    await queryRunner.query(`
      ALTER TABLE "working_hours" ADD CONSTRAINT "no_overlap_working_hours"
        EXCLUDE USING gist (
          "tenant_id" WITH =,
          "staff_id" WITH =,
          "weekday" WITH =,
          int4range("start_min", "end_min") WITH &&
        ) WHERE ("deleted_at" IS NULL)
    `);

    await queryRunner.query(`
      CREATE TABLE "time_off" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "tenant_id" uuid NOT NULL,
        "staff_id" uuid NOT NULL,
        "starts_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "ends_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "reason" character varying,
        CONSTRAINT "PK_time_off" PRIMARY KEY ("id"),
        CONSTRAINT "FK_time_off_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_time_off_staff" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "IDX_time_off_staff" ON "time_off" ("tenant_id", "staff_id")',
    );

    // RLS: same fail-closed tenant_isolation policy as `services`.
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
    await queryRunner.query('DROP TABLE "time_off"');
    await queryRunner.query('DROP TABLE "working_hours"');
    await queryRunner.query('DROP TABLE "staff_services"');
    await queryRunner.query('DROP TABLE "staff"');
  }
}
