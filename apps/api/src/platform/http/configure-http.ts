import helmet from '@fastify/helmet';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppConfig } from '../config/app-config.js';

/** HTTP hardening and parsers shared by main.ts and the end-to-end tests. */
export async function configureHttp(app: NestFastifyApplication): Promise<void> {
  const fastify = app.getHttpAdapter().getInstance();
  fastify.addHook('onRequest', async (request, reply) => {
    void reply.header('x-request-id', request.id);
  });
  // CSV uploads (product catalog, initial stock) arrive as raw text and are parsed by the domain.
  fastify.addContentTypeParser(
    'text/csv',
    { parseAs: 'string', bodyLimit: 2_097_152 },
    (_req, body, done) => {
      done(null, body);
    },
  );
  const config = app.get(AppConfig);
  // Swagger UI needs inline scripts; it only exists outside production.
  await app.register(helmet, config.isProduction ? {} : { contentSecurityPolicy: false });
}
