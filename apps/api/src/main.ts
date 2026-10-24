import 'reflect-metadata';
import helmet from '@fastify/helmet';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { AppConfig } from './platform/config/app-config.js';
import { requestIdFor } from './platform/logging/logging.js';

const app = await NestFactory.create<NestFastifyApplication>(
  AppModule,
  new FastifyAdapter({
    bodyLimit: 1_048_576,
    trustProxy: true,
    genReqId: requestIdFor,
    requestIdHeader: false,
  }),
  { bufferLogs: true },
);
app.useLogger(app.get(Logger));
app
  .getHttpAdapter()
  .getInstance()
  .addHook('onRequest', async (request, reply) => {
    void reply.header('x-request-id', request.id);
  });
app.enableShutdownHooks();

const config = app.get(AppConfig);
// Swagger UI needs inline scripts; it only exists outside production.
await app.register(helmet, config.isProduction ? {} : { contentSecurityPolicy: false });

if (!config.isProduction) {
  const document = new DocumentBuilder()
    .setTitle('SCIP — NOW CLEANY')
    .setDescription('API de inventario, producción, compras y reporte de sobreventa.')
    .setVersion('1')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, () => SwaggerModule.createDocument(app, document));
}

await app.listen(config.http.port, config.http.host);
