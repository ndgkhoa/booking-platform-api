# Phase 05 — API Documentation

**Priority:** High | **Status:** pending | **Depends:** 04

Auto-generate OpenAPI 3 spec from routing-controllers decorators + class-validator DTOs, serve Swagger UI at `/api-docs`.

## Approach
`routing-controllers-openapi` reads `getMetadataArgsStorage()`; `class-validator-jsonschema` converts DTO validation decorators into JSON schemas.

## `src/config/swagger.ts`
```ts
import { getMetadataArgsStorage } from 'routing-controllers';
import { routingControllersToSpec } from 'routing-controllers-openapi';
import { validationMetadatasToSchemas } from 'class-validator-jsonschema';
import { defaultMetadataStorage } from 'class-transformer/cjs/storage'; // required by class-validator-jsonschema

export function buildOpenApiSpec(routingOptions: any) {
  const schemas = validationMetadatasToSchemas({ classTransformerMetadataStorage: defaultMetadataStorage, refPointerPrefix: '#/components/schemas/' });
  return routingControllersToSpec(getMetadataArgsStorage(), routingOptions, {
    components: { schemas, securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
    info: { title: 'Express TypeStack Boilerplate', version: '1.0.0' },
    security: [{ bearerAuth: [] }],
  });
}
```
> Gotcha: import the SAME `defaultMetadataStorage` from `class-transformer/cjs/storage` (CJS build) or schemas come out empty. Verify path on install.

## Mount Swagger UI — in server.ts (after useExpressServer)
```ts
import swaggerUi from 'swagger-ui-express';
const spec = buildOpenApiSpec(routingOptions); // pass same options object used for useExpressServer
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(spec));
app.get('/api-docs.json', (_req, res) => res.json(spec));
```
> Refactor server.ts so the routing-controllers options object is built once and shared between `useExpressServer` and `buildOpenApiSpec`.

## Decorate for richer docs (optional, KISS)
- `@OpenAPI({ summary: '...' })` and `@ResponseSchema(UserDto)` on actions where useful. Keep minimal initially.

## Files
config/swagger.ts, extend server.ts.

## Todo
- [ ] Extract shared routingOptions object in server.ts
- [ ] buildOpenApiSpec (schemas + bearer security)
- [ ] Mount `/api-docs` + `/api-docs.json`
- [ ] Verify DTO schemas render (not empty) — the cjs storage gotcha

## Success Criteria
- `/api-docs` renders all routes; DTOs show fields + validation constraints.
- "Authorize" button accepts Bearer JWT; protected routes callable from UI.

## Unresolved
- Whether to gate `/api-docs` behind auth in production — leave open in env flag `SWAGGER_ENABLED`.
