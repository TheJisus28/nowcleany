import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { DOCUMENT_TYPES, type DocumentType } from '../../domain/customer.js';

export class BranchDto {
  @IsString()
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsLatitude()
  latitude?: number | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsLongitude()
  longitude?: number | null;
}

export class UpdateBranchDto extends BranchDto {
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

/** The main branch takes the customer's address; its location can come from the map. */
class MainBranchLocationDto {
  @IsLatitude()
  latitude!: number;

  @IsLongitude()
  longitude!: number;
}

export class CustomerDto {
  @IsIn(DOCUMENT_TYPES)
  documentType!: DocumentType;

  @IsString()
  @MaxLength(20)
  documentNumber!: string;

  /** Name (cédula) or razón social (NIT). */
  @IsString()
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  /** Seller who owns the customer (only with customers:assign; otherwise the creator). */
  @IsOptional()
  @IsUUID()
  sellerId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => MainBranchLocationDto)
  location?: MainBranchLocationDto;
}

export class UpdateCustomerDto {
  @IsOptional()
  @IsIn(DOCUMENT_TYPES)
  documentType?: DocumentType;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  documentNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  sellerId?: string | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class CustomerQuery {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @IsOptional()
  @IsUUID()
  sellerId?: string;
}
