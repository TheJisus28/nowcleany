import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
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
import { PRODUCT_TYPE_LABELS, type ProductType } from '../../../product/index.js';
import { MOVEMENT_TYPES, type MovementType } from '../../domain/stock.js';

const DECIMAL = /^\d+(\.\d+)?$/;
const PRODUCT_TYPES = Object.keys(PRODUCT_TYPE_LABELS);

export class QuantityLineDto {
  @IsUUID()
  productId!: string;

  @Matches(DECIMAL)
  quantity!: string;

  @IsOptional()
  @IsIn(UNIT_CODES)
  unit?: string;
}

export class ReceiptDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  warehouse?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => QuantityLineDto)
  lines!: QuantityLineDto[];

  /** Supplier document (invoice, remission). */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  document?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class TransferDto extends QuantityLineDto {
  @IsString()
  @MaxLength(20)
  from!: string;

  @IsString()
  @MaxLength(20)
  to!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class AdjustmentDto {
  @IsUUID()
  productId!: string;

  @IsString()
  @MaxLength(20)
  warehouse!: string;

  /** Physically counted quantity: the balance is set to it. */
  @Matches(DECIMAL)
  countedQuantity!: string;

  @IsOptional()
  @IsIn(UNIT_CODES)
  unit?: string;

  @IsString()
  @MaxLength(300)
  reason!: string;
}

export class WasteDto {
  @IsUUID()
  productId!: string;

  /** What was lost, in the product's unit (or `unit`). */
  @Matches(DECIMAL)
  quantity!: string;

  @IsOptional()
  @IsIn(UNIT_CODES)
  unit?: string;

  /** The first warehouse when none is named. */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  warehouse?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class StatusQuery {
  @IsOptional()
  @IsIn(PRODUCT_TYPES)
  type?: ProductType;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;
}

export class MovementsQuery {
  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  warehouse?: string;

  @IsOptional()
  @IsIn(MOVEMENT_TYPES)
  type?: MovementType;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  /** Id of the last movement of the previous page. */
  @IsOptional()
  @Matches(/^\d{1,19}$/)
  before?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? Number(value) : value))
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class WarehouseDto {
  @IsString()
  @MaxLength(20)
  code!: string;

  @IsString()
  @MaxLength(60)
  name!: string;
}

export class RenameWarehouseDto {
  @IsString()
  @MaxLength(60)
  name!: string;
}
