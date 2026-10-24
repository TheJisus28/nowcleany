import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ClsService } from 'nestjs-cls';
import { DomainError, type DomainErrorKind } from '../../shared-kernel/index.js';

/** RFC 9457 problem details, the only error format the API returns. */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  code: string;
  instance: string;
  requestId?: string;
  errors?: unknown;
  details?: Record<string, unknown>;
}

const STATUS_BY_KIND: Record<DomainErrorKind, number> = {
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION: 422,
  FORBIDDEN: 403,
  UNAUTHORIZED: 401,
};

const TITLES: Record<number, string> = {
  400: 'Solicitud inválida',
  401: 'No autenticado',
  403: 'Sin permiso',
  404: 'No encontrado',
  405: 'Método no permitido',
  409: 'Conflicto',
  413: 'Solicitud demasiado grande',
  415: 'Tipo de contenido no soportado',
  422: 'Datos inválidos',
  429: 'Demasiadas solicitudes',
  500: 'Error interno',
  503: 'Servicio no disponible',
};

const GENERIC_DETAILS: Record<number, string> = {
  400: 'La solicitud no es válida. Revisa el formato del cuerpo enviado.',
  401: 'Debes iniciar sesión para usar esta ruta.',
  403: 'No tienes permiso para realizar esta acción.',
  404: 'La ruta o el recurso solicitado no existe.',
  405: 'El método HTTP no está permitido en esta ruta.',
  413: 'El cuerpo de la solicitud supera el tamaño permitido.',
  415: 'El tipo de contenido enviado no es soportado; usa application/json.',
  429: 'Hiciste demasiadas solicitudes. Espera un momento e intenta de nuevo.',
  500: 'Ocurrió un error inesperado. Si persiste, comunícate con soporte.',
};

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger('platform');

  constructor(private readonly cls: ClsService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') throw exception;
    const http = host.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();

    const problem = this.toProblem(exception, request.url);
    if (problem.status >= 500) {
      this.logger.error({ err: exception }, 'Error no controlado al atender la solicitud');
    }
    void reply
      .status(problem.status)
      .header('content-type', 'application/problem+json; charset=utf-8')
      .send(problem);
  }

  private toProblem(exception: unknown, instance: string): ProblemDetails {
    const requestId = this.cls.isActive() ? this.cls.getId() : undefined;
    const base = { instance, ...(requestId ? { requestId } : {}) };

    if (exception instanceof DomainError) {
      const status = STATUS_BY_KIND[exception.kind];
      const { errors, ...details } = exception.details ?? {};
      return {
        type: `urn:nowcleanny:problem:${exception.code}`,
        title: TITLES[status] ?? 'Error',
        status,
        detail: exception.message,
        code: exception.code,
        ...base,
        ...(errors === undefined ? {} : { errors }),
        ...(Object.keys(details).length > 0 ? { details } : {}),
      };
    }

    const status = statusOf(exception);
    return {
      type: 'about:blank',
      title: TITLES[status] ?? 'Error',
      status,
      detail: GENERIC_DETAILS[status] ?? GENERIC_DETAILS[500] ?? '',
      code: `http.${String(status)}`,
      ...base,
    };
  }
}

function statusOf(exception: unknown): number {
  if (exception instanceof HttpException) return exception.getStatus();
  // Fastify errors (body parsing, content type, payload size) carry their own statusCode.
  if (typeof exception === 'object' && exception !== null && 'statusCode' in exception) {
    const status = Number(exception.statusCode);
    if (status >= 400 && status < 600) return status;
  }
  return 500;
}
