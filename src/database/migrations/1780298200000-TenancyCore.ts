import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Multi-tenancy core: global users, tenants, tenant memberships, and rotating
 * refresh tokens.
 *
 * Isolation model: the enforced layer is application-level tenant scoping (every
 * query is confined to the caller's tenant). Row-Level Security on `tenant_members`
 * plus the non-superuser `app_user` role are established here as the proven
 * defense-in-depth backstop (see the isolation test). Wiring RLS into the runtime
 * request path — connecting as `app_user` and setting the `app.tenant_id` GUC per
 * request — lands with the first tenant-owned business tables; identity tables
 * (users, tenant_members, refresh_tokens) are traversed cross-tenant by auth and
 * stay app-scoped. See ADR-0001.
 */
export class TenancyCore1780298200000 implements MigrationInterface {
  name = 'TenancyCore1780298200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Users become global identities — roles move onto tenant memberships.
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "roles"`);

    // Platform-level role (back-office super admin), orthogonal to tenant roles.
    await queryRunner.query(`CREATE TYPE "platform_role" AS ENUM ('super_admin')`);
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "platform_role" "platform_role"`);

    await queryRunner.query(`
      CREATE TABLE "tenants" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "name" character varying NOT NULL,
        "slug" character varying NOT NULL,
        "timezone" character varying NOT NULL DEFAULT 'UTC',
        "plan" character varying NOT NULL DEFAULT 'free',
        CONSTRAINT "PK_tenants" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_tenants_slug" UNIQUE ("slug")
      )
    `);

    await queryRunner.query(`CREATE TYPE "tenant_member_role" AS ENUM ('owner', 'staff')`);
    await queryRunner.query(`
      CREATE TABLE "tenant_members" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "tenant_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "role" "tenant_member_role" NOT NULL DEFAULT 'staff',
        "invited_at" TIMESTAMP WITH TIME ZONE,
        "joined_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_tenant_members" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_tenant_members_tenant_user" UNIQUE ("tenant_id", "user_id"),
        CONSTRAINT "FK_tenant_members_tenant" FOREIGN KEY ("tenant_id")
          REFERENCES "tenants" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_tenant_members_user" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_tenant_members_tenant" ON "tenant_members" ("tenant_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "user_id" uuid NOT NULL,
        "tenant_id" uuid NOT NULL,
        "token_hash" character varying NOT NULL,
        "family_id" uuid NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "revoked_at" TIMESTAMP WITH TIME ZONE,
        "replaced_by" uuid,
        CONSTRAINT "PK_refresh_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "FK_refresh_tokens_user" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_refresh_tokens_tenant" FOREIGN KEY ("tenant_id")
          REFERENCES "tenants" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_refresh_tokens_token_hash" ON "refresh_tokens" ("token_hash")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_refresh_tokens_family" ON "refresh_tokens" ("family_id")`,
    );

    // Non-superuser role the application connects as (RLS never applies to
    // superusers). Created idempotently so re-runs across environments are safe.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
          CREATE ROLE app_user NOLOGIN;
        END IF;
      END
      $$
    `);
    await queryRunner.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON "tenant_members" TO app_user`);

    // RLS backstop on tenant-owned rows. current_setting(..., true) yields NULL
    // when the GUC is unset, so an unscoped session sees no rows (fails closed).
    await queryRunner.query(`ALTER TABLE "tenant_members" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "tenant_members" FORCE ROW LEVEL SECURITY`);
    await queryRunner.query(`
      CREATE POLICY "tenant_isolation" ON "tenant_members"
        USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
        WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP POLICY IF EXISTS "tenant_isolation" ON "tenant_members"`);
    await queryRunner.query(`ALTER TABLE "tenant_members" NO FORCE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "tenant_members" DISABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`REVOKE ALL ON "tenant_members" FROM app_user`);

    await queryRunner.query(`DROP INDEX "public"."IDX_refresh_tokens_family"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_refresh_tokens_token_hash"`);
    await queryRunner.query(`DROP TABLE "refresh_tokens"`);

    await queryRunner.query(`DROP INDEX "public"."IDX_tenant_members_tenant"`);
    await queryRunner.query(`DROP TABLE "tenant_members"`);
    await queryRunner.query(`DROP TYPE "tenant_member_role"`);

    await queryRunner.query(`DROP TABLE "tenants"`);

    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "platform_role"`);
    await queryRunner.query(`DROP TYPE "platform_role"`);
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "roles" text NOT NULL DEFAULT ''`);
  }
}
