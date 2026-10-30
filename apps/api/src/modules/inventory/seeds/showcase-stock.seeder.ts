import { Injectable, Logger } from '@nestjs/common';
import { ProductCatalog } from '../../product/index.js';
import { StockService } from '../stock/stock.service.js';

/**
 * DATOS DE EJEMPLO: existencias de las líneas ampliadas. Hay de todo a propósito: producto terminado que
 * cubre pedidos, granel a medio camino e insumos que no alcanzan (butilglicol, alcohol, garrafas,
 * atomizadores, etiquetas de limpiavidrios) para que compras tenga qué pedir.
 */
const SHOWCASE_STOCK: readonly (readonly [code: string, quantity: string, warehouse: string])[] = [
  ['00226', '180', 'DESPACHO'],
  ['00311', '240', 'DESPACHO'],
  ['00410', '420', 'DESPACHO'],
  ['00510', '60', 'DESPACHO'],
  ['00610', '900', 'DESPACHO'],
  ['00810', '350', 'DESPACHO'],
  ['00811', '40', 'DESPACHO'],
  ['01010', '180', 'DESPACHO'],
  ['01011', '140', 'DESPACHO'],
  ['01012', '60', 'DESPACHO'],
  ['01013', '300', 'DESPACHO'],
  ['01014', '260', 'DESPACHO'],
  ['01015', '400', 'DESPACHO'],
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

/** What planta packaged today and hands over to dispatch (same quantities as today's dispatches). */
export const SHOWCASE_HANDOVERS: readonly (readonly [code: string, quantity: string])[] = [
  ['00411', '120'],
  ['00611', '200'],
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

  /** Runs after today's production: moves the packaged goods to the dispatch warehouse. */
  async handOver(): Promise<void> {
    const products = new Map(
      (await this.catalog.findByCodes(SHOWCASE_HANDOVERS.map(([code]) => code))).map((p) => [
        p.code,
        p,
      ]),
    );
    for (const [code, quantity] of SHOWCASE_HANDOVERS) {
      const product = products.get(code);
      // Only what is still in the plant (idempotent on a second run).
      const [status] = await this.stock.status({ search: code });
      const inPlant = status?.byWarehouse.find((w) => w.warehouseCode === 'PLANTA')?.onHand;
      if (!product || !inPlant || Number(inPlant.quantity) <= 0) continue;
      await this.stock.transfer({
        line: { productId: product.id, quantity },
        fromCode: 'PLANTA',
        toCode: 'DESPACHO',
        note: 'Entrega del envasado del día',
      });
    }
  }
}
