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
import {
  INVOICE_DOCUMENT_TYPES,
  type InvoiceDocumentType,
  PAYMENT_METHODS,
} from '../../domain/invoice.js';

class IssueOrderDto {
  @IsUUID()
  orderId!: string;

  @IsOptional()
  @IsBoolean()
  allowPartial?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(9999)
  priority?: number;

  @IsOptional()
  @IsIn(INVOICE_DOCUMENT_TYPES, {
    message: 'El documento es FEL (factura electrónica) o REM (remisión).',
  })
  documentType?: InvoiceDocumentType;
}

/** The consolidation: the pre-sales the consolidator invoices now. */
export class IssueInvoicesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => IssueOrderDto)
  orders!: IssueOrderDto[];
}

export class PaymentDto {
  /** Pesos, integer. */
  @Matches(/^\d{1,13}$/)
  amount!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  paidOn!: string;

  @IsIn(PAYMENT_METHODS)
  method!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  reference?: string;
}

export class ListInvoicesQuery {
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  orderId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  open?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2000)
  limit?: number;
}
