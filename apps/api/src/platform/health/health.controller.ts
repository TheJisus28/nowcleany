import { Controller, Get, HttpCode, Inject, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { type Kysely, sql } from 'kysely';
import { KYSELY } from '../db/database.js';
import { Public } from '../security/decorators.js';

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(@Inject(KYSELY) private readonly db: Kysely<any>) {}

  /** The process is up. */
  @Get('live')
  @HttpCode(200)
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /** The database answers. 503 otherwise. */
  @Get('ready')
  async ready(): Promise<{ status: 'ok' }> {
    try {
      await sql`SELECT 1`.execute(this.db);
    } catch {
      throw new ServiceUnavailableException({ status: 'degraded', checks: { database: 'error' } });
    }
    return { status: 'ok' };
  }
}
