import { plainToInstance, Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsString, Max, Min, validateSync } from 'class-validator';
import { toFieldErrors } from '../errors/validation-messages.js';

export const NODE_ENVS = ['development', 'test', 'production'] as const;
export type NodeEnv = (typeof NODE_ENVS)[number];

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/** Static environment variables (DB_PASSWORD and JWT_SECRET are read as secrets by AppConfig). */
export class Environment {
  @IsIn(NODE_ENVS)
  NODE_ENV: NodeEnv = 'development';

  @IsString()
  HTTP_HOST = '0.0.0.0';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  HTTP_PORT = 3000;

  @IsIn(LOG_LEVELS)
  LOG_LEVEL: LogLevel = 'info';

  @IsString()
  @IsNotEmpty()
  DB_HOST = 'localhost';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  DB_PORT = 5432;

  @IsString()
  @IsNotEmpty()
  DB_NAME = 'nowcleanny';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  DB_POOL_MAX = 10;

  @IsString()
  @IsNotEmpty()
  DB_USER = 'nowcleanny_owner';
}

export class InvalidConfigurationError extends Error {
  constructor(problems: readonly string[]) {
    super(`Configuración inválida:\n- ${problems.join('\n- ')}`);
    this.name = 'InvalidConfigurationError';
  }
}

export function validateEnvironment(raw: Record<string, unknown>): Environment {
  const environment = plainToInstance(Environment, raw, { exposeDefaultValues: true });
  const errors = validateSync(environment, { forbidUnknownValues: true });
  if (errors.length > 0) {
    throw new InvalidConfigurationError(
      toFieldErrors(errors).map(({ message }) => `Variable de entorno ${message}`),
    );
  }
  return environment;
}
