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
import { ORDER_STATUSES, type OrderStatus } from '../../domain/sales-order.js';

export class OrderLineDto {
  @IsUUID()
  productId!: string;

  @Matches(/^\d+(\.\d+)?$/)
  quantity!: string;

  @IsOptional()
  @IsIn(UNIT_CODES)
  unit?: string;
}

export class OrderDto {
  @IsUUID()
  customerId!: string;

  /** Where it is delivered: a branch of the customer. */
  @IsUUID()
  branchId!: string;

  /** The visit during which the order was taken (seller app). */
  @IsOptional()
  @IsUUID()
  visitId?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  estimatedDeliveryDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => OrderLineDto)
  lines!: OrderLineDto[];
}

export class CancelOrderDto {
  @IsString()
  @MaxLength(300)
  reason!: string;
}

const toBoolean = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

export class ListOrdersQuery {
  /** One status or several separated by commas: "DRAFT,CONFIRMED". */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.split(',').filter(Boolean) : value,
  )
  @IsIn(ORDER_STATUSES, { each: true })
  status?: OrderStatus[];

  /** Only the orders registered by the current user. */
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  mine?: boolean;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  /** Only orders with a line of this product. */
  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? Number(value) : value))
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}
