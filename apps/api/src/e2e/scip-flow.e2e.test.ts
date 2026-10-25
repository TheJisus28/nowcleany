import { setTimeout as sleep } from 'node:timers/promises';
import { NestFactory } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WorkerModule } from '../worker.module.js';
import { type Client, createApi, login, migrateAndSeed, useTestDatabase } from './tests/support.js';

interface Q {
  quantity: string;
  unit: string;
}
interface Ref {
  id: string;
  code: string;
}
interface OversellRow {
  product: Ref;
  sold: Q;
  capacity: Q;
  uncovered: Q;
  bySeller: { sellerName: string; quantity: Q }[];
  materialsToCover: (Ref & { quantity: Q })[];
}
interface PurchaseRow {
  product: Ref;
  toBuy: Q;
  onOrder: Q;
}
interface StatusRow {
  code: string;
  productId: string;
  onHand: Q;
  reserved: Q;
}
interface Order {
  id: string;
  label: string;
  status: string;
}

const byCode = <T extends { product: Ref }>(rows: readonly T[], code: string): T => {
  const row = rows.find((r) => r.product.code === code);
  if (!row) throw new Error(`Sin fila para ${code}`);
  return row;
};

let app: NestFastifyApplication;
let manager: Client;

beforeAll(async () => {
  useTestDatabase();
  await migrateAndSeed();
  app = await createApi();
  manager = await login(app, 'gerencia@nowcleany.local');
});

afterAll(async () => {
  await app.close();
});

async function status(code: string): Promise<StatusRow> {
  const rows = (await manager.get<StatusRow[]>(`/v1/inventory/status?q=${code}`)).body;
  const row = rows.find((r) => r.code === code);
  if (!row) throw new Error(`Sin estado para ${code}`);
  return row;
}

describe('SCIP end to end (demo data of the proposal)', () => {
  it('reproduces the oversell report: 2 950 sold, 2 000 capacity, 950 uncovered', async () => {
    const report = await manager.get<{ rows: OversellRow[] }>('/v1/planning/oversell');
    expect(report.status).toBe(200);
    const box = byCode(report.body.rows, '00224');
    expect([box.sold.quantity, box.capacity.quantity, box.uncovered.quantity]).toEqual([
      '2950',
      '2000',
      '950',
    ]);
    expect(box.bySeller.map((s) => [s.sellerName, s.quantity.quantity])).toEqual([
      ['Andrea Ruiz', '1200'],
      ['Camila Torres', '950'],
      ['Bernardo Díaz', '800'],
    ]);
    expect(
      Object.fromEntries(box.materialsToCover.map((m) => [m.code, m.quantity.quantity])),
    ).toEqual({
      'MP-ENV-2L': '5757',
      'MP-TAPA-28': '5700',
      'MP-ETQ-CL2': '5700',
      'MP-CAJA-6': '950',
      'MP-HIPO-15': '4029.9',
      'MP-AGUA': '7410',
      'MP-SODA': '22.8',
    });
  });

  it('buys exactly the net shortage, discounting what is in transit', async () => {
    const { rows } = (await manager.get<{ rows: PurchaseRow[] }>('/v1/planning/purchase-needs'))
      .body;
    expect(byCode(rows, 'MP-CAJA-6').onOrder.quantity).toBe('300');
    expect(byCode(rows, 'MP-CAJA-6').toBuy.quantity).toBe('650');
    expect(byCode(rows, 'MP-ENV-2L').toBuy.quantity).toBe('5757');
    expect(byCode(rows, 'MP-HIPO-15').toBuy.quantity).toBe('4029.9');
    expect(byCode(rows, 'MP-GALON').toBuy.quantity).toBe('0');
  });

  it('follows every record: what can be promised, where a material goes, who asked for it', async () => {
    const availability = (
      await manager.get<{ rows: { product: Ref; promisable: Q }[] }>('/v1/planning/availability')
    ).body.rows;
    expect(
      Object.fromEntries(availability.map((row) => [row.product.code, row.promisable.quantity])),
    ).toEqual({ '00224': '0', '00225': '795', '00310': '650' });

    const caps = await status('MP-TAPA-28');
    const usedBy = (await manager.get<Ref[]>(`/v1/products/${caps.productId}/where-used`)).body;
    expect(usedBy.map((product) => product.code)).toEqual(['00224', '00225']);

    const box = await status('00224');
    const orders = (
      await manager.get<(Order & { customer: { id: string } })[]>(
        `/v1/sales-orders?productId=${box.productId}&status=CONFIRMED`,
      )
    ).body;
    expect(orders.map((order) => order.label).sort()).toEqual(['PV-00001', 'PV-00002', 'PV-00003']);
    const customer = await manager.get<{ name: string }>(
      `/v1/customers/${orders[0]?.customer.id ?? ''}`,
    );
    expect(customer.status).toBe(200);

    const boxes = await status('MP-CAJA-6');
    const purchases = await manager.get<Order[]>(
      `/v1/purchase-orders?productId=${boxes.productId}`,
    );
    expect(purchases.body.map((order) => order.label)).toEqual(['OC-00001']);
    const none = await manager.get<Order[]>(`/v1/purchase-orders?productId=${box.productId}`);
    expect(none.body).toEqual([]);

    const gallon = await status('00310');
    const production = await manager.get<Order[]>(
      `/v1/production-orders?productId=${gallon.productId}`,
    );
    expect(production.body.map((order) => order.label)).toEqual(['OP-00001']);
  });

  it('closes the loop: receipt, production, packaging, transfer and dispatch', async () => {
    const warehouse = await login(app, 'bodega@nowcleany.local');
    const plant = await login(app, 'planta@nowcleany.local');

    const [purchase] = (await warehouse.get<Order[]>('/v1/purchase-orders?status=OPEN')).body;
    expect(
      (await warehouse.post<Order>(`/v1/purchase-orders/${purchase?.id ?? ''}/receive`)).body
        .status,
    ).toBe('RECEIVED');
    expect((await status('MP-CAJA-6')).onHand.quantity).toBe('2300');

    const bulk = await status('GR-CLORO');
    const bulkOrder = await plant.post<Order>('/v1/production-orders', {
      productId: bulk.productId,
      quantity: '24000',
    });
    expect(
      (await plant.post<Order>(`/v1/production-orders/${bulkOrder.body.id}/complete`)).body.status,
    ).toBe('COMPLETED');
    expect((await status('GR-CLORO')).onHand.quantity).toBe('24000');
    expect((await status('MP-HIPO-15')).onHand.quantity).toBe('0');

    const box = await status('00224');
    const packOrder = await plant.post<Order>('/v1/production-orders', {
      productId: box.productId,
      quantity: '2000',
    });
    await plant.post(`/v1/production-orders/${packOrder.body.id}/complete`);
    expect((await status('00224')).onHand.quantity).toBe('2000');
    expect((await status('MP-ENV-2L')).onHand.quantity).toBe('0');

    expect(
      (await plant.post('/v1/inventory/transfers', { productId: box.productId, quantity: '2000' }))
        .status,
    ).toBe(201);
    const orders = (await warehouse.get<Order[]>('/v1/sales-orders?status=CONFIRMED')).body;
    const andrea = orders.find((order) => order.label === 'PV-00001');
    expect(
      (await warehouse.post<Order>(`/v1/sales-orders/${andrea?.id ?? ''}/dispatch`)).body.status,
    ).toBe('DISPATCHED');

    const after = await status('00224');
    expect([after.onHand.quantity, after.reserved.quantity]).toEqual(['800', '1750']);
    const report = await manager.get<{ rows: OversellRow[] }>('/v1/planning/oversell');
    expect(byCode(report.body.rows, '00224').uncovered.quantity).toBe('950');
  });

  it('denies by default: 401 without a session, 403 without the permission, no 200 on route variants', async () => {
    expect((await app.inject({ method: 'GET', url: '/v1/planning/oversell' })).statusCode).toBe(
      401,
    );
    expect((await app.inject({ method: 'HEAD', url: '/v1/planning/oversell' })).statusCode).toBe(
      401,
    );
    for (const url of [
      '/v1/planning/oversell/',
      '/V1/planning/oversell',
      '//v1/planning/oversell',
    ]) {
      expect([401, 404]).toContain((await app.inject({ method: 'GET', url })).statusCode);
    }
    expect(
      (await app.inject({ method: 'OPTIONS', url: '/v1/planning/oversell' })).statusCode,
    ).not.toBe(200);
    const seller = await login(app, 'vendedor.a@nowcleany.local');
    const forbidden = await seller.post<{ status: number; code: string }>('/v1/purchase-orders', {
      supplier: 'X',
      lines: [],
    });
    expect([forbidden.status, forbidden.body.code]).toEqual([403, 'auth.forbidden']);
  });

  // Last on purpose: the worker runs in this same process and, when closed, takes over the static
  // transaction hosts the API resolves (@Transactional). In production they are separate processes.
  it('releases the reservations of a cancelled order through the outbox and the worker', async () => {
    const seller = await login(app, 'vendedor.c@nowcleany.local');
    const camila = (
      await seller.get<Order[]>('/v1/sales-orders?mine=true&status=CONFIRMED')
    ).body.find((order) => order.label === 'PV-00003');
    expect(
      (
        await seller.post<Order>(`/v1/sales-orders/${camila?.id ?? ''}/cancel`, {
          reason: 'Cliente desistió',
        })
      ).body.status,
    ).toBe('CANCELLED');
    const worker = await NestFactory.createApplicationContext(WorkerModule, { logger: false });
    try {
      let reserved = '';
      for (let attempt = 0; attempt < 40 && reserved !== '800'; attempt++) {
        await sleep(250);
        reserved = (await status('00224')).reserved.quantity;
      }
      expect(reserved).toBe('800');
    } finally {
      await worker.close();
    }
  });
});
