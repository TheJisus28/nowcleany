import { Injectable, Logger } from '@nestjs/common';
import { PortfolioLoader, type SeedCustomer } from './portfolio-loader.js';

// DATOS DE EJEMPLO (nombres y documentos inventados) para ver la plataforma con un mes normal de ventas:
// cuatro carteras, sucursales en varios municipios de Córdoba y su historial de visitas.
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

export const SHOWCASE_CUSTOMERS: readonly SeedCustomer[] = [
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

@Injectable()
export class ShowcaseCustomersSeeder {
  private readonly logger = new Logger('sales');

  constructor(private readonly loader: PortfolioLoader) {}

  async seed(): Promise<void> {
    if ((await this.loader.loadCustomers(SHOWCASE_CUSTOMERS)) === 0) return;
    const visits = await this.loader.loadVisitHistory(12);
    this.logger.log(
      `Clientes adicionales: ${String(SHOWCASE_CUSTOMERS.length)} · visitas: ${String(visits)}`,
    );
  }
}
