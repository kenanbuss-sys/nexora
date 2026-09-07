import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/auth.guard';

/**
 * Public API surface (INT-009). The OpenAPI document is generated from
 * the live route table collected at boot — every path the server
 * actually serves, no drift. Authentication is documented as bearer
 * (dev/OIDC token) or X-Api-Key (service accounts); the document
 * itself is public, the API behind it is not.
 */

const ROUTES = new Set<string>();

export function registerApiRoute(method: string, url: string): void {
  if (!url.startsWith('/api/')) return;
  ROUTES.add(`${method} ${url}`);
}

function toOpenApiPath(url: string): string {
  return url.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

@Controller('api/v1/openapi')
export class OpenApiController {
  @Get()
  @Public()
  openapi(): Record<string, unknown> {
    const paths: Record<string, Record<string, unknown>> = {};
    for (const entry of [...ROUTES].sort()) {
      const [method, url] = entry.split(' ');
      if (!method || !url) continue;
      const path = toOpenApiPath(url);
      paths[path] = paths[path] ?? {};
      const parameters = [...path.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((m) => ({
        name: m[1],
        in: 'path',
        required: true,
        schema: { type: 'string' },
      }));
      paths[path][method.toLowerCase()] = {
        summary: `${method} ${path}`,
        ...(parameters.length > 0 ? { parameters } : {}),
        security: [{ bearerAuth: [] }, { apiKey: [] }],
        responses: {
          '200': { description: 'OK' },
          '400': { description: 'Validation failed' },
          '401': { description: 'Unauthenticated' },
          '403': { description: 'Forbidden' },
          '404': { description: 'Not found' },
          '409': { description: 'Conflict / invalid state' },
        },
      };
    }
    return {
      openapi: '3.0.3',
      info: {
        title: 'NexoraOS Public API',
        version: '1.0.0',
        description:
          'Multi-tenant Enterprise Business OS API. Authenticate with a bearer token ' +
          'or an X-Api-Key service-account key; all requests are tenant-scoped and ' +
          'authorized server-side.',
      },
      servers: [{ url: '/' }],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer' },
          apiKey: { type: 'apiKey', in: 'header', name: 'X-Api-Key' },
        },
      },
      paths,
    };
  }
}
