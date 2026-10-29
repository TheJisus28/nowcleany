import { Injectable, Logger } from '@nestjs/common';
import { StockService } from '../stock/stock.service.js';

/**
 * DATOS DE EJEMPLO calibrados para reproducir la propuesta SCIP: con estas existencias se pueden fabricar
 * exactamente 2.000 cajas de cloro 00224 (todas las materias primas alcanzan justo para 2.000).
 */
export const DEMO_STOCK: readonly (readonly [code: string, quantity: string, warehouse: string])[] =
  [
    // Cloro: químicos para 24.000 L de granel (= 2.000 cajas x 12 L) y empaque para 2.000 cajas.
    ['MP-HIPO-15', '8484', 'PLANTA'],
    ['MP-AGUA', '15600', 'PLANTA'],
    ['MP-SODA', '48', 'PLANTA'],
    ['MP-ENV-2L', '12120', 'PLANTA'],
    ['MP-TAPA-28', '12000', 'PLANTA'],
    ['MP-ETQ-CL2', '12000', 'PLANTA'],
    ['MP-CAJA-6', '2000', 'PLANTA'],
    ['MP-ENV-1L', '500', 'PLANTA'],
    ['MP-ETQ-CL1', '500', 'PLANTA'],
    ['00225', '600', 'DESPACHO'],
    // Limpiapisos: el granel alcanza; falta envasar.
    ['GR-LIMP-LAV', '3000', 'PLANTA'],
    ['MP-GALON', '1000', 'PLANTA'],
    ['MP-TAPA-38', '1000', 'PLANTA'],
    ['MP-ETQ-LAV', '1000', 'PLANTA'],
    ['MP-LAS', '200', 'PLANTA'],
    ['MP-FRAG-LAV', '10', 'PLANTA'],
    ['MP-COL-VIO', '2000', 'PLANTA'],
    ['00310', '50', 'DESPACHO'],
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
