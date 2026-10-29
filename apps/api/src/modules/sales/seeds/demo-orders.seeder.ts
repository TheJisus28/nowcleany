import { Injectable, Logger } from '@nestjs/common';
import { CurrentActor } from '../../../platform/security/current-actor.js';
import { UserDirectory } from '../../identity/index.js';
import { ProductCatalog } from '../../product/index.js';
import { CustomersService } from '../customers/customers.service.js';
import { SalesOrdersRepository } from '../orders/sales-orders.repository.js';
import { SalesOrdersService } from '../orders/sales-orders.service.js';

// DATOS DE EJEMPLO de la propuesta SCIP: tres vendedores preventan 1.200 + 800 + 950 = 2.950 cajas de
// cloro 00224, pero con las materias primas disponibles solo se pueden fabricar 2.000.
const CUSTOMERS = [
  {
    name: 'Supermercados La Economía',
    taxId: '900123456-7',
    city: 'Montería',
    phone: '604 785 1200',
  },
  { name: 'Distribuidora El Sinú', taxId: '900456789-1', city: 'Cereté', phone: '604 774 3300' },
  { name: 'Hotel Casa Grande', taxId: '800987654-3', city: 'Montería', phone: '604 789 4500' },
  { name: 'Colegio San José', taxId: '891080123-5', city: 'Lorica', phone: '604 773 2100' },
] as const;

interface DemoOrder {
  seller: string;
  customer: number;
  inDays: number;
  confirm: boolean;
  lines: readonly (readonly [code: string, quantity: string])[];
}

const ORDERS: readonly DemoOrder[] = [
  {
    seller: 'vendedor.a@nowcleany.local',
    customer: 0,
    inDays: 9,
    confirm: true,
    lines: [['00224', '1200']],
  },
  {
    seller: 'vendedor.b@nowcleany.local',
    customer: 1,
    inDays: 11,
    confirm: true,
    lines: [['00224', '800']],
  },
  {
    seller: 'vendedor.c@nowcleany.local',
    customer: 2,
    inDays: 16,
    confirm: true,
    lines: [['00224', '950']],
  },
  {
    seller: 'vendedor.a@nowcleany.local',
    customer: 3,
    inDays: 5,
    confirm: true,
    lines: [['00225', '300']],
  },
  {
    seller: 'vendedor.c@nowcleany.local',
    customer: 3,
    inDays: 14,
    confirm: true,
    lines: [['00310', '400']],
  },
  {
    seller: 'vendedor.b@nowcleany.local',
    customer: 0,
    inDays: 20,
    confirm: false,
    lines: [['00224', '300']],
  },
];

@Injectable()
export class DemoOrdersSeeder {
  private readonly logger = new Logger('sales');

  constructor(
    private readonly users: UserDirectory,
    private readonly catalog: ProductCatalog,
    private readonly customers: CustomersService,
    private readonly orders: SalesOrdersService,
    private readonly repository: SalesOrdersRepository,
    private readonly currentActor: CurrentActor,
  ) {}

  async seed(): Promise<void> {
    if ((await this.repository.list({ limit: 1 })).length > 0) {
      this.logger.log('Ya hay preventas registradas: no se cargan las de demo');
      return;
    }
    const customerIds: string[] = [];
    for (const customer of CUSTOMERS) customerIds.push((await this.customers.create(customer)).id);

    const sellers = new Map(
      (await this.users.findByEmails(ORDERS.map((order) => order.seller))).map((u) => [u.email, u]),
    );
    const products = new Map(
      (await this.catalog.findByCodes(ORDERS.flatMap((o) => o.lines.map(([code]) => code)))).map(
        (p) => [p.code, p.id],
      ),
    );
    for (const order of ORDERS) {
      const seller = sellers.get(order.seller);
      if (!seller) throw new Error(`Vendedor de demo ${order.seller} no encontrado`);
      // Registered by the seller, so the report attributes it to them.
      await this.currentActor.runAs(
        {
          id: seller.id,
          displayName: seller.fullName,
          permissions: new Set(seller.permissions),
          system: false,
        },
        async () => {
          const created = await this.orders.create({
            customerId: customerIds[order.customer] ?? '',
            estimatedDeliveryDate: inDays(order.inDays),
            lines: order.lines.map(([code, quantity]) => ({
              productId: products.get(code) ?? '',
              quantity,
            })),
          });
          if (order.confirm) await this.orders.confirm(created.id);
        },
      );
    }
    this.logger.log(`Preventas de demo: ${String(ORDERS.length)}`);
  }
}

function inDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}
