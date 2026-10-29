import {
  type Environment,
  InvalidConfigurationError,
  type LogLevel,
  type NodeEnv,
  validateEnvironment,
} from './environment.js';

/** Typed, validated configuration shared by the API and migrate.ts. */
export class AppConfig {
  readonly nodeEnv: NodeEnv;
  readonly http: { readonly host: string; readonly port: number };
  readonly logLevel: LogLevel;
  readonly database: {
    readonly host: string;
    readonly port: number;
    readonly database: string;
    readonly user: string;
    readonly password: string;
    readonly poolMax: number;
  };

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
      database: environment.DB_NAME,
      user: environment.DB_USER,
      password: this.secret('DB_PASSWORD'),
      poolMax: environment.DB_POOL_MAX,
    };
  }

  static fromEnv(raw: Readonly<Record<string, string | undefined>>): AppConfig {
    return new AppConfig(validateEnvironment(raw), raw);
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
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
