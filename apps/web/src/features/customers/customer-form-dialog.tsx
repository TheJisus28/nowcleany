import { type SyntheticEvent, useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../../api/client';
import { useAction, useSellers } from '../../api/hooks';
import type { Customer, DocumentType } from '../../api/types';
import { useSession } from '../../auth/session';
import { Dialog } from '../../components/dialog';
import { pathTo } from '../../components/links';
import { LocationPicker } from '../../components/map/location-picker';
import type { LatLng } from '../../components/map/types';
import { Button, Field, Input, Segmented, Select } from '../../components/ui';

const DOCUMENT_OPTIONS: readonly { value: DocumentType; label: string }[] = [
  { value: 'NIT', label: 'NIT (empresa)' },
  { value: 'CC', label: 'Cédula (persona)' },
];

/** Creates a customer (with its main branch) or edits one. The name field follows the document. */
export function CustomerFormDialog({
  open,
  onClose,
  customer,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  customer?: Customer;
  /** Replaces opening the new customer page (e.g. when created from the order form). */
  onCreated?: (customer: Customer) => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={customer ? `Editar ${customer.name}` : 'Nuevo cliente'}
      description={
        customer
          ? 'Los cambios aplican a las próximas preventas.'
          : 'Se crea con su sucursal principal en la dirección que registres.'
      }
    >
      {open ? (
        <CustomerForm
          onClose={onClose}
          {...(customer ? { customer } : {})}
          {...(onCreated ? { onCreated } : {})}
        />
      ) : null}
    </Dialog>
  );
}

function CustomerForm({
  onClose,
  customer,
  onCreated,
}: {
  onClose: () => void;
  customer?: Customer;
  onCreated?: (customer: Customer) => void;
}) {
  const navigate = useNavigate();
  const { can, profile } = useSession();
  const canAssign = can('customers:assign');
  const sellers = useSellers(canAssign);
  const [documentType, setDocumentType] = useState<DocumentType>(customer?.documentType ?? 'NIT');
  const [documentNumber, setDocumentNumber] = useState(customer?.documentNumber ?? '');
  const [name, setName] = useState(customer?.name ?? '');
  const [address, setAddress] = useState(customer?.address ?? '');
  const [city, setCity] = useState(customer?.city ?? 'Montería');
  const [phone, setPhone] = useState(customer?.phone ?? '');
  const [sellerId, setSellerId] = useState(customer?.seller?.id ?? '');
  const [location, setLocation] = useState<LatLng | null>(null);

  const save = useAction(
    () => {
      const body = {
        documentType,
        documentNumber: documentNumber.trim(),
        name: name.trim(),
        address: address.trim(),
        city: city.trim(),
        phone: phone.trim(),
      };
      if (customer) {
        return api.patch<Customer>(`/v1/customers/${customer.id}`, {
          ...body,
          ...(canAssign ? { sellerId: sellerId || null } : {}),
        });
      }
      return api.post<Customer>('/v1/customers', {
        ...body,
        ...(canAssign && sellerId ? { sellerId } : {}),
        ...(location ? { location } : {}),
      });
    },
    { success: (saved) => (customer ? 'Cliente actualizado' : `Cliente ${saved.name} creado`) },
  );

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    save.mutate(undefined, {
      onSuccess: (saved) => {
        onClose();
        if (customer) return;
        if (onCreated) onCreated(saved);
        else void navigate(pathTo('customer', saved.id));
      },
    });
  };

  const isCompany = documentType === 'NIT';
  return (
    <form onSubmit={submit} className="flex flex-col gap-5 p-5">
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-ink-2">Tipo de documento</span>
        <Segmented
          label="Tipo de documento"
          value={documentType}
          options={DOCUMENT_OPTIONS}
          onChange={setDocumentType}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
        <Field
          label={isCompany ? 'NIT' : 'Número de cédula'}
          hint={isCompany ? 'Con dígito de verificación: 900123456-7' : 'Solo números'}
        >
          {(props) => (
            <Input
              {...props}
              required
              value={documentNumber}
              inputMode="numeric"
              onChange={(event) => {
                setDocumentNumber(event.target.value);
              }}
            />
          )}
        </Field>
        <Field label={isCompany ? 'Razón social' : 'Nombre completo'}>
          {(props) => (
            <Input
              {...props}
              required
              value={name}
              placeholder={isCompany ? 'Supermercados La Economía S.A.S.' : 'Carmen Elena Pérez'}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          )}
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_180px_180px]">
        <Field label="Dirección">
          {(props) => (
            <Input
              {...props}
              value={address}
              placeholder="Calle 41 # 6-20, Centro"
              onChange={(event) => {
                setAddress(event.target.value);
              }}
            />
          )}
        </Field>
        <Field label="Ciudad">
          {(props) => (
            <Input
              {...props}
              value={city}
              onChange={(event) => {
                setCity(event.target.value);
              }}
            />
          )}
        </Field>
        <Field label="Teléfono">
          {(props) => (
            <Input
              {...props}
              value={phone}
              inputMode="tel"
              onChange={(event) => {
                setPhone(event.target.value);
              }}
            />
          )}
        </Field>
      </div>
      {canAssign ? (
        <Field
          label="Vendedor de la cartera"
          hint="Solo ese vendedor verá el cliente, sus preventas y visitas."
        >
          {(props) => (
            <Select
              {...props}
              value={sellerId}
              onChange={(event) => {
                setSellerId(event.target.value);
              }}
            >
              <option value="">Sin asignar</option>
              {(sellers.data ?? []).map((seller) => (
                <option key={seller.id} value={seller.id}>
                  {seller.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      ) : !customer ? (
        <p className="text-[13px] text-ink-2">
          El cliente queda en tu cartera ({profile?.fullName ?? 'tú'}).
        </p>
      ) : null}
      {!customer ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink-2">
            Ubicación de la sucursal principal (opcional)
          </span>
          <LocationPicker
            value={location}
            onChange={setLocation}
            initialQuery={[address, city].filter(Boolean).join(', ')}
          />
        </div>
      ) : null}
      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" loading={save.isPending}>
          {customer ? 'Guardar cambios' : 'Crear cliente'}
        </Button>
      </div>
    </form>
  );
}
