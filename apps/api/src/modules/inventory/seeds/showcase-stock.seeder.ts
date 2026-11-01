import { Injectable, Logger } from '@nestjs/common';
import { ProductCatalog } from '../../product/index.js';
import { StockService } from '../stock/stock.service.js';

/**
 * DATOS DE EJEMPLO: existencias de las líneas ampliadas. Hay de todo a propósito: producto terminado que
 * cubre pedidos, granel a medio camino e insumos que no alcanzan (butilglicol, alcohol, garrafas,
 * atomizadores, etiquetas de limpiavidrios) para que compras tenga qué pedir.
 */
const SHOWCASE_STOCK: readonly (readonly [code: string, quantity: string, warehouse: string])[] = [
  ['00226', '180', 'B1'],
  ['00227', '60', 'B1'],
  ['00311', '240', 'B1'],
  ['00410', '420', 'B1'],
  ['00510', '60', 'B1'],
  ['00610', '900', 'B1'],
  ['00810', '350', 'B1'],
  ['00811', '40', 'B1'],
  ['01010', '180', 'B1'],
  ['01011', '140', 'B1'],
  ['01012', '60', 'B1'],
  ['01013', '300', 'B1'],
  ['01014', '260', 'B1'],
  ['01015', '400', 'B1'],
  ['GR-SUAV', '2500', 'B1'],
  ['GR-LAVALOZA', '1800', 'B1'],
  ['GR-DET', '900', 'B1'],
  ['MP-ESTER', '300', 'B1'],
  ['MP-QUAT', '30', 'B1'],
  ['MP-FRAG-SUAV', '80', 'B1'],
  ['MP-BUTIL', '40', 'B1'],
  ['MP-LAURIL', '900', 'B1'],
  ['MP-EDTA', '60', 'B1'],
  ['MP-SAL', '400', 'B1'],
  ['MP-FRAG-LIM', '30', 'B1'],
  ['MP-FRAG-FLOR', '50', 'B1'],
  ['MP-COL-AZUL', '1500', 'B1'],
  ['MP-COL-AMA', '800', 'B1'],
  ['MP-ENV-500', '1500', 'B1'],
  ['MP-GARRAFA', '20', 'B1'],
  ['MP-TAPA-GAR', '60', 'B1'],
  ['MP-TAPA-PUSH', '1200', 'B1'],
  ['MP-ETQ-CLGAL', '500', 'B1'],
  ['MP-ETQ-CL20', '50', 'B1'],
  ['MP-ETQ-LAV1', '800', 'B1'],
  ['MP-ETQ-SOF1', '1000', 'B1'],
  ['MP-ETQ-SOFG', '400', 'B1'],
  ['MP-ETQ-ARE1', '600', 'B1'],
  ['MP-ETQ-AREG', '300', 'B1'],
  ['MP-ETQ-DRO5', '1500', 'B1'],
  ['MP-ETQ-DROG', '300', 'B1'],
  ['MP-ETQ-FAB1', '900', 'B1'],
  ['MP-ETQ-FABG', '300', 'B1'],
  // The second warehouse also keeps products and raw materials.
  ['00610', '300', 'B2'],
  ['01014', '120', 'B2'],
  ['MP-ENV-500', '800', 'B2'],
  ['MP-LAURIL', '300', 'B2'],
];

@Injectable()
export class ShowcaseStockSeeder {
  private readonly logger = new Logger('inventory');

  constructor(
    private readonly stock: StockService,
    private readonly catalog: ProductCatalog,
  ) {}

  async seed(): Promise<void> {
    const [marker] = await this.catalog.findByCodes(['MP-ESTER']);
    const loaded = (await this.stock.levels()).some((level) => level.productId === marker?.id);
    if (loaded) return;
    const csv = ['codigo;cantidad;bodega', ...SHOWCASE_STOCK.map((row) => row.join(';'))].join(
      '\n',
    );
    const result = await this.stock.initialLoad(csv);
    this.logger.log(`Inventario ampliado: ${String(result.movements)} saldos`);
  }
}
