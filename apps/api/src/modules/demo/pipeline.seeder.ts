import { Injectable, Logger } from '@nestjs/common';
import { InvoicesService } from '../billing/index.js';
import { ShipmentsService } from '../logistics/index.js';
import { ProductCatalog } from '../product/index.js';
import {
  PurchaseOrdersService,
  PurchasePlansService,
  SupplierDirectory,
  SupplierInvoicesService,
} from '../purchasing/index.js';
import { PortfolioLoader, SalesOrdersService, type SeedOrder } from '../sales/index.js';
import { addDays, DemoActors, monthStart, TEAM, todayIso } from './demo-actors.js';

// DATOS DE EJEMPLO: cómo está la operación hoy, con algo pendiente en la bandeja de cada rol.

type Stage =
  | 'draft'
  | 'cancelled'
  | 'confirmed'
  | 'invoiced'
  | 'partial'
  | 'ready'
  | 'in-transit'
  | 'delivered';

interface PipelineOrder extends Omit<SeedOrder, 'outcome'> {
  stage: Stage;
  /** Diego's priority when he invoiced it. */
  priority?: number;
  allowPartial?: boolean;
  /** Partial dispatch: what plant handed over (code → quantity). */
  handOver?: Readonly<Record<string, string>>;
}

const ORDERS: readonly PipelineOrder[] = [
  // The SCIP proposal: 2.950 boxes of chlorine sold, only 2.000 can be made. Waiting for Diego.
  { customer: '900123456-7', inDays: 9, stage: 'confirmed', lines: [['00224', '1200']] },
  { customer: '900456789-1', inDays: 11, stage: 'confirmed', lines: [['00224', '800']] },
  { customer: '800987654-3', inDays: 16, stage: 'confirmed', lines: [['00224', '950']] },
  { customer: '891080123-5', inDays: 5, stage: 'confirmed', lines: [['00225', '300']] },
  { customer: '800987654-3', inDays: 14, stage: 'confirmed', lines: [['00310', '400']] },
  { customer: '900456789-1', inDays: 20, stage: 'draft', lines: [['00224', '300']] },
  // Plant handed these over: logistics must put them in a guide.
  {
    customer: '901234567-1',
    inDays: -1,
    stage: 'ready',
    lines: [
      ['00410', '240'],
      ['00810', '120'],
    ],
  },
  {
    customer: '900765432-8',
    inDays: 0,
    stage: 'ready',
    lines: [
      ['00226', '150'],
      ['00610', '300'],
    ],
  },
  // Diego invoiced them with product still to make: plant's queue (he ranked them).
  {
    customer: '900334455-6',
    inDays: 4,
    stage: 'invoiced',
    priority: 1,
    lines: [
      ['00811', '200'],
      ['00411', '150'],
      ['00311', '300'],
    ],
  },
  {
    customer: '901556677-3',
    inDays: 7,
    stage: 'invoiced',
    priority: 2,
    lines: [
      ['00811', '300'],
      ['00411', '200'],
    ],
  },
  {
    customer: '901112223-4',
    inDays: 3,
    stage: 'invoiced',
    priority: 3,
    allowPartial: true,
    lines: [
      ['00611', '150'],
      ['00810', '100'],
    ],
  },
  // Partial dispatch: what existed already left; the garrafas are still to make.
  {
    customer: '812004567-2',
    inDays: 2,
    stage: 'partial',
    priority: 4,
    allowPartial: true,
    handOver: { '00510': '60' },
    lines: [
      ['00227', '40'],
      ['00510', '120'],
    ],
  },
  // On the road today, in one guide.
  {
    customer: '901234567-1',
    branch: 'Barrio Granada',
    inDays: 0,
    stage: 'in-transit',
    lines: [['00411', '120']],
  },
  {
    customer: '900887766-5',
    branch: 'Montelíbano',
    inDays: 0,
    stage: 'in-transit',
    lines: [['00611', '200']],
  },
  // Delivered yesterday: their invoices are now receivables.
  { customer: '812998877-0', inDays: -1, stage: 'delivered', lines: [['00410', '60']] },
  {
    customer: '900765432-8',
    inDays: -1,
    stage: 'delivered',
    lines: [
      ['01013', '48'],
      ['01015', '60'],
    ],
  },
  // Sent by the sellers today: Diego's consolidation.
  {
    customer: '50912345',
    inDays: 5,
    stage: 'confirmed',
    lines: [
      ['00610', '200'],
      ['00410', '100'],
      ['01010', '12'],
      ['01013', '24'],
    ],
  },
  {
    customer: '812998877-0',
    inDays: 6,
    stage: 'confirmed',
    lines: [
      ['00710', '400'],
      ['00311', '200'],
    ],
  },
  {
    customer: '900887766-5',
    inDays: 8,
    stage: 'confirmed',
    lines: [
      ['00226', '300'],
      ['00610', '400'],
      ['00810', '150'],
      ['01010', '30'],
      ['01011', '24'],
      ['01015', '40'],
    ],
  },
  {
    customer: '78034567',
    inDays: 10,
    stage: 'confirmed',
    lines: [
      ['00510', '200'],
      ['00511', '100'],
      ['01014', '36'],
    ],
  },
  {
    customer: '900221100-7',
    inDays: 12,
    stage: 'confirmed',
    lines: [
      ['00227', '30'],
      ['00226', '100'],
    ],
  },
  {
    customer: '901667788-2',
    inDays: 14,
    stage: 'confirmed',
    lines: [
      ['00311', '150'],
      ['00710', '100'],
    ],
  },
  {
    customer: '901998811-4',
    inDays: 18,
    stage: 'confirmed',
    lines: [
      ['00410', '400'],
      ['00811', '100'],
    ],
  },
  {
    customer: '812776655-1',
    inDays: 21,
    stage: 'confirmed',
    lines: [
      ['00610', '300'],
      ['00611', '100'],
      ['00810', '200'],
    ],
  },
  {
    customer: '812004567-2',
    branch: 'Sede Norte',
    inDays: 15,
    stage: 'draft',
    lines: [
      ['00226', '120'],
      ['00710', '60'],
    ],
  },
  { customer: '900334455-6', inDays: 20, stage: 'draft', lines: [['00811', '250']] },
  {
    customer: '901998811-4',
    inDays: 9,
    stage: 'cancelled',
    lines: [['00511', '150']],
    cancelReason: 'El cliente aplazó el pedido para el próximo mes.',
  },
];

const OUTCOME: Record<Stage, SeedOrder['outcome']> = {
  draft: 'draft',
  cancelled: 'cancel',
  confirmed: 'confirm',
  invoiced: 'confirm',
  partial: 'confirm',
  ready: 'confirm',
  'in-transit': 'confirm',
  delivered: 'confirm',
};

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000);

@Injectable()
export class PipelineSeeder {
  private readonly logger = new Logger('demo');

  constructor(
    private readonly actors: DemoActors,
    private readonly portfolio: PortfolioLoader,
    private readonly orders: SalesOrdersService,
    private readonly invoices: InvoicesService,
    private readonly shipments: ShipmentsService,
    private readonly catalog: ProductCatalog,
    private readonly purchaseOrders: PurchaseOrdersService,
    private readonly supplierInvoices: SupplierInvoicesService,
    private readonly plans: PurchasePlansService,
    private readonly suppliers: SupplierDirectory,
  ) {}

  async seed(): Promise<void> {
    const guides = await this.actors.as(TEAM.logistics, () => this.shipments.list({ limit: 1 }));
    if (guides.length > 0) {
      this.logger.log('La operación de hoy ya estaba cargada');
      return;
    }
    const ids = await this.portfolio.loadOrders(
      ORDERS.map(({ stage, priority: _p, allowPartial: _a, handOver: _h, ...order }) => ({
        ...order,
        outcome: OUTCOME[stage],
      })),
    );
    const byStage = (...stages: Stage[]) =>
      ORDERS.map((order, index) => ({ order, id: ids[index] ?? '' })).filter(
        ({ order, id }) => id && stages.includes(order.stage),
      );

    // Older orders were sent earlier.
    for (const { order, id } of byStage(
      'delivered',
      'partial',
      'invoiced',
      'ready',
      'in-transit',
    )) {
      const days = order.stage === 'delivered' || order.stage === 'partial' ? 3 : 2;
      await this.orders.backdate(id, hoursAgo(days * 24 + 2));
    }

    // Diego consolidates and invoices (with his priority and whether a partial dispatch is allowed).
    await this.actors.as(TEAM.consolidator, async () => {
      for (const { order, id } of byStage(
        'delivered',
        'partial',
        'ready',
        'in-transit',
        'invoiced',
      )) {
        await this.invoices.issue(
          [
            {
              orderId: id,
              ...(order.priority ? { priority: order.priority } : {}),
              ...(order.allowPartial ? { allowPartial: true } : {}),
            },
          ],
          hoursAgo(order.stage === 'delivered' || order.stage === 'partial' ? 50 : 26),
        );
      }
    });

    // Plant prepares what exists and hands it over to dispatch.
    const products = new Map(
      (await this.catalog.findByCodes(ORDERS.flatMap((o) => o.lines.map(([code]) => code)))).map(
        (p) => [p.code, p.id],
      ),
    );
    await this.actors.as(TEAM.plant, async () => {
      for (const { order, id } of byStage('delivered', 'partial', 'ready', 'in-transit')) {
        const quantities = order.handOver
          ? Object.entries(order.handOver).map(([code, quantity]) => ({
              productId: products.get(code) ?? '',
              quantity,
            }))
          : undefined;
        await this.orders.prepare(
          id,
          quantities,
          hoursAgo(order.stage === 'delivered' || order.stage === 'partial' ? 30 : 5),
        );
      }
    });

    // Logistics: yesterday's guide (delivered, with the partial dispatch) and today's guide on the road.
    await this.actors.as(TEAM.logistics, async () => {
      const yesterday = byStage('delivered', 'partial').map(({ id }) => id);
      const done = await this.shipments.create(
        {
          orderIds: yesterday,
          carrier: 'Transportes del Sinú S.A.S.',
          vehiclePlate: 'KXM482',
          driverName: 'Jairo Pertuz',
          route: 'Ruta Montería',
          scheduledDate: addDays(todayIso(), -1),
        },
        hoursAgo(28),
      );
      await this.shipments.dispatch(done.id, hoursAgo(27));
      for (const [index, id] of yesterday.entries()) {
        await this.shipments.deliver(
          done.id,
          id,
          ['Martha Cogollo', 'Jorge Hoyos', 'Luz Marina Arrieta'][index % 3] ?? 'Cliente',
          hoursAgo(24 - index),
        );
      }
      const today = await this.shipments.create(
        {
          orderIds: byStage('in-transit').map(({ id }) => id),
          carrier: 'Flota propia NOW CLEANY',
          vehiclePlate: 'TJN215',
          driverName: 'Wilson Arrieta',
          route: 'Ruta Montería – Planeta Rica – Montelíbano',
          scheduledDate: todayIso(),
        },
        hoursAgo(3),
      );
      await this.shipments.dispatch(today.id, hoursAgo(2));
    });

    await this.seedPurchasing();
    this.logger.log(`Operación de hoy: ${String(ids.length)} preventas en el flujo`);
  }

  /** What Alfonso has on its way, Silvia's invoice of today and Alfonso's plan for next month. */
  private async seedPurchasing(): Promise<void> {
    const codes = [
      'MP-HIPO-15',
      'MP-SODA',
      'MP-ENV-2L',
      'MP-TAPA-28',
      'MP-CAJA-6',
      '00224',
      '00610',
      '01013',
    ];
    const products = new Map((await this.catalog.findByCodes(codes)).map((p) => [p.code, p.id]));
    const id = (code: string) => products.get(code) ?? '';
    const [, plastics] = await this.actors.as(TEAM.purchasing, async () => [
      await this.purchaseOrders.create({
        supplierId: await this.suppliers.idOf('Químicos del Caribe S.A.S.'),
        expectedDate: addDays(todayIso(), 4),
        notes: 'Urgente: cubre las preventas de cloro sin insumos.',
        lines: [
          { productId: id('MP-HIPO-15'), quantity: '8000' },
          { productId: id('MP-SODA'), quantity: '60' },
        ],
      }),
      await this.purchaseOrders.create({
        supplierId: await this.suppliers.idOf('Plásticos del Sinú S.A.S.'),
        expectedDate: addDays(todayIso(), 2),
        lines: [
          { productId: id('MP-ENV-2L'), quantity: '12000' },
          { productId: id('MP-TAPA-28'), quantity: '12000' },
        ],
      }),
      await this.purchaseOrders.create({
        supplierId: await this.suppliers.idOf('Cartones de Córdoba S.A.S.'),
        expectedDate: addDays(todayIso(), 3),
        notes: 'Pedido por teléfono.',
        lines: [{ productId: id('MP-CAJA-6'), quantity: '300' }],
      }),
    ]);
    // Half of the plastics arrived today with their invoice: Silvia entered it.
    await this.actors.as(TEAM.receiving, () =>
      this.supplierInvoices.register(plastics.id, {
        documentNumber: 'FE-5021',
        invoiceDate: todayIso(),
        lines: [
          { productId: id('MP-ENV-2L'), quantity: '5000' },
          { productId: id('MP-TAPA-28'), quantity: '5000' },
        ],
      }),
    );
    // Alfonso's plan for next month: "we need 7.000 boxes of chlorine".
    const nextMonth = monthStart(todayIso(), 1).slice(0, 7);
    await this.actors.as(TEAM.purchasing, () =>
      this.plans.save(nextMonth, [
        { productId: id('00224'), quantity: '7000' },
        { productId: id('00610'), quantity: '3200' },
        { productId: id('01013'), quantity: '500' },
      ]),
    );
  }
}
