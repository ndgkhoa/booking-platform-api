import type { MigrationInterface, QueryRunner } from 'typeorm';

export class UserRolesToSuperAdmin1780298300000 implements MigrationInterface {
  name = 'UserRolesToSuperAdmin1780298300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Tenant-scoped roles move to `memberships`; only the global super-admin flag
    // stays on the user. Backfill it from the legacy comma-separated `roles`.
    await queryRunner.query(
      'ALTER TABLE "users" ADD "is_super_admin" boolean NOT NULL DEFAULT false',
    );
    await queryRunner.query(
      `UPDATE "users" SET "is_super_admin" = true WHERE 'admin' = ANY(string_to_array("roles", ','))`,
    );
    await queryRunner.query('ALTER TABLE "users" DROP COLUMN "roles"');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "roles" text NOT NULL DEFAULT ''`);
    await queryRunner.query(
      `UPDATE "users" SET "roles" = 'admin,user' WHERE "is_super_admin" = true`,
    );
    await queryRunner.query('ALTER TABLE "users" DROP COLUMN "is_super_admin"');
  }
}
