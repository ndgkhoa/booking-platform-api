import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AdminAuditLogs1780299400000 implements MigrationInterface {
  name = 'AdminAuditLogs1780299400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Platform-wide super-admin audit trail (global, not tenant-scoped).
    await queryRunner.query(`
      CREATE TABLE "admin_audit_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "actor_user_id" uuid NOT NULL,
        "action" character varying NOT NULL,
        "target_tenant_id" uuid NOT NULL,
        "metadata" jsonb,
        CONSTRAINT "PK_admin_audit_logs" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "IDX_admin_audit_target" ON "admin_audit_logs" ("target_tenant_id", "created_at")',
    );

    // Immutable: the audit trail is append-only. Silently discard any UPDATE or
    // DELETE so a compromised app path cannot rewrite or erase history.
    await queryRunner.query(
      'CREATE RULE "admin_audit_logs_no_update" AS ON UPDATE TO "admin_audit_logs" DO INSTEAD NOTHING',
    );
    await queryRunner.query(
      'CREATE RULE "admin_audit_logs_no_delete" AS ON DELETE TO "admin_audit_logs" DO INSTEAD NOTHING',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP RULE IF EXISTS "admin_audit_logs_no_delete" ON "admin_audit_logs"',
    );
    await queryRunner.query(
      'DROP RULE IF EXISTS "admin_audit_logs_no_update" ON "admin_audit_logs"',
    );
    await queryRunner.query('DROP TABLE "admin_audit_logs"');
  }
}
