import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
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
}

export class CreatePurchaseOrderDto {
  @IsString()
  @MaxLength(160)
  supplier!: string;

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

export class ReceivePurchaseOrderDto {
  /** Real quantities; lines left out are received as ordered. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PurchaseLineDto)
  lines?: PurchaseLineDto[];

  /** Supplier invoice or delivery note. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  document?: string;
}

export class ListPurchaseOrdersQuery {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.split(',').filter(Boolean) : value,
  )
  @IsIn(PURCHASE_STATUSES, { each: true })
  status?: PurchaseStatus[];

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? Number(value) : value))
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}
