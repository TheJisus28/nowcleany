import { Injectable, Logger } from '@nestjs/common';
import { CurrentActor } from '../../../platform/security/current-actor.js';
import { UserDirectory } from '../../identity/index.js';
import { ProductCatalog } from '../../product/index.js';
import { CustomersService } from '../customers/customers.service.js';
import { SalesOrdersService } from '../orders/sales-orders.service.js';

// DATOS DE EJEMPLO (nombres inventados) para ver la plataforma con un mes normal de ventas: preventas
// cubiertas, que esperan producción, con insumos faltantes y atrasadas; borradores, anuladas y despachos.
const CUSTOMERS = [
  {
    name: 'Autoservicio El Ganadero',
    taxId: '901234567-1',
    city: 'Montería',
    phone: '604 781 2233',
  },
  { name: 'Hotel Río Sinú Plaza', taxId: '900765432-8', city: 'Montería', phone: '604 789 1010' },
  {
    name: 'Clínica Santa Lucía del Sinú',
    taxId: '812004567-2',
    city: 'Montería',
    phone: '604 784 5600',
  },
  { name: 'Restaurante La Bonga', taxId: '901112223-4', city: 'Montería', phone: '300 455 1287' },
  {
    name: 'Distribuciones Sahagún Ltda.',
    taxId: '900334455-6',
    city: 'Sahagún',
    phone: '604 777 8899',
  },
  { name: 'Minimercado Doña Carmen', taxId: null, city: 'Cereté', phone: '311 642 7788' },
  {
    name: 'Colegio Bilingüe Alamedas',
    taxId: '812998877-0',
    city: 'Montería',
    phone: '604 786 4400',
  },
  {
    name: 'Lavandería Costa Limpia',
    taxId: '901556677-3',
    city: 'Montería',
    phone: '604 782 3311',
  },
  {
    name: 'Supermercado Mi Pueblo',
    taxId: '900887766-5',
    city: 'Planeta Rica',
    phone: '604 776 1200',
  },
  { name: 'Droguería El Sol', taxId: '901443322-9', city: 'Lorica', phone: '604 773 9090' },
  { name: 'IPS Vida Sana', taxId: '900221100-7', city: 'Tierralta', phone: '604 772 6060' },
  {
    name: 'Conjunto Residencial Mocarí',
    taxId: '901667788-2',
    city: 'Montería',
    phone: '604 785 7070',
  },
  {
    name: 'Comercializadora Chinú Express',
    taxId: '901998811-4',
    city: 'Chinú',
    phone: '604 775 3030',
  },
  {
    name: 'Instituto Técnico del Caribe',
    taxId: '812776655-1',
    city: 'Montelíbano',
    phone: '604 771 4545',
  },
] as const;

type Outcome = 'confirm' | 'draft' | 'dispatch-today' | 'cancel';

interface ShowcaseOrder {
  seller: 'a' | 'b' | 'c' | 'd';
  customer: string;
  /** Days from today to the estimated delivery (negative: already late). */
  inDays: number;
  outcome: Outcome;
  lines: readonly (readonly [code: string, quantity: string])[];
  cancelReason?: string;
}

/** Marks the orders that bodega dispatches today (after planta packages them). */
const DISPATCH_TODAY = 'Despacho programado para hoy.';

const ORDERS: readonly ShowcaseOrder[] = [
  {
    seller: 'd',
    customer: 'Autoservicio El Ganadero',
    inDays: -2,
    outcome: 'confirm',
    lines: [
      ['00410', '240'],
      ['00810', '120'],
    ],
  },
  {
    seller: 'a',
    customer: 'Hotel Río Sinú Plaza',
    inDays: -1,
    outcome: 'confirm',
    lines: [
      ['00226', '150'],
      ['00610', '300'],
    ],
  },
  {
    seller: 'b',
    customer: 'Clínica Santa Lucía del Sinú',
    inDays: 2,
    outcome: 'confirm',
    lines: [
      ['00227', '40'],
      ['00510', '120'],
    ],
  },
  {
    seller: 'c',
    customer: 'Restaurante La Bonga',
    inDays: 3,
    outcome: 'confirm',
    lines: [
      ['00611', '150'],
      ['00810', '100'],
    ],
  },
  {
    seller: 'd',
    customer: 'Distribuciones Sahagún Ltda.',
    inDays: 4,
    outcome: 'confirm',
    lines: [
      ['00811', '200'],
      ['00411', '150'],
      ['00311', '300'],
    ],
  },
  {
    seller: 'a',
    customer: 'Minimercado Doña Carmen',
    inDays: 5,
    outcome: 'confirm',
    lines: [
      ['00610', '200'],
      ['00410', '100'],
    ],
  },
  {
    seller: 'b',
    customer: 'Colegio Bilingüe Alamedas',
    inDays: 6,
    outcome: 'confirm',
    lines: [
      ['00710', '400'],
      ['00311', '200'],
    ],
  },
  {
    seller: 'c',
    customer: 'Lavandería Costa Limpia',
    inDays: 7,
    outcome: 'confirm',
    lines: [
      ['00811', '300'],
      ['00411', '200'],
    ],
  },
  {
    seller: 'd',
    customer: 'Supermercado Mi Pueblo',
    inDays: 8,
    outcome: 'confirm',
    lines: [
      ['00226', '300'],
      ['00610', '400'],
      ['00810', '150'],
    ],
  },
  {
    seller: 'a',
    customer: 'Droguería El Sol',
    inDays: 10,
    outcome: 'confirm',
    lines: [
      ['00510', '200'],
      ['00511', '100'],
    ],
  },
  {
    seller: 'b',
    customer: 'IPS Vida Sana',
    inDays: 12,
    outcome: 'confirm',
    lines: [
      ['00227', '30'],
      ['00226', '100'],
    ],
  },
  {
    seller: 'c',
    customer: 'Conjunto Residencial Mocarí',
    inDays: 14,
    outcome: 'confirm',
    lines: [
      ['00311', '150'],
      ['00710', '100'],
    ],
  },
  {
    seller: 'd',
    customer: 'Comercializadora Chinú Express',
    inDays: 18,
    outcome: 'confirm',
    lines: [
      ['00410', '400'],
      ['00811', '100'],
    ],
  },
  {
    seller: 'a',
    customer: 'Instituto Técnico del Caribe',
    inDays: 21,
    outcome: 'confirm',
    lines: [
      ['00610', '300'],
      ['00611', '100'],
      ['00810', '200'],
    ],
  },
  {
    seller: 'b',
    customer: 'Hotel Casa Grande',
    inDays: 25,
    outcome: 'confirm',
    lines: [
      ['00225', '200'],
      ['00311', '100'],
    ],
  },
  {
    seller: 'c',
    customer: 'Autoservicio El Ganadero',
    inDays: 0,
    outcome: 'dispatch-today',
    lines: [['00411', '120']],
  },
  {
    seller: 'd',
    customer: 'Hotel Río Sinú Plaza',
    inDays: 0,
    outcome: 'dispatch-today',
    lines: [['00611', '200']],
  },
  {
    seller: 'b',
    customer: 'Minimercado Doña Carmen',
    inDays: 0,
    outcome: 'dispatch-today',
    lines: [['00410', '60']],
  },
  {
    seller: 'b',
    customer: 'Comercializadora Chinú Express',
    inDays: 9,
    outcome: 'cancel',
    lines: [['00511', '150']],
    cancelReason: 'El cliente aplazó el pedido para el próximo mes.',
  },
  {
    seller: 'd',
    customer: 'Restaurante La Bonga',
    inDays: 6,
    outcome: 'cancel',
    lines: [['00810', '80']],
    cancelReason: 'Pedido duplicado.',
  },
  {
    seller: 'a',
    customer: 'Clínica Santa Lucía del Sinú',
    inDays: 15,
    outcome: 'draft',
    lines: [
      ['00226', '120'],
      ['00710', '60'],
    ],
  },
  {
    seller: 'c',
    customer: 'Distribuciones Sahagún Ltda.',
    inDays: 20,
    outcome: 'draft',
    lines: [['00811', '250']],
  },
  {
    seller: 'd',
    customer: 'Supermercado Mi Pueblo',
    inDays: 28,
    outcome: 'draft',
    lines: [
      ['00410', '300'],
      ['00610', '300'],
    ],
  },
];

const SELLERS = {
  a: 'vendedor.a@nowcleany.local',
  b: 'vendedor.b@nowcleany.local',
  c: 'vendedor.c@nowcleany.local',
  d: 'vendedor.d@nowcleany.local',
} as const;

@Injectable()
export class ShowcaseOrdersSeeder {
  private readonly logger = new Logger('sales');

  constructor(
    private readonly users: UserDirectory,
    private readonly catalog: ProductCatalog,
    private readonly customers: CustomersService,
    private readonly orders: SalesOrdersService,
    private readonly currentActor: CurrentActor,
  ) {}

  async seed(): Promise<void> {
    const known = new Map((await this.customers.list()).map((c) => [c.name, c.id]));
    if (known.has(CUSTOMERS[0].name)) return;
    for (const customer of CUSTOMERS) {
      const created = await this.customers.create({
        name: customer.name,
        city: customer.city,
        phone: customer.phone,
        ...(customer.taxId ? { taxId: customer.taxId } : {}),
      });
      known.set(created.name, created.id);
    }
    const sellers = new Map(
      (await this.users.findByEmails(Object.values(SELLERS))).map((u) => [u.email, u]),
    );
    const products = new Map(
      (await this.catalog.findByCodes(ORDERS.flatMap((o) => o.lines.map(([code]) => code)))).map(
        (p) => [p.code, p.id],
      ),
    );
    for (const order of ORDERS) {
      const seller = sellers.get(SELLERS[order.seller]);
      const customerId = known.get(order.customer);
      if (!seller || !customerId)
        throw new Error(`Datos de ejemplo incompletos: ${order.customer}`);
      await this.currentActor.runAs(
        {
          id: seller.id,
          displayName: seller.fullName,
          permissions: new Set(seller.permissions),
          system: false,
        },
        async () => {
          const created = await this.orders.create({
            customerId,
            estimatedDeliveryDate: inDays(order.inDays),
            ...(order.outcome === 'dispatch-today' ? { notes: DISPATCH_TODAY } : {}),
            lines: order.lines.map(([code, quantity]) => ({
              productId: products.get(code) ?? '',
              quantity,
            })),
          });
          if (order.outcome === 'draft') return;
          await this.orders.confirm(created.id);
          if (order.outcome === 'cancel')
            await this.orders.cancel(created.id, order.cancelReason ?? 'Anulada');
        },
      );
    }
    this.logger.log(`Preventas adicionales: ${String(ORDERS.length)}`);
  }

  /** Runs after planta packaged and handed over today's goods. */
  async dispatchToday(): Promise<void> {
    const confirmed = await this.orders.list({ statuses: ['CONFIRMED'], limit: 500 });
    for (const order of confirmed.filter((o) => o.notes === DISPATCH_TODAY))
      await this.orders.dispatch(order.id);
  }
}

function inDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}
