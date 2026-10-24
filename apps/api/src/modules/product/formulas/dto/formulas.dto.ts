import { Type } from 'class-transformer';
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

const DECIMAL = /^\d+(\.\d+)?$/;

export class FormulaLineDto {
  @IsUUID()
  componentId!: string;

  /** Per batch. */
  @Matches(DECIMAL)
  quantity!: string;

  /** Defaults to the component's stock unit. */
  @IsOptional()
  @IsIn(UNIT_CODES)
  unit?: string;

  /** 100 = 1 %. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  wasteBps?: number;
}

export class SaveDraftFormulaDto {
  /** Quantity of product one batch yields. */
  @Matches(DECIMAL)
  batchYield!: string;

  @IsOptional()
  @IsIn(UNIT_CODES)
  unit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => FormulaLineDto)
  lines!: FormulaLineDto[];
}

export class RequirementsDto {
  @Matches(DECIMAL)
  quantity!: string;

  @IsOptional()
  @IsIn(UNIT_CODES)
  unit?: string;

  /** Also explode bulk components down to raw materials. */
  @IsOptional()
  @IsBoolean()
  expand?: boolean;
}
