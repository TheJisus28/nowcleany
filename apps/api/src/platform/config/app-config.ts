import {
  type Environment,
  InvalidConfigurationError,
  type LogLevel,
  type NodeEnv,
  validateEnvironment,
} from './environment.js';

export interface DatabaseCredentials {
  readonly user: string;
  readonly password: string;
}

const MODULE_NAME = /^[a-z][a-z0-9_]*$/;

/** Name of the PostgreSQL login role a module connects with (one role and one schema per module). */
export function roleName(module: string): string {
  if (!MODULE_NAME.test(module)) {
    throw new InvalidConfigurationError([
      `Nombre de módulo inválido para la base de datos: "${module}".`,
    ]);
  }
  return `app_${module}`;
}

/** Typed, validated configuration shared by the API, the worker and migrate.ts. */
export class AppConfig {
  readonly nodeEnv: NodeEnv;
  readonly http: { readonly host: string; readonly port: number };
  readonly logLevel: LogLevel;
  readonly database: {
    readonly host: string;
    readonly port: number;
    readonly name: string;
    readonly poolMax: number;
  };
  readonly outboxMaxLagSeconds: number;

  private constructor(
    environment: Environment,
    private readonly raw: Readonly<Record<string, string | undefined>>,
  ) {
    this.nodeEnv = environment.NODE_ENV;
    this.http = { host: environment.HTTP_HOST, port: environment.HTTP_PORT };
    this.logLevel = environment.LOG_LEVEL;
    this.database = {
      host: environment.DB_HOST,
      port: environment.DB_PORT,
      name: environment.DB_NAME,
      poolMax: environment.DB_POOL_MAX,
    };
    this.outboxMaxLagSeconds = environment.OUTBOX_MAX_LAG_SECONDS;
  }

  static fromEnv(raw: Readonly<Record<string, string | undefined>>): AppConfig {
    return new AppConfig(validateEnvironment(raw), raw);
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  /** Credentials of the role for `module` (or "platform"), from DB_PASSWORD_<MODULE>. */
  credentialsFor(module: string): DatabaseCredentials {
    return {
      user: roleName(module),
      password: this.secret(`DB_PASSWORD_${module.toUpperCase()}`),
    };
  }

  /** Owner role, used only by migrate.ts. */
  ownerCredentials(): DatabaseCredentials {
    return { user: this.secret('DB_OWNER_USER'), password: this.secret('DB_OWNER_PASSWORD') };
  }

  /** A required secret or setting that is not part of the static schema. */
  secret(name: string): string {
    const value = this.raw[name];
    if (value === undefined || value.trim() === '') {
      throw new InvalidConfigurationError([`Falta la variable de entorno ${name}.`]);
    }
    return value;
  }
}
