import { Injectable, Logger } from '@nestjs/common';
import { ProductCatalog } from '../../product/index.js';
import { StockService } from '../stock/stock.service.js';

/**
 * DATOS DE EJEMPLO: existencias de las líneas ampliadas. Hay de todo a propósito: producto terminado que
 * cubre pedidos, granel a medio camino e insumos que no alcanzan (butilglicol, alcohol, garrafas,
 * atomizadores, etiquetas de limpiavidrios) para que compras tenga qué pedir.
 */
const SHOWCASE_STOCK: readonly (readonly [code: string, quantity: string, warehouse: string])[] = [
  ['00226', '180', 'PLANTA'],
  ['00227', '60', 'PLANTA'],
  ['00311', '240', 'PLANTA'],
  ['00410', '420', 'PLANTA'],
  ['00510', '60', 'PLANTA'],
  ['00610', '900', 'PLANTA'],
  ['00810', '350', 'PLANTA'],
  ['00811', '40', 'PLANTA'],
  ['01010', '180', 'PLANTA'],
  ['01011', '140', 'PLANTA'],
  ['01012', '60', 'PLANTA'],
  ['01013', '300', 'PLANTA'],
  ['01014', '260', 'PLANTA'],
  ['01015', '400', 'PLANTA'],
  ['GR-SUAV', '2500', 'PLANTA'],
  ['GR-LAVALOZA', '1800', 'PLANTA'],
  ['GR-DET', '900', 'PLANTA'],
  ['MP-ESTER', '300', 'PLANTA'],
  ['MP-QUAT', '30', 'PLANTA'],
  ['MP-FRAG-SUAV', '80', 'PLANTA'],
  ['MP-BUTIL', '40', 'PLANTA'],
  ['MP-LAURIL', '900', 'PLANTA'],
  ['MP-EDTA', '60', 'PLANTA'],
  ['MP-SAL', '400', 'PLANTA'],
  ['MP-FRAG-LIM', '30', 'PLANTA'],
  ['MP-FRAG-FLOR', '50', 'PLANTA'],
  ['MP-COL-AZUL', '1500', 'PLANTA'],
  ['MP-COL-AMA', '800', 'PLANTA'],
  ['MP-ENV-500', '1500', 'PLANTA'],
  ['MP-GARRAFA', '20', 'PLANTA'],
  ['MP-TAPA-GAR', '60', 'PLANTA'],
  ['MP-TAPA-PUSH', '1200', 'PLANTA'],
  ['MP-ETQ-CLGAL', '500', 'PLANTA'],
  ['MP-ETQ-CL20', '50', 'PLANTA'],
  ['MP-ETQ-LAV1', '800', 'PLANTA'],
  ['MP-ETQ-SOF1', '1000', 'PLANTA'],
  ['MP-ETQ-SOFG', '400', 'PLANTA'],
  ['MP-ETQ-ARE1', '600', 'PLANTA'],
  ['MP-ETQ-AREG', '300', 'PLANTA'],
  ['MP-ETQ-DRO5', '1500', 'PLANTA'],
  ['MP-ETQ-DROG', '300', 'PLANTA'],
  ['MP-ETQ-FAB1', '900', 'PLANTA'],
  ['MP-ETQ-FABG', '300', 'PLANTA'],
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
