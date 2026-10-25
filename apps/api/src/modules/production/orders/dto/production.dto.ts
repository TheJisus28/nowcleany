import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { UNIT_CODES } from '../../../../shared-kernel/index.js';
import { PRODUCTION_STATUSES, type ProductionStatus } from '../../domain/production-order.js';

const DECIMAL = /^\d+(\.\d+)?$/;

export class CreateProductionOrderDto {
  @IsUUID()
  productId!: string;

  /** Liters of bulk, or units to package. */
  @Matches(DECIMAL)
  quantity!: string;

  @IsOptional()
  @IsIn(UNIT_CODES)
  unit?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  scheduledDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class CompleteProductionOrderDto {
  /** Real output; defaults to the planned quantity. */
  @IsOptional()
  @Matches(DECIMAL)
  producedQuantity?: string;

  @IsOptional()
  @IsIn(UNIT_CODES)
  unit?: string;
}

export class ListProductionOrdersQuery {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.split(',').filter(Boolean) : value,
  )
  @IsIn(PRODUCTION_STATUSES, { each: true })
  status?: ProductionStatus[];

  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? Number(value) : value))
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}
