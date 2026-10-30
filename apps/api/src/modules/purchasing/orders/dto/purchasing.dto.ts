import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { UNIT_CODES } from '../../../../shared-kernel/index.js';
import { PURCHASE_STATUSES, type PurchaseStatus } from '../../domain/purchase-order.js';

export class PurchaseLineDto {
  @IsUUID()
  productId!: string;

  @Matches(/^\d+(\.\d+)?$/)
  quantity!: string;

  @IsOptional()
  @IsIn(UNIT_CODES)
  unit?: string;

  /** Pesos per stock unit; defaults to the product's purchase cost. */
  @IsOptional()
  @Matches(/^\d{1,13}$/)
  unitCost?: string;
}

export class CreatePurchaseOrderDto {
  @IsUUID()
  supplierId!: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  expectedDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PurchaseLineDto)
  lines!: PurchaseLineDto[];
}

class InvoiceLineDto {
  @IsUUID()
  productId!: string;

  /** What arrived with this invoice, in the product's unit. */
  @Matches(/^\d+(\.\d+)?$/)
  quantity!: string;

  /** Pesos per stock unit billed; defaults to the order's agreed cost. */
  @IsOptional()
  @Matches(/^\d{1,13}$/)
  unitCost?: string;
}

/** A supplier invoice entered by receiving: the support document of the goods that arrived. */
export class SupplierInvoiceDto {
  @IsString()
  @MaxLength(40)
  documentNumber!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  invoiceDate!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineDto)
  lines!: InvoiceLineDto[];
}

export class SupplierPaymentDto {
  @Matches(/^\d{1,13}$/)
  amount!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  paidOn!: string;

  @IsIn(['TRANSFER', 'CASH', 'DEPOSIT', 'CHECK'])
  method!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  reference?: string;
}

export class SupplierInvoicesQuery {
  @IsOptional()
  @IsUUID()
  purchaseOrderId?: string;

  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  open?: boolean;
}

class PlanLineDto {
  @IsUUID()
  productId!: string;

  @Matches(/^\d+(\.\d+)?$/)
  quantity!: string;
}

export class PurchasePlanDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => PlanLineDto)
  lines!: PlanLineDto[];
}

export class ListPurchaseOrdersQuery {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.split(',').filter(Boolean) : value,
  )
  @IsIn(PURCHASE_STATUSES, { each: true })
  status?: PurchaseStatus[];

  /** Only orders with a line of this material. */
  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? Number(value) : value))
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}
