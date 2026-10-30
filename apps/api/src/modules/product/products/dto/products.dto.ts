import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { UNIT_CODES } from '../../../../shared-kernel/index.js';
import { PRODUCT_TYPES, type ProductType } from '../../domain/product.js';

const DECIMAL = /^\d+(\.\d+)?$/;

export class CreateProductDto {
  @IsString()
  @MaxLength(40)
  code!: string;

  @IsString()
  @MaxLength(160)
  name!: string;

  @IsIn(PRODUCT_TYPES)
  type!: ProductType;

  @IsIn(UNIT_CODES)
  stockUnit!: string;

  /** Bulk only, in the stock unit. */
  @IsOptional()
  @Matches(DECIMAL)
  batchCapacity?: string;

  /** Pesos per stock unit (finished goods). */
  @IsOptional()
  @Matches(/^\d{1,13}$/)
  price?: string;

  /** Pesos per stock unit (raw materials). */
  @IsOptional()
  @Matches(/^\d{1,13}$/)
  cost?: string;
}

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  /** In the stock unit; "" clears it. */
  @IsOptional()
  @Matches(/^(\d+(\.\d+)?)?$/)
  batchCapacity?: string;

  /** Pesos per stock unit; "" clears it. */
  @IsOptional()
  @Matches(/^(\d{1,13})?$/)
  price?: string;

  @IsOptional()
  @Matches(/^(\d{1,13})?$/)
  cost?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class ListProductsQuery {
  @IsOptional()
  @IsIn(PRODUCT_TYPES)
  type?: ProductType;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;
}
