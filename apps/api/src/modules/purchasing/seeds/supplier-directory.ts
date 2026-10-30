import { Injectable } from '@nestjs/common';
import { SuppliersRepository } from '../suppliers/suppliers.repository.js';
import { type SupplierCommand, SuppliersService } from '../suppliers/suppliers.service.js';

// DATOS DE EJEMPLO: proveedores inventados de la región.
const SUPPLIERS: readonly SupplierCommand[] = [
  {
    name: 'Cartones de Córdoba S.A.S.',
    documentNumber: '900654321-2',
    contact: 'Martha Lucía Ortega',
    phone: '604 782 4411',
    email: 'ventas@cartonescordoba.example',
    city: 'Montería',
  },
  {
    name: 'Químicos del Caribe S.A.S.',
    documentNumber: '890112233-4',
    contact: 'Jorge Iván Ríos',
    phone: '605 360 2200',
    email: 'pedidos@quimicoscaribe.example',
    city: 'Barranquilla',
  },
  {
    name: 'Plásticos del Sinú S.A.S.',
    documentNumber: '901445566-8',
    contact: 'Ana María Cogollo',
    phone: '604 784 9922',
    email: 'comercial@plasticossinu.example',
    city: 'Montería',
  },
  {
    name: 'Químicos Industriales de la Costa',
    documentNumber: '800778899-1',
    contact: 'Ricardo Gómez',
    phone: '605 693 1010',
    email: 'ventas@qicosta.example',
    city: 'Cartagena',
  },
  {
    name: 'Litografía Montería',
    documentNumber: '901223344-5',
    contact: 'Paola Andrea Petro',
    phone: '604 781 5566',
    email: 'etiquetas@litomonteria.example',
    city: 'Montería',
  },
  {
    name: 'Solventes y Alcoholes del Norte',
    documentNumber: '890556677-9',
    contact: 'Hernán Díaz',
    phone: '605 371 8080',
    email: 'pedidos@solventesnorte.example',
    city: 'Barranquilla',
  },
  {
    name: 'Distribuidora Aseo Total S.A.S.',
    documentNumber: '901778899-3',
    contact: 'Liliana Arrieta',
    phone: '604 783 2020',
    email: 'ventas@aseototal.example',
    city: 'Montería',
  },
];

/** Finds (or creates, from the example data) a supplier by name for the purchasing seeds. */
@Injectable()
export class SupplierDirectory {
  constructor(
    private readonly repository: SuppliersRepository,
    private readonly suppliers: SuppliersService,
  ) {}

  async idOf(name: string): Promise<string> {
    const existing = await this.repository.findByName(name);
    if (existing) return existing.id;
    const data = SUPPLIERS.find((supplier) => supplier.name === name) ?? { name };
    return (await this.suppliers.create(data)).id;
  }
}
