import { type SyntheticEvent, useState } from 'react';
import { api } from '../../api/client';
import { useAction } from '../../api/hooks';
import type { Branch, Customer } from '../../api/types';
import { Dialog } from '../../components/dialog';
import { LocationPicker } from '../../components/map/location-picker';
import type { LatLng } from '../../components/map/types';
import { Button, Field, Input } from '../../components/ui';

/** Adds a branch to a customer or edits one: where pre-sales are delivered and visits are checked. */
export function BranchDialog({
  open,
  onClose,
  customer,
  branch,
}: {
  open: boolean;
  onClose: () => void;
  customer: Customer;
  branch?: Branch | undefined;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={branch ? `Sucursal ${branch.name}` : 'Nueva sucursal'}
      description={customer.name}
    >
      {open ? (
        <BranchForm onClose={onClose} customer={customer} {...(branch ? { branch } : {})} />
      ) : null}
    </Dialog>
  );
}

function BranchForm({
  onClose,
  customer,
  branch,
}: {
  onClose: () => void;
  customer: Customer;
  branch?: Branch;
}) {
  const [name, setName] = useState(branch?.name ?? '');
  const [address, setAddress] = useState(branch?.address ?? '');
  const [city, setCity] = useState(branch?.city ?? customer.city ?? 'Montería');
  const [phone, setPhone] = useState(branch?.phone ?? '');
  const [location, setLocation] = useState<LatLng | null>(
    typeof branch?.latitude === 'number' && typeof branch.longitude === 'number'
      ? { latitude: branch.latitude, longitude: branch.longitude }
      : null,
  );

  const body = () => ({
    name: name.trim(),
    address: address.trim(),
    city: city.trim(),
    phone: phone.trim(),
    latitude: location?.latitude ?? null,
    longitude: location?.longitude ?? null,
  });
  const save = useAction(
    () =>
      branch
        ? api.patch<Customer>(`/v1/customers/${customer.id}/branches/${branch.id}`, body())
        : api.post<Customer>(`/v1/customers/${customer.id}/branches`, body()),
    { success: branch ? 'Sucursal actualizada' : 'Sucursal agregada' },
  );
  const toggle = useAction(
    () =>
      api.patch<Customer>(`/v1/customers/${customer.id}/branches/${branch?.id ?? ''}`, {
        active: !branch?.active,
      }),
    { success: branch?.active ? 'Sucursal desactivada' : 'Sucursal activada' },
  );

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    save.mutate(undefined, { onSuccess: onClose });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5 p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre de la sucursal" hint="Como la reconocen planta y bodega.">
          {(props) => (
            <Input
              {...props}
              required
              value={name}
              placeholder="La Castellana"
              onChange={(event) => {
                setName(event.target.value);
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
        <Field label="Dirección">
          {(props) => (
            <Input
              {...props}
              value={address}
              placeholder="Carrera 6 # 61-15"
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
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-ink-2">Ubicación</span>
        <LocationPicker
          value={location}
          onChange={setLocation}
          initialQuery={address ? [address, city].filter(Boolean).join(', ') : ''}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
        {branch && !branch.isMain ? (
          <Button
            variant={branch.active ? 'danger' : 'secondary'}
            loading={toggle.isPending}
            onClick={() => {
              toggle.mutate(undefined, { onSuccess: onClose });
            }}
          >
            {branch.active ? 'Desactivar sucursal' : 'Activar sucursal'}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={save.isPending}>
            {branch ? 'Guardar cambios' : 'Agregar sucursal'}
          </Button>
        </div>
      </div>
    </form>
  );
}
