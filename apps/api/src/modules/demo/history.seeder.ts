import { Injectable, Logger } from '@nestjs/common';
import { InvoicesService } from '../billing/index.js';
import { ProductCatalog } from '../product/index.js';
import {
  PurchaseOrdersService,
  SupplierDirectory,
  SupplierInvoicesService,
} from '../purchasing/index.js';
import { CustomersService, SalesOrdersService } from '../sales/index.js';
import { addDays, at, DemoActors, monthStart, random, TEAM, todayIso } from './demo-actors.js';

// DATOS DE EJEMPLO: seis meses de operación para que el histórico, la sugerencia de compra del mes y los
// reportes de cobros y pagos tengan con qué trabajar. Las cantidades son ilustrativas. Esta historia no
// mueve el inventario de hoy (que ya refleja lo que pasó).

/** Units sold of each product in the latest month; earlier months follow MONTH_FACTORS. */
const MONTHLY_SALES: readonly (readonly [code: string, units: number])[] = [
  ['00224', 6850],
  ['00225', 2400],
  ['00226', 1900],
  ['00227', 260],
  ['00310', 700],
  ['00311', 1500],
  ['00410', 2600],
  ['00411', 900],
  ['00510', 800],
  ['00511', 350],
  ['00610', 3100],
  ['00611', 700],
  ['00710', 1200],
  ['00810', 2300],
  ['00811', 650],
  ['01010', 260],
  ['01011', 200],
  ['01012', 120],
  ['01013', 450],
  ['01014', 380],
  ['01015', 520],
];

/** Oldest to latest month: sales grew this semester. */
const MONTH_FACTORS = [0.84, 0.88, 0.92, 0.96, 0.94, 1];
const ORDERS_PER_MONTH = 30;

/** What purchasing ordered every month from each supplier (latest month; earlier months scale). */
const MONTHLY_PURCHASES: readonly (readonly [
  supplier: string,
  lines: readonly (readonly [string, number])[],
])[] = [
  [
    'Químicos del Caribe S.A.S.',
    [
      ['MP-HIPO-15', 26000],
      ['MP-SODA', 150],
    ],
  ],
  [
    'Plásticos del Sinú S.A.S.',
    [
      ['MP-ENV-2L', 40000],
      ['MP-ENV-1L', 2600],
      ['MP-TAPA-28', 43000],
      ['MP-GALON', 5200],
      ['MP-TAPA-38', 5200],
      ['MP-ENV-500', 4300],
      ['MP-GARRAFA', 260],
      ['MP-TAPA-GAR', 260],
      ['MP-TAPA-PUSH', 3200],
      ['MP-ATOMIZ', 1200],
    ],
  ],
  ['Cartones de Córdoba S.A.S.', [['MP-CAJA-6', 6900]]],
  [
    'Litografía Montería',
    [
      ['MP-ETQ-CL2', 40000],
      ['MP-ETQ-CL1', 2600],
      ['MP-ETQ-CLGAL', 1900],
      ['MP-ETQ-SOF1', 2600],
      ['MP-ETQ-FAB1', 2300],
      ['MP-ETQ-DRO5', 3100],
    ],
  ],
  [
    'Químicos Industriales de la Costa',
    [
      ['MP-LAS', 900],
      ['MP-LAURIL', 1100],
      ['MP-ESTER', 700],
      ['MP-BUTIL', 120],
      ['MP-QUAT', 60],
      ['MP-EDTA', 40],
      ['MP-FRAG-LAV', 40],
      ['MP-FRAG-SUAV', 60],
      ['MP-FRAG-LIM', 30],
    ],
  ],
  ['Solventes y Alcoholes del Norte', [['MP-ALCOHOL', 300]]],
  [
    'Distribuidora Aseo Total S.A.S.',
    [
      ['01010', 260],
      ['01011', 200],
      ['01012', 120],
      ['01013', 450],
      ['01014', 380],
      ['01015', 520],
    ],
  ],
];

const RECEIVERS = [
  'Luz Marina Arrieta',
  'Jorge Hoyos',
  'Martha Cogollo',
  'Carlos Sánchez',
  'Ana Petro',
  'Rafael Doria',
  'Yesenia Martínez',
  'Óscar Ramos',
];

const ROUTES: Record<string, string> = {
  Montería: 'Ruta Montería',
  Cereté: 'Ruta Cereté – Lorica',
  Lorica: 'Ruta Cereté – Lorica',
  Sahagún: 'Ruta Sahagún – Chinú',
  Chinú: 'Ruta Sahagún – Chinú',
  'Planeta Rica': 'Ruta Planeta Rica – Montelíbano',
  Montelíbano: 'Ruta Planeta Rica – Montelíbano',
  Tierralta: 'Ruta Tierralta',
};

const METHODS = ['TRANSFER', 'TRANSFER', 'TRANSFER', 'DEPOSIT', 'CASH', 'CHECK'] as const;

@Injectable()
export class HistorySeeder {
  private readonly logger = new Logger('demo');

  constructor(
    private readonly actors: DemoActors,
    private readonly customers: CustomersService,
    private readonly orders: SalesOrdersService,
    private readonly invoices: InvoicesService,
    private readonly catalog: ProductCatalog,
    private readonly purchaseOrders: PurchaseOrdersService,
    private readonly supplierInvoices: SupplierInvoicesService,
    private readonly suppliers: SupplierDirectory,
  ) {}

  async seed(): Promise<void> {
    const existing = await this.actors.as(TEAM.accountant, () => this.invoices.list({ limit: 1 }));
    if (existing.length > 0) {
      this.logger.log('La historia de demo ya existía');
      return;
    }
    const sales = await this.seedSales();
    const purchases = await this.seedPurchases();
    this.logger.log(
      `Historia de 6 meses: ${String(sales)} ventas entregadas, ${String(purchases)} compras`,
    );
  }

  private async seedSales(): Promise<number> {
    const today = todayIso();
    const next = random(20_261_029);
    const customers = await this.actors.as(TEAM.manager, () => this.customers.list({}));
    const products = new Map(
      (await this.catalog.findByCodes(MONTHLY_SALES.map(([code]) => code))).map((p) => [p.code, p]),
    );
    let count = 0;
    for (const [index, factor] of MONTH_FACTORS.entries()) {
      const month = monthStart(today, index - (MONTH_FACTORS.length - 1));
      const lastDay = index === MONTH_FACTORS.length - 1 ? Number(today.slice(8)) - 4 : 27;
      // Spread each product's month over a handful of orders.
      const baskets: Map<string, number>[] = Array.from(
        { length: ORDERS_PER_MONTH },
        () => new Map<string, number>(),
      );
      for (const [code, units] of MONTHLY_SALES) {
        const total = Math.round(units * factor);
        const picks = 5 + Math.floor(next() * 7);
        const weights = Array.from({ length: picks }, () => 0.4 + next());
        const sum = weights.reduce((a, b) => a + b, 0);
        let left = total;
        weights.forEach((weight, pick) => {
          const quantity = pick === picks - 1 ? left : Math.round((total * weight) / sum);
          left -= quantity;
          if (quantity <= 0) return;
          const basket = baskets[Math.floor(next() * ORDERS_PER_MONTH)];
          basket?.set(code, (basket.get(code) ?? 0) + quantity);
        });
      }
      for (const basket of baskets) {
        if (basket.size === 0) continue;
        const customer = customers[Math.floor(next() * customers.length)];
        const branches = customer?.branches.filter((branch) => branch.active) ?? [];
        const branch = branches[Math.floor(next() * branches.length)];
        if (!customer?.seller || !branch) continue;
        const day = addDays(month, Math.floor(next() * Math.max(1, lastDay)));
        if (day >= addDays(today, -3)) continue;
        await this.pastOrder({
          sellerId: customer.seller.id,
          customerId: customer.id,
          branchId: branch.id,
          city: branch.city ?? customer.city ?? 'Montería',
          day,
          lines: [...basket].map(([code, quantity]) => ({
            productId: products.get(code)?.id ?? '',
            quantity: String(quantity),
          })),
          next,
        });
        count++;
      }
    }
    return count;
  }

  /** One past sale through the whole flow: seller → Diego → planta → logística → contabilidad. */
  private async pastOrder(order: {
    sellerId: string;
    customerId: string;
    branchId: string;
    city: string;
    day: string;
    lines: { productId: string; quantity: string }[];
    next: () => number;
  }): Promise<void> {
    const { day, next } = order;
    const today = todayIso();
    const seller = await this.actors.emailOf(order.sellerId);
    const created = await this.actors.as(seller, async () => {
      const draft = await this.orders.create({
        customerId: order.customerId,
        branchId: order.branchId,
        estimatedDeliveryDate: addDays(day, 3),
        lines: order.lines,
      });
      await this.orders.confirm(draft.id);
      await this.orders.backdate(draft.id, at(day, 9 + next() * 7));
      return draft;
    });
    const [invoice] = await this.actors.as(TEAM.consolidator, () =>
      this.invoices.issue(
        // About a third of the customers ask for a remisión instead of an electronic invoice.
        [{ orderId: created.id, documentType: next() < 0.3 ? 'REM' : 'FEL' }],
        at(addDays(day, 1), 10 + next() * 6),
        {
          historic: true,
        },
      ),
    );
    await this.actors.as(TEAM.plant, () =>
      this.orders.prepare(created.id, undefined, at(addDays(day, 2), 7.5 + next() * 3)),
    );
    await this.actors.as(TEAM.logistics, () =>
      this.orders.completeHistory(created.id, {
        dispatchedAt: at(addDays(day, 2), 13 + next() * 3),
        deliveredAt: at(addDays(day, 3), 9 + next() * 7),
        receivedBy: RECEIVERS[Math.floor(next() * RECEIVERS.length)] ?? 'Cliente',
        route: ROUTES[order.city] ?? 'Ruta Montería',
      }),
    );
    if (!invoice) return;
    const roll = next();
    const paidOn = addDays(day, 1 + 18 + Math.floor(next() * 28));
    if (roll > 0.92 || paidOn >= today) return;
    const total = BigInt(invoice.total);
    const amount = roll > 0.82 ? (total * BigInt(40 + Math.floor(next() * 30))) / 100n : total;
    await this.actors.as(TEAM.accountant, () =>
      this.invoices.recordPayment(
        invoice.id,
        {
          amount: amount.toString(),
          paidOn,
          method: METHODS[Math.floor(next() * METHODS.length)] ?? 'TRANSFER',
          reference: `REF-${String(100_000 + Math.floor(next() * 899_999))}`,
        },
        at(paidOn, 10 + next() * 6),
      ),
    );
  }

  /** Each month: Alfonso orders, Silvia enters the supplier invoices, the accountant pays them. */
  private async seedPurchases(): Promise<number> {
    const today = todayIso();
    const next = random(7_070_707);
    const codes = MONTHLY_PURCHASES.flatMap(([, lines]) => lines.map(([code]) => code));
    const products = new Map((await this.catalog.findByCodes(codes)).map((p) => [p.code, p]));
    let count = 0;
    let documentNumber = 4100;
    for (const [index, factor] of MONTH_FACTORS.entries()) {
      const month = monthStart(today, index - (MONTH_FACTORS.length - 1));
      for (const [supplierName, lines] of MONTHLY_PURCHASES) {
        const orderedOn = addDays(month, 1 + Math.floor(next() * 3));
        if (orderedOn >= today) continue;
        const quantities = lines
          .filter(([code]) => products.has(code))
          .map(([code, units]) => ({
            productId: products.get(code)?.id ?? '',
            quantity: String(Math.max(1, Math.round(units * factor))),
          }));
        const order = await this.actors.as(TEAM.purchasing, async () =>
          this.purchaseOrders.create(
            {
              supplierId: await this.suppliers.idOf(supplierName),
              expectedDate: addDays(orderedOn, 5),
              lines: quantities,
            },
            at(orderedOn, 9 + next() * 4),
          ),
        );
        count++;
        // Plastics arrive in two deliveries, each with its own invoice; the rest in one.
        const deliveries = supplierName.startsWith('Plásticos') ? [0.6, 0.4] : [1];
        let arrival = addDays(orderedOn, 4 + Math.floor(next() * 3));
        for (const share of deliveries) {
          if (arrival >= today) break;
          documentNumber += 1 + Math.floor(next() * 40);
          const invoice = await this.actors.as(TEAM.receiving, () =>
            this.supplierInvoices.register(
              order.id,
              {
                documentNumber: `FE-${String(documentNumber)}`,
                invoiceDate: arrival,
                lines: quantities.map((line) => ({
                  productId: line.productId,
                  quantity: String(Math.max(1, Math.round(Number(line.quantity) * share))),
                })),
              },
              at(arrival, 8 + next() * 8),
              { historic: true },
            ),
          );
          const paidOn = addDays(arrival, 24 + Math.floor(next() * 12));
          if (paidOn < today && next() > 0.08) {
            await this.actors.as(TEAM.accountant, () =>
              this.supplierInvoices.pay(
                invoice.id,
                {
                  amount: invoice.total,
                  paidOn,
                  method: 'TRANSFER',
                  reference: `TRF-${String(500_000 + Math.floor(next() * 499_999))}`,
                },
                at(paidOn, 11 + next() * 5),
              ),
            );
          }
          arrival = addDays(arrival, 6);
        }
      }
    }
    return count;
  }
}
