// Must be the CJS build's storage instance — class-validator-jsonschema reads this
// exact singleton; importing from the package root yields empty schemas.
// @ts-expect-error no type declarations for the deep cjs path
import { defaultMetadataStorage } from 'class-transformer/cjs/storage';
import { validationMetadatasToSchemas } from 'class-validator-jsonschema';
import type { RoutingControllersOptions } from 'routing-controllers';
import { getMetadataArgsStorage } from 'routing-controllers';
import { routingControllersToSpec } from 'routing-controllers-openapi';

/**
 * Builds an OpenAPI 3 spec from routing-controllers decorators + class-validator
 * DTO metadata. Must be called AFTER controllers are loaded (i.e. after
 * useExpressServer) so the metadata storage is populated.
 */
export function buildOpenApiSpec(options: RoutingControllersOptions): object {
  const schemas = validationMetadatasToSchemas({
    classTransformerMetadataStorage: defaultMetadataStorage,
    refPointerPrefix: '#/components/schemas/',
  });

  return routingControllersToSpec(getMetadataArgsStorage(), options, {
    info: { title: 'Express TypeStack Boilerplate API', version: '1.0.0' },
    components: {
      schemas: schemas as any,
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
    security: [{ bearerAuth: [] }],
  });
}
