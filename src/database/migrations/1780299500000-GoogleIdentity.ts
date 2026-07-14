import type { MigrationInterface, QueryRunner } from 'typeorm';

export class GoogleIdentity1780299500000 implements MigrationInterface {
  name = 'GoogleIdentity1780299500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // OAuth-only users have no password, so the column can no longer be required.
    await queryRunner.query('ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL');
    await queryRunner.query('ALTER TABLE "users" ADD "provider" character varying');
    await queryRunner.query('ALTER TABLE "users" ADD "provider_account_id" character varying');
    // One provider identity maps to exactly one user; password-only rows keep both
    // columns null and are excluded from the constraint.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_users_provider_account" ON "users" ("provider", "provider_account_id") WHERE "provider" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "UQ_users_provider_account"');
    await queryRunner.query('ALTER TABLE "users" DROP COLUMN "provider_account_id"');
    await queryRunner.query('ALTER TABLE "users" DROP COLUMN "provider"');
    // Restoring NOT NULL requires every row to have a password; safe only if no
    // OAuth-only users were created while this migration was applied.
    await queryRunner.query('ALTER TABLE "users" ALTER COLUMN "password_hash" SET NOT NULL');
  }
}
