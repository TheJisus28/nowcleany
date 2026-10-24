import { randomUUID } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import type { DynamicModule } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import pino from 'pino';
import { AppConfig } from '../config/app-config.js';

const SAFE_REQUEST_ID = /^[\w.:-]{1,128}$/;

/**
 * Request id: a well-formed incoming x-request-id is reused, otherwise a UUID is generated.
 * Fastify assigns it (genReqId) before any middleware, so logs, CLS and problem details share it.
 */
export function requestIdFor(req: { headers: IncomingHttpHeaders }): string {
  const incoming = req.headers['x-request-id'];
  return typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
}

export const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
];

/** JSON logs with requestId, actorId and module; never request bodies. */
export function loggingModule(service: string): DynamicModule {
  return LoggerModule.forRootAsync({
    inject: [AppConfig],
    useFactory: (config: AppConfig) => ({
      renameContext: 'module',
      assignResponse: true,
      pinoHttp: {
        level: config.logLevel,
        timestamp: pino.stdTimeFunctions.isoTime,
        base: { service: `nowcleanny-${service}` },
        genReqId: (req) => requestIdFor(req),
        // genReqId above always returns a string.
        customProps: (req) => ({ requestId: req.id as string }),
        redact: { paths: REDACTED_PATHS, censor: '[REDACTED]' },
        serializers: {
          req: (req: { id: string; method: string; url: string }) => ({
            method: req.method,
            url: req.url,
          }),
          res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
        },
        customLogLevel: (_req, res, error) =>
          error || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
        customSuccessMessage: (req, res) =>
          `${req.method ?? ''} ${req.url ?? ''} → ${String(res.statusCode)}`,
        customErrorMessage: (req, res) =>
          `${req.method ?? ''} ${req.url ?? ''} → ${String(res.statusCode)} (error)`,
        autoLogging: { ignore: (req) => req.url?.startsWith('/health') ?? false },
      },
    }),
  });
}
