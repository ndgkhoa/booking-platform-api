// @ts-expect-error
import { defaultMetadataStorage } from 'class-transformer/cjs/storage';
import { validationMetadatasToSchemas } from 'class-validator-jsonschema';
import type { RoutingControllersOptions } from 'routing-controllers';
import { getMetadataArgsStorage } from 'routing-controllers';
import { routingControllersToSpec } from 'routing-controllers-openapi';

export function buildOpenApiSpec(options: RoutingControllersOptions): object {
  const schemas = validationMetadatasToSchemas({
    classTransformerMetadataStorage: defaultMetadataStorage,
    refPointerPrefix: '#/components/schemas/',
  });

  return routingControllersToSpec(getMetadataArgsStorage(), options, {
    info: {
      title: 'booking-flow-api',
      version: '1.0.0',
      description: 'Multi-tenant booking SaaS API.',
    },
    components: {
      schemas: schemas as any,
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
    security: [{ bearerAuth: [] }],
  });
}
