import { Injectable, Logger } from '@nestjs/common';
import { CatalogLoader, type SeedFormula, type SeedProduct } from './catalog-loader.js';

// DATOS DE EJEMPLO (ilustrativos) para ver la plataforma con volumen: las líneas de producto de
// nowcleany.co (suavizante, desengrasante, lavaloza, limpiavidrios, detergente) con fórmulas inventadas.
const raw = (code: string, name: string, unit: string): SeedProduct => ({
  code,
  name,
  type: 'RAW_MATERIAL',
  unit,
});
const bulk = (code: string, name: string, batchCapacity: string): SeedProduct => ({
  code,
  name,
  type: 'BULK',
  unit: 'L',
  batchCapacity,
});
/** Bought from suppliers and sold as is: brooms, dustpans, mops, gloves… */
const resale = (code: string, name: string): SeedProduct => ({
  code,
  name,
  type: 'RESALE',
  unit: 'un',
});
const finished = (code: string, name: string): SeedProduct => ({
  code,
  name,
  type: 'FINISHED_GOOD',
  unit: 'un',
});

export const SHOWCASE_PRODUCTS: readonly SeedProduct[] = [
  raw('MP-ESTER', 'Esterquat (base suavizante)', 'kg'),
  raw('MP-QUAT', 'Cloruro de benzalconio 50 %', 'kg'),
  raw('MP-FRAG-SUAV', 'Fragancia suavizante', 'kg'),
  raw('MP-BUTIL', 'Butilglicol', 'kg'),
  raw('MP-LAURIL', 'Lauril éter sulfato de sodio', 'kg'),
  raw('MP-EDTA', 'EDTA tetrasódico', 'kg'),
  raw('MP-SAL', 'Sal industrial', 'kg'),
  raw('MP-FRAG-LIM', 'Fragancia limón', 'kg'),
  raw('MP-FRAG-FLOR', 'Fragancia floral', 'kg'),
  raw('MP-COL-AZUL', 'Colorante azul', 'g'),
  raw('MP-COL-AMA', 'Colorante amarillo', 'g'),
  raw('MP-ALCOHOL', 'Alcohol isopropílico', 'L'),
  raw('MP-ENV-500', 'Envase PET 500 mL', 'un'),
  raw('MP-GARRAFA', 'Garrafa 20 L', 'un'),
  raw('MP-TAPA-GAR', 'Tapa garrafa 20 L', 'un'),
  raw('MP-TAPA-PUSH', 'Tapa push-pull 24 mm', 'un'),
  raw('MP-ATOMIZ', 'Atomizador 24 mm', 'un'),
  raw('MP-ETQ-CLGAL', 'Etiqueta cloro galón', 'un'),
  raw('MP-ETQ-CL20', 'Etiqueta cloro garrafa 20 L', 'un'),
  raw('MP-ETQ-LAV1', 'Etiqueta limpiapisos lavanda 1 L', 'un'),
  raw('MP-ETQ-SOF1', 'Etiqueta Soflin 1 L', 'un'),
  raw('MP-ETQ-SOFG', 'Etiqueta Soflin galón', 'un'),
  raw('MP-ETQ-ARE1', 'Etiqueta Arenso 1 L', 'un'),
  raw('MP-ETQ-AREG', 'Etiqueta Arenso galón', 'un'),
  raw('MP-ETQ-DRO5', 'Etiqueta Drop lemon 500 mL', 'un'),
  raw('MP-ETQ-DROG', 'Etiqueta Drop lemon galón', 'un'),
  raw('MP-ETQ-VID', 'Etiqueta limpiavidrios 500 mL', 'un'),
  raw('MP-ETQ-FAB1', 'Etiqueta Fabulav 1 L', 'un'),
  raw('MP-ETQ-FABG', 'Etiqueta Fabulav galón', 'un'),
  bulk('GR-SUAV', 'Suavizante Soflin granel', '10000'),
  bulk('GR-DESENG', 'Desengrasante Arenso granel', '5000'),
  bulk('GR-LAVALOZA', 'Lavaloza Drop lemon granel', '5000'),
  bulk('GR-VIDRIOS', 'Limpiavidrios granel', '2000'),
  bulk('GR-DET', 'Detergente líquido Fabulav granel', '8000'),
  finished('00226', 'Cloro 5,25 % x galón'),
  finished('00227', 'Cloro 5,25 % garrafa x 20 L'),
  finished('00311', 'Limpiapisos lavanda x 1 L'),
  finished('00410', 'Soflin suavizante x 1 L'),
  finished('00411', 'Soflin suavizante x galón'),
  finished('00510', 'Arenso desengrasante x 1 L'),
  finished('00511', 'Arenso desengrasante x galón'),
  finished('00610', 'Drop lemon lavaloza x 500 mL'),
  finished('00611', 'Drop lemon lavaloza x galón'),
  finished('00710', 'Limpiavidrios x 500 mL con atomizador'),
  finished('00810', 'Fabulav detergente líquido x 1 L'),
  finished('00811', 'Fabulav detergente líquido x galón'),
  resale('01010', 'Escoba plástica cerdas suaves'),
  resale('01011', 'Recogedor con mango largo'),
  resale('01012', 'Trapero de algodón x 500 g'),
  resale('01013', 'Guantes de caucho talla M (par)'),
  resale('01014', 'Esponja doble uso x 3'),
  resale('01015', 'Bolsas de basura negras x 10'),
];

/** One finished good: liters of bulk per unit plus its container, cap and label. */
const pack = (
  product: string,
  bulkCode: string,
  liters: string,
  container: string,
  cap: string,
  label: string,
): SeedFormula => ({
  product,
  batchYield: '1',
  lines: [
    { component: bulkCode, quantity: liters },
    { component: container, quantity: '1' },
    { component: cap, quantity: '1' },
    { component: label, quantity: '1' },
  ],
});

export const SHOWCASE_FORMULAS: readonly SeedFormula[] = [
  {
    product: 'GR-SUAV',
    batchYield: '10000',
    lines: [
      { component: 'MP-AGUA', quantity: '9300' },
      { component: 'MP-ESTER', quantity: '450' },
      { component: 'MP-FRAG-SUAV', quantity: '60' },
      { component: 'MP-QUAT', quantity: '40' },
      { component: 'MP-COL-AZUL', quantity: '300' },
    ],
  },
  {
    product: 'GR-DESENG',
    batchYield: '5000',
    lines: [
      { component: 'MP-AGUA', quantity: '4300' },
      { component: 'MP-BUTIL', quantity: '250' },
      { component: 'MP-LAURIL', quantity: '200' },
      { component: 'MP-SODA', quantity: '25' },
      { component: 'MP-EDTA', quantity: '25' },
    ],
  },
  {
    product: 'GR-LAVALOZA',
    batchYield: '5000',
    lines: [
      { component: 'MP-AGUA', quantity: '3900' },
      { component: 'MP-LAURIL', quantity: '600' },
      { component: 'MP-LAS', quantity: '250' },
      { component: 'MP-SAL', quantity: '100' },
      { component: 'MP-FRAG-LIM', quantity: '25' },
      { component: 'MP-COL-AMA', quantity: '250' },
    ],
  },
  {
    product: 'GR-VIDRIOS',
    batchYield: '2000',
    lines: [
      { component: 'MP-AGUA', quantity: '1800' },
      { component: 'MP-ALCOHOL', quantity: '180' },
      { component: 'MP-BUTIL', quantity: '20' },
      { component: 'MP-COL-AZUL', quantity: '40' },
    ],
  },
  {
    product: 'GR-DET',
    batchYield: '8000',
    lines: [
      { component: 'MP-AGUA', quantity: '6600' },
      { component: 'MP-LAS', quantity: '600' },
      { component: 'MP-LAURIL', quantity: '400' },
      { component: 'MP-SAL', quantity: '120' },
      { component: 'MP-EDTA', quantity: '20' },
      { component: 'MP-FRAG-FLOR', quantity: '40' },
    ],
  },
  pack('00226', 'GR-CLORO', '3.785', 'MP-GALON', 'MP-TAPA-38', 'MP-ETQ-CLGAL'),
  pack('00227', 'GR-CLORO', '20', 'MP-GARRAFA', 'MP-TAPA-GAR', 'MP-ETQ-CL20'),
  pack('00311', 'GR-LIMP-LAV', '1', 'MP-ENV-1L', 'MP-TAPA-28', 'MP-ETQ-LAV1'),
  pack('00410', 'GR-SUAV', '1', 'MP-ENV-1L', 'MP-TAPA-28', 'MP-ETQ-SOF1'),
  pack('00411', 'GR-SUAV', '3.785', 'MP-GALON', 'MP-TAPA-38', 'MP-ETQ-SOFG'),
  pack('00510', 'GR-DESENG', '1', 'MP-ENV-1L', 'MP-TAPA-28', 'MP-ETQ-ARE1'),
  pack('00511', 'GR-DESENG', '3.785', 'MP-GALON', 'MP-TAPA-38', 'MP-ETQ-AREG'),
  pack('00610', 'GR-LAVALOZA', '0.5', 'MP-ENV-500', 'MP-TAPA-PUSH', 'MP-ETQ-DRO5'),
  pack('00611', 'GR-LAVALOZA', '3.785', 'MP-GALON', 'MP-TAPA-38', 'MP-ETQ-DROG'),
  pack('00710', 'GR-VIDRIOS', '0.5', 'MP-ENV-500', 'MP-ATOMIZ', 'MP-ETQ-VID'),
  pack('00810', 'GR-DET', '1', 'MP-ENV-1L', 'MP-TAPA-28', 'MP-ETQ-FAB1'),
  pack('00811', 'GR-DET', '3.785', 'MP-GALON', 'MP-TAPA-38', 'MP-ETQ-FABG'),
];

@Injectable()
export class ShowcaseCatalogSeeder {
  private readonly logger = new Logger('product');

  constructor(private readonly loader: CatalogLoader) {}

  async seed(): Promise<void> {
    await this.loader.load(SHOWCASE_PRODUCTS, SHOWCASE_FORMULAS);
    this.logger.log(`Catálogo ampliado: ${String(SHOWCASE_PRODUCTS.length)} productos más`);
  }
}
