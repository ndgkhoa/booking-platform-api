// @ts-expect-error — class-transformer storage is not exported from the type root
import { defaultMetadataStorage } from 'class-transformer/cjs/storage';
import { validationMetadatasToSchemas } from 'class-validator-jsonschema';
import type { RoutingControllersOptions } from 'routing-controllers';
import { getMetadataArgsStorage } from 'routing-controllers';
import { routingControllersToSpec } from 'routing-controllers-openapi';

/** RFC 7807 problem+json — the shape every error response uses. */
const ProblemDetails = {
  type: 'object',
  properties: {
    type: { type: 'string', example: 'about:blank' },
    title: { type: 'string', example: 'Conflict' },
    status: { type: 'integer', example: 409 },
    detail: { type: 'string', example: 'This time slot is no longer available' },
    instance: { type: 'string' },
    code: { type: 'string', example: 'BOOKING_SLOT_TAKEN' },
    errors: { type: 'object', additionalProperties: true },
    traceId: { type: 'string' },
  },
  required: ['title', 'status', 'code'],
};

/** Success envelope wrapping the returned resource. */
const ApiSuccess = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: {},
    meta: { type: 'object', additionalProperties: true },
  },
  required: ['success', 'data'],
};

interface OpenApiOperation {
  responses?: Record<string, unknown>;
}

export function buildOpenApiSpec(options: RoutingControllersOptions): object {
  const schemas = validationMetadatasToSchemas({
    classTransformerMetadataStorage: defaultMetadataStorage,
    refPointerPrefix: '#/components/schemas/',
  });

  const spec = routingControllersToSpec(getMetadataArgsStorage(), options, {
    info: {
      title: 'booking-platform-api',
      version: '1.0.0',
      description:
        'Multi-tenant booking SaaS API. Authentication: `Authorization: Bearer <JWT>` — ' +
        'the token carries the active tenant, which scopes every request under Postgres RLS. ' +
        'Errors use RFC 7807 `application/problem+json`. `POST /bookings` accepts an ' +
        '`Idempotency-Key` header so retries never double-create. Payment webhooks are ' +
        'unauthenticated but HMAC signature-gated.',
    },
    // Paths already carry the /api/v1 routePrefix; the server is the host root.
    servers: [{ url: '/', description: 'Current host' }],
    components: {
      // biome-ignore lint/suspicious/noExplicitAny: generated JSON-schema map
      schemas: { ...(schemas as any), ProblemDetails, ApiSuccess },
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      responses: {
        Problem: {
          description: 'RFC 7807 error',
          content: {
            'application/problem+json': { schema: { $ref: '#/components/schemas/ProblemDetails' } },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
  }) as { paths?: Record<string, Record<string, OpenApiOperation>> };

  // Attach the shared error response to every operation so the error contract is
  // documented once rather than repeated per route.
  for (const methods of Object.values(spec.paths ?? {})) {
    for (const operation of Object.values(methods)) {
      operation.responses ??= {};
      operation.responses.default ??= { $ref: '#/components/responses/Problem' };
    }
  }

  return spec;
}
