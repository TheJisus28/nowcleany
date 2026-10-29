import { Injectable, Logger } from '@nestjs/common';
import { SalesOrdersService } from '../orders/sales-orders.service.js';
import { type SeedCustomer, type SeedOrder, PortfolioLoader } from './portfolio-loader.js';

// DATOS DE EJEMPLO (nombres y documentos inventados) para ver la plataforma con un mes normal de ventas:
// cuatro carteras, sucursales en varios municipios de Córdoba, preventas en todos los estados y visitas.
const branch = (
  name: string,
  address: string,
  city: string,
  latitude: number,
  longitude: number,
) => ({
  name,
  address,
  city,
  latitude,
  longitude,
});

const CUSTOMERS: readonly SeedCustomer[] = [
  {
    seller: 'd',
    documentType: 'NIT',
    documentNumber: '901234567-1',
    name: 'Autoservicio El Ganadero S.A.S.',
    phone: '604 781 2233',
    branches: [
      branch('Principal', 'Carrera 2 # 22-14, Centro', 'Montería', 8.7495, -75.8838),
      branch('Barrio Granada', 'Calle 51 # 14-20, Granada', 'Montería', 8.7449, -75.8678),
    ],
  },
  {
    seller: 'a',
    documentType: 'NIT',
    documentNumber: '900765432-8',
    name: 'Hotel Río Sinú Plaza S.A.S.',
    phone: '604 789 1010',
    branches: [branch('Principal', 'Avenida Primera # 37-05', 'Montería', 8.7579, -75.8858)],
  },
  {
    seller: 'b',
    documentType: 'NIT',
    documentNumber: '812004567-2',
    name: 'Clínica Santa Lucía del Sinú S.A.',
    phone: '604 784 5600',
    branches: [
      branch('Principal', 'Calle 22 # 9-35', 'Montería', 8.7462, -75.8781),
      branch('Sede Norte', 'Carrera 6 # 72-40', 'Montería', 8.7874, -75.8705),
    ],
  },
  {
    seller: 'c',
    documentType: 'NIT',
    documentNumber: '901112223-4',
    name: 'Restaurante La Bonga S.A.S.',
    phone: '300 455 1287',
    branches: [
      branch('Principal', 'Calle 27 # 2-10, Ronda del Sinú', 'Montería', 8.7517, -75.8873),
    ],
  },
  {
    seller: 'd',
    documentType: 'NIT',
    documentNumber: '900334455-6',
    name: 'Distribuciones Sahagún Ltda.',
    phone: '604 777 8899',
    branches: [branch('Principal', 'Calle 15 # 10-22', 'Sahagún', 8.9458, -75.4431)],
  },
  {
    seller: 'a',
    documentType: 'CC',
    documentNumber: '50912345',
    name: 'Carmen Elena Pérez Doria',
    phone: '311 642 7788',
    branches: [branch('Minimercado Doña Carmen', 'Carrera 9 # 11-18', 'Cereté', 8.8838, -75.7934)],
  },
  {
    seller: 'b',
    documentType: 'NIT',
    documentNumber: '812998877-0',
    name: 'Colegio Bilingüe Alamedas',
    phone: '604 786 4400',
    branches: [
      branch('Principal', 'Carrera 10 # 60-45, Alamedas del Sinú', 'Montería', 8.7712, -75.8592),
    ],
  },
  {
    seller: 'c',
    documentType: 'NIT',
    documentNumber: '901556677-3',
    name: 'Lavandería Costa Limpia S.A.S.',
    phone: '604 782 3311',
    branches: [branch('Principal', 'Calle 44 # 15-60', 'Montería', 8.7598, -75.8701)],
  },
  {
    seller: 'd',
    documentType: 'NIT',
    documentNumber: '900887766-5',
    name: 'Supermercado Mi Pueblo S.A.S.',
    phone: '604 776 1200',
    branches: [
      branch('Principal', 'Carrera 8 # 17-30', 'Planeta Rica', 8.4106, -75.5848),
      branch('Montelíbano', 'Calle 18 # 5-12', 'Montelíbano', 7.9794, -75.4176),
    ],
  },
  {
    seller: 'a',
    documentType: 'CC',
    documentNumber: '78034567',
    name: 'Luis Alberto Sol Martínez',
    phone: '604 773 9090',
    branches: [branch('Droguería El Sol', 'Calle 5 # 14-08', 'Lorica', 9.2381, -75.8151)],
  },
  {
    seller: 'b',
    documentType: 'NIT',
    documentNumber: '900221100-7',
    name: 'IPS Vida Sana S.A.S.',
    phone: '604 772 6060',
    branches: [branch('Principal', 'Carrera 14 # 4-25', 'Tierralta', 8.1741, -76.0592)],
  },
  {
    seller: 'c',
    documentType: 'NIT',
    documentNumber: '901667788-2',
    name: 'Conjunto Residencial Mocarí',
    phone: '604 785 7070',
    branches: [branch('Principal', 'Calle 74 # 1-90, Mocarí', 'Montería', 8.7921, -75.8573)],
  },
  {
    seller: 'd',
    documentType: 'NIT',
    documentNumber: '901998811-4',
    name: 'Comercializadora Chinú Express S.A.S.',
    phone: '604 775 3030',
    branches: [branch('Principal', 'Carrera 7 # 9-40', 'Chinú', 9.1049, -75.3991)],
  },
  {
    seller: 'a',
    documentType: 'NIT',
    documentNumber: '812776655-1',
    name: 'Instituto Técnico del Caribe',
    phone: '604 771 4545',
    branches: [branch('Principal', 'Calle 12 # 8-60', 'Montelíbano', 7.9821, -75.4203)],
  },
];

/** Marks the orders bodega dispatches today (after planta packages them). */
const DISPATCH_TODAY = 'Despacho programado para hoy.';

const ORDERS: readonly SeedOrder[] = [
  {
    customer: '901234567-1',
    inDays: -2,
    outcome: 'confirm',
    lines: [
      ['00410', '240'],
      ['00810', '120'],
    ],
  },
  {
    customer: '900765432-8',
    inDays: -1,
    outcome: 'confirm',
    lines: [
      ['00226', '150'],
      ['00610', '300'],
    ],
  },
  {
    customer: '812004567-2',
    inDays: 2,
    outcome: 'confirm',
    lines: [
      ['00227', '40'],
      ['00510', '120'],
    ],
  },
  {
    customer: '901112223-4',
    inDays: 3,
    outcome: 'confirm',
    lines: [
      ['00611', '150'],
      ['00810', '100'],
    ],
  },
  {
    customer: '900334455-6',
    inDays: 4,
    outcome: 'confirm',
    lines: [
      ['00811', '200'],
      ['00411', '150'],
      ['00311', '300'],
    ],
  },
  {
    customer: '50912345',
    inDays: 5,
    outcome: 'confirm',
    lines: [
      ['00610', '200'],
      ['00410', '100'],
    ],
  },
  {
    customer: '812998877-0',
    inDays: 6,
    outcome: 'confirm',
    lines: [
      ['00710', '400'],
      ['00311', '200'],
    ],
  },
  {
    customer: '901556677-3',
    inDays: 7,
    outcome: 'confirm',
    lines: [
      ['00811', '300'],
      ['00411', '200'],
    ],
  },
  {
    customer: '900887766-5',
    inDays: 8,
    outcome: 'confirm',
    lines: [
      ['00226', '300'],
      ['00610', '400'],
      ['00810', '150'],
    ],
  },
  {
    customer: '78034567',
    inDays: 10,
    outcome: 'confirm',
    lines: [
      ['00510', '200'],
      ['00511', '100'],
    ],
  },
  {
    customer: '900221100-7',
    inDays: 12,
    outcome: 'confirm',
    lines: [
      ['00227', '30'],
      ['00226', '100'],
    ],
  },
  {
    customer: '901667788-2',
    inDays: 14,
    outcome: 'confirm',
    lines: [
      ['00311', '150'],
      ['00710', '100'],
    ],
  },
  {
    customer: '901998811-4',
    inDays: 18,
    outcome: 'confirm',
    lines: [
      ['00410', '400'],
      ['00811', '100'],
    ],
  },
  {
    customer: '812776655-1',
    inDays: 21,
    outcome: 'confirm',
    lines: [
      ['00610', '300'],
      ['00611', '100'],
      ['00810', '200'],
    ],
  },
  {
    customer: '800987654-3',
    inDays: 25,
    outcome: 'confirm',
    lines: [
      ['00225', '200'],
      ['00311', '100'],
    ],
  },
  {
    customer: '901234567-1',
    branch: 'Barrio Granada',
    inDays: 0,
    outcome: 'dispatch-today',
    lines: [['00411', '120']],
  },
  {
    customer: '900887766-5',
    branch: 'Montelíbano',
    inDays: 0,
    outcome: 'dispatch-today',
    lines: [['00611', '200']],
  },
  { customer: '812998877-0', inDays: 0, outcome: 'dispatch-today', lines: [['00410', '60']] },
  {
    customer: '901998811-4',
    inDays: 9,
    outcome: 'cancel',
    lines: [['00511', '150']],
    cancelReason: 'El cliente aplazó el pedido para el próximo mes.',
  },
  {
    customer: '901112223-4',
    inDays: 6,
    outcome: 'cancel',
    lines: [['00810', '80']],
    cancelReason: 'Pedido duplicado.',
  },
  {
    customer: '812004567-2',
    branch: 'Sede Norte',
    inDays: 15,
    outcome: 'draft',
    lines: [
      ['00226', '120'],
      ['00710', '60'],
    ],
  },
  { customer: '900334455-6', inDays: 20, outcome: 'draft', lines: [['00811', '250']] },
  {
    customer: '900887766-5',
    inDays: 28,
    outcome: 'draft',
    lines: [
      ['00410', '300'],
      ['00610', '300'],
    ],
  },
];

@Injectable()
export class ShowcaseOrdersSeeder {
  private readonly logger = new Logger('sales');

  constructor(
    private readonly loader: PortfolioLoader,
    private readonly orders: SalesOrdersService,
  ) {}

  async seed(): Promise<void> {
    if ((await this.loader.loadCustomers(CUSTOMERS)) === 0) return;
    await this.loader.loadOrders(ORDERS, DISPATCH_TODAY);
    const visits = await this.loader.loadVisitHistory(12);
    this.logger.log(`Preventas adicionales: ${String(ORDERS.length)} · visitas: ${String(visits)}`);
  }

  /** Runs after planta packaged and handed over today's goods. */
  async dispatchToday(): Promise<void> {
    const confirmed = await this.orders.list({ statuses: ['CONFIRMED'], limit: 500 });
    for (const order of confirmed.filter((o) => o.notes === DISPATCH_TODAY))
      await this.orders.dispatch(order.id);
  }
}
