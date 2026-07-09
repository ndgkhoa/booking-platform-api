import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Invites1780298500000 implements MigrationInterface {
  name = 'Invites1780298500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "invites" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "tenant_id" uuid NOT NULL,
        "email" character varying NOT NULL,
        "role" character varying NOT NULL,
        "token_hash" character varying NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "accepted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_invites" PRIMARY KEY ("id"),
        CONSTRAINT "FK_invites_tenant" FOREIGN KEY ("tenant_id")
          REFERENCES "tenants"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query('CREATE INDEX "IDX_invites_tenant" ON "invites" ("tenant_id")');
    await queryRunner.query(
      'CREATE UNIQUE INDEX "UQ_invites_token_hash" ON "invites" ("token_hash")',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "invites"');
  }
}
