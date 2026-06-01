# Phase 01 — Scaffold, Tooling & Config

**Priority:** Critical | **Status:** pending | **Depends:** none

Set up pnpm project, dependencies (pinned latest), TypeScript with decorators + path aliases, Biome, husky/lint-staged, envalid config, and dev/build scripts.

## Dependencies (exact latest — verified 2026-05-30)
Install with pnpm. **Express pinned to 4.x.**

```bash
pnpm init
pnpm add express@^4.22.2 reflect-metadata@^0.2.2 \
  routing-controllers@^0.11.3 routing-controllers-openapi@^5.0.1 class-validator-jsonschema@^5.0.1 \
  typedi@^0.10.0 typeorm@^1.0.0 pg@^8 \
  class-validator@^0.15.1 class-transformer@^0.5.1 typeorm-extension@^3.9.0 \
  dotenv@^17.4.2 envalid@^8.1.1 \
  passport@^0.7.0 passport-jwt@^4.0.1 bcrypt@^6.0.0 jsonwebtoken@^9.0.3 \
  helmet@^8.2.0 cors@^2.8.6 express-rate-limit@^8.5.2 hpp@^0.2.3 \
  winston@^3.19.0 morgan@^1.10.1 swagger-ui-express@^5.0.1 \
  ioredis@^5.11.0 bullmq@^5.77.6 prom-client@^15.1.3 @godaddy/terminus@^4.12.1

pnpm add -D typescript@^6.0.3 ts-node@^10.9.2 tsconfig-paths@^4.2.0 tsc-alias@^1.8.17 \
  @biomejs/biome@^2.4.16 husky@^9.1.7 lint-staged@^17.0.6 \
  jest@^30.4.2 ts-jest@^29.4.11 supertest@^7.2.2 testcontainers@^12.0.1 @faker-js/faker@^10.4.0 \
  @types/node @types/express@^4.17.21 @types/cors @types/morgan @types/hpp \
  @types/passport@^1 @types/passport-jwt@^4 @types/bcrypt @types/jsonwebtoken \
  @types/swagger-ui-express @types/supertest
```
> On install, run `pnpm typeorm --help` to confirm typeorm@1.0.0 CLI API. If migration/datasource flags regressed, downgrade `typeorm@~0.3` (note in changelog).

## tsconfig.json (critical settings)
```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",          // typedi + routing-controllers most stable on CJS
    "moduleResolution": "node",
    "experimentalDecorators": true, // REQUIRED
    "emitDecoratorMetadata": true,  // REQUIRED — do not remove
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "outDir": "dist",
    "rootDir": "src",
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@config/*": ["src/config/*"],
      "@common/*": ["src/common/*"],
      "@modules/*": ["src/modules/*"],
      "@database/*": ["src/database/*"],
      "@jobs/*": ["src/jobs/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "test"]
}
```

## package.json scripts
```jsonc
{
  "scripts": {
    "dev": "node --watch -r ts-node/register src/index.ts",
    "build": "tsc -p tsconfig.json && tsc-alias -p tsconfig.json",
    "start": "node dist/index.js",
    "lint": "biome check .",
    "format": "biome format --write .",
    "lint:fix": "biome check --write .",
    "test": "jest --runInBand",
    "test:int": "jest --config jest.int.config.js --runInBand",
    "typeorm": "ts-node ./node_modules/typeorm/cli.js -d src/config/data-source.ts",
    "migration:gen": "pnpm typeorm migration:generate src/database/migrations/Migration",
    "migration:run": "pnpm typeorm migration:run",
    "migration:revert": "pnpm typeorm migration:revert",
    "seed": "ts-node src/database/seeds/run-seeds.ts",
    "prepare": "husky"
  }
}
```
- **DEV/CLI runner = `ts-node` (NOT tsx).** `tsx`/esbuild does NOT emit `emitDecoratorMetadata` — proven to break TypeORM column-type inference AND TypeDI constructor injection at runtime. `ts-node` uses the real TS compiler so metadata is emitted. tsconfig has a `ts-node` block: `{ "transpileOnly": true, "require": ["tsconfig-paths/register"] }` (fast, resolves `@/*` aliases). `tsc-alias` rewrites aliases for the prod `dist` build.
- typeorm@1.0.0 dropped the `typeorm-ts-node-commonjs` bin → run the plain CLI through `ts-node`.

## biome.json
Enable lint + format (replaces ESLint+Prettier). Recommended rules, `organizeImports` on, ignore `dist`/`node_modules`. Set `indentStyle`, `lineWidth: 100`.

## husky + lint-staged
- `pnpm husky init` → `.husky/pre-commit` runs `pnpm lint-staged`.
- `lint-staged` config: `"*.{ts,json}": "biome check --write --no-errors-on-unmatched"`.
- Add `.husky/pre-push` → `pnpm test`.

## src/config/env.ts (envalid)
```ts
import 'dotenv/config';
import { cleanEnv, str, port, num, host } from 'envalid';

export const env = cleanEnv(process.env, {
  NODE_ENV: str({ choices: ['development', 'test', 'production'], default: 'development' }),
  PORT: port({ default: 3000 }),
  DB_HOST: host({ default: 'localhost' }),
  DB_PORT: port({ default: 5432 }),
  DB_USER: str(), DB_PASSWORD: str(), DB_NAME: str(),
  JWT_SECRET: str(), JWT_EXPIRES_IN: str({ default: '15m' }),
  REDIS_HOST: host({ default: 'localhost' }), REDIS_PORT: port({ default: 6379 }),
  REDIS_PASSWORD: str(),   
  LOG_LEVEL: str({ default: 'info' }),
});
```
Add `.env.example` (committed) + `.env` (gitignored). Verify `.gitignore` already excludes `.env` (it does per repo).

## Files to create
- `package.json` (scripts), `tsconfig.json`, `biome.json`, `jest.config.js` (phase 08 stub ok), `.env.example`, `.husky/pre-commit`, `.husky/pre-push`, `src/config/env.ts`

## Todo
- [ ] `pnpm init`, install all deps (Express 4.x!)
- [ ] tsconfig with decorators + paths
- [ ] scripts (dev/build/start/lint/test/typeorm/seed)
- [ ] biome.json + run `biome check`
- [ ] husky init + lint-staged + pre-commit/pre-push hooks
- [ ] envalid `env.ts` + `.env.example`
- [ ] Verify `tsc -p .` compiles empty `src/index.ts` (sanity)

## Success Criteria
- `pnpm build` produces `dist/` with aliases resolved to relative paths.
- `pnpm lint` passes. `pnpm dev` boots tsx watcher.
- Committing triggers husky → biome on staged files.
