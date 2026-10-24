import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class CustomerDto {
  @IsString()
  @MaxLength(160)
  name!: string;

  /** NIT or ID document. */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  taxId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;
}

export class UpdateCustomerDto extends CustomerDto {
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class CustomerQuery {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;
}
