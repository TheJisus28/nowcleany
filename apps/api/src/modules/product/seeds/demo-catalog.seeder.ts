import { Injectable, Logger } from '@nestjs/common';
import { CatalogLoader, type SeedFormula, type SeedProduct } from './catalog-loader.js';

// DATOS DE EJEMPLO (ilustrativos): cifras inventadas para la demo, no son fórmulas reales del cliente.
export const DEMO_PRODUCTS: readonly SeedProduct[] = [
  { code: 'MP-HIPO-15', name: 'Hipoclorito de sodio 15 %', type: 'RAW_MATERIAL', unit: 'L' },
  { code: 'MP-AGUA', name: 'Agua tratada', type: 'RAW_MATERIAL', unit: 'L' },
  { code: 'MP-SODA', name: 'Soda cáustica', type: 'RAW_MATERIAL', unit: 'kg' },
  { code: 'MP-ENV-1L', name: 'Envase PET 1 L', type: 'RAW_MATERIAL', unit: 'un' },
  { code: 'MP-ENV-2L', name: 'Envase PET 2 L', type: 'RAW_MATERIAL', unit: 'un' },
  { code: 'MP-TAPA-28', name: 'Tapa rosca 28 mm', type: 'RAW_MATERIAL', unit: 'un' },
  { code: 'MP-ETQ-CL1', name: 'Etiqueta cloro 1 L', type: 'RAW_MATERIAL', unit: 'un' },
  { code: 'MP-ETQ-CL2', name: 'Etiqueta cloro 2 L', type: 'RAW_MATERIAL', unit: 'un' },
  { code: 'MP-CAJA-6', name: 'Caja corrugada x 6', type: 'RAW_MATERIAL', unit: 'un' },
  { code: 'MP-LAS', name: 'Tensoactivo LAS', type: 'RAW_MATERIAL', unit: 'kg' },
  { code: 'MP-FRAG-LAV', name: 'Fragancia lavanda', type: 'RAW_MATERIAL', unit: 'kg' },
  { code: 'MP-COL-VIO', name: 'Colorante violeta', type: 'RAW_MATERIAL', unit: 'g' },
  { code: 'MP-GALON', name: 'Galón plástico 3,785 L', type: 'RAW_MATERIAL', unit: 'un' },
  { code: 'MP-TAPA-38', name: 'Tapa 38 mm', type: 'RAW_MATERIAL', unit: 'un' },
  { code: 'MP-ETQ-LAV', name: 'Etiqueta limpiapisos lavanda', type: 'RAW_MATERIAL', unit: 'un' },
  {
    code: 'GR-CLORO',
    name: 'Cloro 5,25 % granel',
    type: 'BULK',
    unit: 'L',
    batchCapacity: '25000',
  },
  {
    code: 'GR-LIMP-LAV',
    name: 'Limpiapisos lavanda granel',
    type: 'BULK',
    unit: 'L',
    batchCapacity: '10000',
  },
  { code: '00224', name: 'Caja de cloro x 2 L x 6 und', type: 'FINISHED_GOOD', unit: 'un' },
  { code: '00225', name: 'Cloro 5,25 % x 1 L', type: 'FINISHED_GOOD', unit: 'un' },
  { code: '00310', name: 'Limpiapisos lavanda x galón', type: 'FINISHED_GOOD', unit: 'un' },
];

export const DEMO_FORMULAS: readonly SeedFormula[] = [
  {
    product: 'GR-CLORO',
    batchYield: '25000',
    lines: [
      { component: 'MP-HIPO-15', quantity: '8750', wasteBps: 100 },
      { component: 'MP-AGUA', quantity: '16250' },
      { component: 'MP-SODA', quantity: '50' },
    ],
  },
  {
    product: 'GR-LIMP-LAV',
    batchYield: '10000',
    lines: [
      { component: 'MP-AGUA', quantity: '9500' },
      { component: 'MP-LAS', quantity: '350', wasteBps: 50 },
      { component: 'MP-FRAG-LAV', quantity: '40' },
      { component: 'MP-COL-VIO', quantity: '500' },
    ],
  },
  {
    product: '00224',
    batchYield: '1',
    lines: [
      { component: 'GR-CLORO', quantity: '12' },
      { component: 'MP-ENV-2L', quantity: '6', wasteBps: 100 },
      { component: 'MP-TAPA-28', quantity: '6' },
      { component: 'MP-ETQ-CL2', quantity: '6' },
      { component: 'MP-CAJA-6', quantity: '1' },
    ],
  },
  {
    product: '00225',
    batchYield: '1000',
    lines: [
      { component: 'GR-CLORO', quantity: '1000', wasteBps: 50 },
      { component: 'MP-ENV-1L', quantity: '1000', wasteBps: 100 },
      { component: 'MP-TAPA-28', quantity: '1000' },
      { component: 'MP-ETQ-CL1', quantity: '1000' },
    ],
  },
  {
    product: '00310',
    batchYield: '1',
    lines: [
      { component: 'GR-LIMP-LAV', quantity: '3.785' },
      { component: 'MP-GALON', quantity: '1' },
      { component: 'MP-TAPA-38', quantity: '1' },
      { component: 'MP-ETQ-LAV', quantity: '1' },
    ],
  },
];

@Injectable()
export class DemoCatalogSeeder {
  private readonly logger = new Logger('product');

  constructor(private readonly loader: CatalogLoader) {}

  async seed(): Promise<void> {
    await this.loader.load(DEMO_PRODUCTS, DEMO_FORMULAS);
    this.logger.log(`Catálogo de demo listo: ${String(DEMO_PRODUCTS.length)} productos`);
  }
}
