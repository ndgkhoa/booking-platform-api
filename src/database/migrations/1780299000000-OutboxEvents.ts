import type { MigrationInterface, QueryRunner } from 'typeorm';

export class OutboxEvents1780299000000 implements MigrationInterface {
  name = 'OutboxEvents1780299000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Infrastructure table: written inside each aggregate's transaction and
    // drained by the system relay across tenants — intentionally NOT under RLS.
    await queryRunner.query(`
      CREATE TABLE "outbox_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "tenant_id" uuid NOT NULL,
        "aggregate_type" character varying NOT NULL,
        "aggregate_id" uuid NOT NULL,
        "event_type" character varying NOT NULL,
        "payload" jsonb NOT NULL,
        "status" character varying NOT NULL DEFAULT 'pending',
        "attempts" integer NOT NULL DEFAULT 0,
        "available_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_outbox_events" PRIMARY KEY ("id"),
        CONSTRAINT "FK_outbox_events_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
      )
    `);
    // Partial index for the relay's "due pending, oldest first" claim scan —
    // stays small as dispatched/dead rows accumulate.
    await queryRunner.query(
      `CREATE INDEX "IDX_outbox_events_dispatch" ON "outbox_events" ("available_at") WHERE "status" = 'pending'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "outbox_events"');
  }
}
