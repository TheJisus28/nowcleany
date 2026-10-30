import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { SHIPMENT_STATUSES, type ShipmentStatus } from '../../domain/shipment.js';

export class CreateShipmentDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  orderIds!: string[];

  @IsString()
  @MaxLength(120)
  carrier!: string;

  @IsString()
  @MaxLength(10)
  vehiclePlate!: string;

  @IsString()
  @MaxLength(120)
  driverName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  route?: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  scheduledDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class DeliverDto {
  @IsString()
  @MaxLength(120)
  receivedBy!: string;
}

export class ShipmentsQuery {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.split(',').filter(Boolean) : value,
  )
  @IsIn(SHIPMENT_STATUSES, { each: true })
  status?: ShipmentStatus[];

  @IsOptional()
  @IsUUID()
  orderId?: string;
}
