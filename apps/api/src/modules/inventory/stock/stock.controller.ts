import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Permission } from '../../../platform/security/decorators.js';
import { ValidationError } from '../../../shared-kernel/index.js';
import {
  AdjustmentDto,
  WasteDto,
  MovementsQuery,
  ReceiptDto,
  StatusQuery,
  TransferDto,
} from './dto/stock.dto.js';
import type { MovementView, StockStatusView, WarehouseView } from './stock-view.js';
import { type OperationResult, StockService } from './stock.service.js';

@ApiTags('inventory')
@ApiBearerAuth()
@Controller('v1/inventory')
export class StockController {
  constructor(private readonly stock: StockService) {}

  @Permission('inventory:read')
  @Get('status')
  status(@Query() query: StatusQuery): Promise<StockStatusView[]> {
    return this.stock.status({
      ...(query.type ? { type: query.type } : {}),
      ...(query.q ? { search: query.q } : {}),
    });
  }

  @Permission('inventory:read')
  @Get('movements')
  movements(@Query() query: MovementsQuery): Promise<MovementView[]> {
    return this.stock.movements({
      limit: query.limit ?? 50,
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.warehouse ? { warehouseCode: query.warehouse } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.from ? { from: new Date(query.from) } : {}),
      ...(query.to ? { to: new Date(query.to) } : {}),
      ...(query.before ? { before: BigInt(query.before) } : {}),
    });
  }

  @Permission('inventory:read')
  @Get('warehouses')
  warehouses(): Promise<WarehouseView[]> {
    return this.stock.warehouses();
  }

  @Permission('inventory:receive')
  @Post('receipts')
  receive(@Body() body: ReceiptDto): Promise<OperationResult> {
    return this.stock.receive({
      ...(body.warehouse ? { warehouseCode: body.warehouse } : {}),
      lines: body.lines,
      ...(body.document
        ? { reference: { type: 'supplier_document', id: body.document, label: body.document } }
        : {}),
      ...(body.note ? { note: body.note } : {}),
    });
  }

  @Permission('inventory:transfer')
  @Post('transfers')
  transfer(@Body() body: TransferDto): Promise<OperationResult> {
    return this.stock.transfer({
      line: {
        productId: body.productId,
        quantity: body.quantity,
        ...(body.unit ? { unit: body.unit } : {}),
      },
      ...(body.from ? { fromCode: body.from } : {}),
      ...(body.to ? { toCode: body.to } : {}),
      ...(body.note ? { note: body.note } : {}),
    });
  }

  /** Restricted and audited: the reason and the actor stay in the kardex. */
  @Permission('inventory:adjust')
  @Post('adjustments')
  adjust(@Body() body: AdjustmentDto): Promise<OperationResult> {
    return this.stock.adjust({
      line: {
        productId: body.productId,
        quantity: body.countedQuantity,
        ...(body.unit ? { unit: body.unit } : {}),
      },
      warehouseCode: body.warehouse,
      reason: body.reason,
    });
  }

  /** What is lost: bulk left in a tank, a damaged product. It leaves the stock with a WASTE movement. */
  @Permission('inventory:waste')
  @Post('waste')
  waste(@Body() body: WasteDto): Promise<OperationResult> {
    return this.stock.waste({
      line: {
        productId: body.productId,
        quantity: body.quantity,
        ...(body.unit ? { unit: body.unit } : {}),
      },
      ...(body.warehouse ? { warehouseCode: body.warehouse } : {}),
      ...(body.note ? { note: body.note } : {}),
    });
  }

  /** text/csv with columns codigo; cantidad; [bodega]. */
  @Permission('inventory:initial-load')
  @ApiConsumes('text/csv')
  @Post('initial-load')
  initialLoad(@Body() csv: unknown): Promise<{ rows: number; movements: number }> {
    if (typeof csv !== 'string') {
      throw new ValidationError('inventory.load_format', 'Envía el archivo como text/csv.');
    }
    return this.stock.initialLoad(csv);
  }
}
