import { ValidationError } from '../../../shared-kernel/index.js';

export const SHIPMENT_STATUSES = ['PLANNED', 'IN_TRANSIT', 'DELIVERED'] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  PLANNED: 'Por despachar',
  IN_TRANSIT: 'En ruta',
  DELIVERED: 'Entregada',
};

export function shipmentLabel(number: bigint | number): string {
  return `GU-${number.toString().padStart(5, '0')}`;
}

/** Colombian vehicle plate: ABC123 (cars, trucks) or ABC12D (motorcycles). */
export function normalizePlate(raw: string): string {
  const plate = raw.replace(/[\s-]/g, '').toUpperCase();
  if (!/^[A-Z]{3}\d{2}[A-Z0-9]$/.test(plate)) {
    throw new ValidationError('logistics.invalid_plate', 'La placa debe tener el formato ABC123.');
  }
  return plate;
}

export function requireText(raw: string, field: string, max: number): string {
  const text = raw.trim().replace(/\s+/g, ' ');
  if (text.length < 2 || text.length > max) {
    throw new ValidationError(
      'logistics.invalid_field',
      `${field} debe tener entre 2 y ${String(max)} caracteres.`,
    );
  }
  return text;
}
