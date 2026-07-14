import { MigrationInterface, QueryRunner } from 'typeorm';

// Must run first (earliest timestamp): later migrations default primary keys with
// uuid_generate_v4(), which this extension provides.
export class EnableUuidOssp1780298000000 implements MigrationInterface {
  name = 'EnableUuidOssp1780298000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP EXTENSION IF EXISTS "uuid-ossp"');
  }
}
