# Phase 03 — Database Layer

**Priority:** Critical | **Status:** pending | **Depends:** 02

TypeORM DataSource (Postgres), base entity, User entity, **repository pattern** (services never query directly), migrations, and typeorm-extension seeds/factories.

## DataSource — `src/config/data-source.ts`
Single shared DataSource used by app, CLI, and seeding.
```ts
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { env } from '@config/env';
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: env.DB_HOST, port: env.DB_PORT,
  username: env.DB_USER, password: env.DB_PASSWORD, database: env.DB_NAME,
  synchronize: false,                 // ALWAYS migrations, never sync
  logging: env.isDevelopment,
  entities: [__dirname + '/../modules/**/*.entity.{ts,js}'],
  migrations: [__dirname + '/../database/migrations/*.{ts,js}'],
});
```
Register DataSource in typedi after init so repositories can inject it:
```ts
// in index.ts bootstrap, after AppDataSource.initialize():
import { Container } from 'typedi';
Container.set(DataSource, AppDataSource);
```

## Base entity — `src/common/entities/base.entity.ts`
`@PrimaryGeneratedColumn('uuid')` id, `@CreateDateColumn`, `@UpdateDateColumn`, optional `@DeleteDateColumn`.

## User entity — `src/modules/user/user.entity.ts`
```ts
import { Entity, Column } from 'typeorm';
import { Exclude } from 'class-transformer';
import { BaseEntity } from '@common/entities/base.entity';
@Entity('users')
export class User extends BaseEntity {
  @Column({ unique: true }) email!: string;
  @Column() name!: string;
  @Exclude()                          // class-transformer: never serialize hash
  @Column({ name: 'password_hash' }) passwordHash!: string;
  @Column({ type: 'simple-array', default: '' }) roles!: string[];
}
```
> Controllers return entities; routing-controllers `classTransformer:true` + `@Exclude` strips `passwordHash`. Confirm `excludeExtraneousValues` is NOT forced (would drop fields without `@Expose`).

## Repository pattern — `src/modules/user/user.repository.ts`
**The contract:** all TypeORM access lives here. Service depends on this class only.
```ts
import { Service } from 'typedi';
import { DataSource, Repository } from 'typeorm';
import { User } from '@modules/user/user.entity';
@Service()
export class UserRepository {
  private repo: Repository<User>;
  constructor(dataSource: DataSource) { this.repo = dataSource.getRepository(User); }
  findById(id: string) { return this.repo.findOne({ where: { id } }); }
  findByEmail(email: string) { return this.repo.findOne({ where: { email } }); }
  create(data: Partial<User>) { return this.repo.save(this.repo.create(data)); }
  paginate(page: number, limit: number) {
    return this.repo.findAndCount({ skip: (page-1)*limit, take: limit, order: { createdAt: 'DESC' } });
  }
}
```
> This sidesteps typedi↔typeorm `@InjectRepository` version fragility. Inject `DataSource` (registered above), call `getRepository`.

## Migrations
- Generate: `pnpm migration:gen` (after entity changes). Run: `pnpm migration:run`.
- First migration creates `users` table. Commit migration files.

## Seeds & factories — typeorm-extension
- `src/database/factories/user.factory.ts` — `setSeederFactory(User, (faker) => {...})` using @faker-js/faker; hash a default password via bcrypt.
- `src/database/seeds/user.seeder.ts` — implements `Seeder`, uses factory to insert N users + 1 admin.
- `src/database/seeds/run-seeds.ts` — `runSeeders(AppDataSource, { seeds:[...], factories:[...] })`, init + destroy DataSource.
> Verify typeorm-extension@3.9 `runSeeders` signature on install (API stable since v3).

## Files
config/data-source.ts, common/entities/base.entity.ts, modules/user/{user.entity,user.repository}.ts, database/migrations/*, database/factories/user.factory.ts, database/seeds/{user.seeder,run-seeds}.ts

## Todo
- [ ] AppDataSource + register in typedi after init
- [ ] BaseEntity + User entity (`@Exclude` on hash)
- [ ] UserRepository (DataSource injection, no QB in services)
- [ ] First migration (users) + run
- [ ] user factory + seeder + run-seeds script
- [ ] `pnpm seed` populates DB

## Success Criteria
- `pnpm migration:run` creates `users`. `pnpm seed` inserts data.
- Repository methods typed; no `getRepository`/QueryBuilder anywhere outside `*.repository.ts`.

## Security
- `synchronize:false` always. Password stored only as bcrypt hash, never serialized.
