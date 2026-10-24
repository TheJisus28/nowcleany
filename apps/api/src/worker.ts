import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { WorkerModule } from './worker.module.js';

// Outbox dispatcher, event consumers and scheduled jobs. Several workers may run: advisory locks
// guarantee a single active dispatcher and a single runner per job.
const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
app.useLogger(app.get(Logger));
app.enableShutdownHooks();
app.get(Logger).log('Worker iniciado');
