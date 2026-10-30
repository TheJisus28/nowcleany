import { Injectable, Logger } from '@nestjs/common';
import { PortfolioLoader, type SeedCustomer } from './portfolio-loader.js';

// DATOS DE EJEMPLO de la propuesta SCIP: los clientes de los tres vendedores que preventan 1.200 + 800 +
// 950 = 2.950 cajas de cloro 00224 (las preventas las carga el módulo demo).
export const DEMO_CUSTOMERS: readonly SeedCustomer[] = [
  {
    seller: 'a',
    documentType: 'NIT',
    documentNumber: '900123456-7',
    name: 'Supermercados La Economía S.A.S.',
    phone: '604 785 1200',
    branches: [
      {
        name: 'Principal',
        address: 'Calle 41 # 6-20, Centro',
        city: 'Montería',
        latitude: 8.7608,
        longitude: -75.8822,
      },
      {
        name: 'La Castellana',
        address: 'Carrera 6 # 61-15, La Castellana',
        city: 'Montería',
        latitude: 8.7768,
        longitude: -75.8741,
      },
      {
        name: 'Mocarí',
        address: 'Calle 70 # 2-35, Mocarí',
        city: 'Montería',
        latitude: 8.7889,
        longitude: -75.8607,
      },
    ],
  },
  {
    seller: 'b',
    documentType: 'NIT',
    documentNumber: '900456789-1',
    name: 'Distribuidora El Sinú Ltda.',
    phone: '604 774 3300',
    branches: [
      {
        name: 'Principal',
        address: 'Carrera 12 # 14-30',
        city: 'Cereté',
        latitude: 8.8851,
        longitude: -75.7905,
      },
    ],
  },
  {
    seller: 'c',
    documentType: 'NIT',
    documentNumber: '800987654-3',
    name: 'Hotel Casa Grande S.A.',
    phone: '604 789 4500',
    branches: [
      {
        name: 'Principal',
        address: 'Calle 29 # 1-50, Ronda del Sinú',
        city: 'Montería',
        latitude: 8.7531,
        longitude: -75.8869,
      },
    ],
  },
  {
    seller: 'a',
    documentType: 'NIT',
    documentNumber: '891080123-5',
    name: 'Colegio San José de Lorica',
    phone: '604 773 2100',
    branches: [
      {
        name: 'Principal',
        address: 'Calle 3 # 18-40',
        city: 'Lorica',
        latitude: 9.2369,
        longitude: -75.8132,
      },
    ],
  },
];

@Injectable()
export class DemoCustomersSeeder {
  private readonly logger = new Logger('sales');

  constructor(private readonly loader: PortfolioLoader) {}

  async seed(): Promise<void> {
    const created = await this.loader.loadCustomers(DEMO_CUSTOMERS);
    this.logger.log(`Clientes de demo: ${String(created)}`);
  }
}
