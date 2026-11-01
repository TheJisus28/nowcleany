import { Injectable, Logger } from '@nestjs/common';
import { StockService } from '../stock/stock.service.js';

/**
 * DATOS DE EJEMPLO calibrados para reproducir la propuesta SCIP: con estas existencias se pueden fabricar
 * exactamente 2.000 cajas de cloro 00224 (todas las materias primas alcanzan justo para 2.000).
 */
export const DEMO_STOCK: readonly (readonly [code: string, quantity: string, warehouse: string])[] =
  [
    // Cloro: químicos para 24.000 L de granel (= 2.000 cajas x 12 L) y empaque para 2.000 cajas.
    ['MP-HIPO-15', '8484', 'B1'],
    ['MP-AGUA', '15600', 'B1'],
    ['MP-SODA', '48', 'B1'],
    ['MP-ENV-2L', '12120', 'B1'],
    ['MP-TAPA-28', '12000', 'B1'],
    ['MP-ETQ-CL2', '12000', 'B1'],
    ['MP-CAJA-6', '2000', 'B1'],
    ['MP-ENV-1L', '500', 'B1'],
    ['MP-ETQ-CL1', '500', 'B1'],
    ['00225', '600', 'B1'],
    // Limpiapisos: el granel alcanza; falta envasar.
    ['GR-LIMP-LAV', '3000', 'B1'],
    ['MP-GALON', '1000', 'B1'],
    ['MP-TAPA-38', '1000', 'B1'],
    ['MP-ETQ-LAV', '1000', 'B1'],
    ['MP-LAS', '200', 'B1'],
    ['MP-FRAG-LAV', '10', 'B1'],
    ['MP-COL-VIO', '2000', 'B1'],
    ['00310', '50', 'B1'],
  ];

@Injectable()
export class DemoStockSeeder {
  private readonly logger = new Logger('inventory');

  constructor(private readonly stock: StockService) {}

  async seed(): Promise<void> {
    if ((await this.stock.levels()).length > 0) {
      this.logger.log('Ya hay existencias registradas: no se carga el inventario de demo');
      return;
    }
    const csv = ['codigo;cantidad;bodega', ...DEMO_STOCK.map((row) => row.join(';'))].join('\n');
    const result = await this.stock.initialLoad(csv);
    this.logger.log(`Inventario de demo cargado: ${String(result.movements)} productos`);
  }
}
