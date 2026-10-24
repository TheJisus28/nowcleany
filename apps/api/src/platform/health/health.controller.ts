import { Controller, Get, HttpCode, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { sql } from 'kysely';
import { AppConfig } from '../config/app-config.js';
import { DatabasePools } from '../db/database-pools.js';
import type { PlatformTables } from '../outbox/outbox.tables.js';
import { Public } from '../security/decorators.js';

interface ReadinessReport {
  status: 'ok' | 'degraded';
  checks: { database: 'ok' | 'error'; outboxLagSeconds: number | null };
}

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly pools: DatabasePools,
    private readonly config: AppConfig,
  ) {}

  /** The process is up. */
  @Get('live')
  @HttpCode(200)
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /** Database reachable and outbox not lagging behind. 503 otherwise. */
  @Get('ready')
  async ready(): Promise<ReadinessReport> {
    let lag: number | null;
    try {
      const result = await sql<{ lag: number | null }>`
        SELECT EXTRACT(EPOCH FROM now() - min(occurred_at))::float8 AS lag
        FROM platform.outbox
        WHERE published_at IS NULL AND failed_at IS NULL`.execute(
        this.pools.kysely<PlatformTables>('platform'),
      );
      lag = result.rows[0]?.lag ?? 0;
    } catch {
      throw new ServiceUnavailableException({
        status: 'degraded',
        checks: { database: 'error', outboxLagSeconds: null },
      });
    }
    const report: ReadinessReport = {
      status: lag > this.config.outboxMaxLagSeconds ? 'degraded' : 'ok',
      checks: { database: 'ok', outboxLagSeconds: Math.round(lag) },
    };
    if (report.status !== 'ok') throw new ServiceUnavailableException(report);
    return report;
  }
}
