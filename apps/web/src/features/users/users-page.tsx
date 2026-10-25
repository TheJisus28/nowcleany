import { CircleCheck, CircleDashed, UserPlus, Users } from 'lucide-react';
import { useState } from 'react';
import { api } from '../../api/client';
import { useAction, useRoles, useUsers } from '../../api/hooks';
import type { User } from '../../api/types';
import { ROLE_LABELS } from '../../app/nav';
import { useProfile, useSession } from '../../auth/session';
import { DataTable } from '../../components/data-table';
import { Dialog } from '../../components/dialog';
import { Chip } from '../../components/status';
import {
  Button,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Panel,
  QueryView,
} from '../../components/ui';
import { formatDateTime } from '../../lib/format';

export function UsersPage() {
  const { can } = useSession();
  const users = useUsers();
  const [editing, setEditing] = useState<User | 'new' | null>(null);

  return (
    <>
      <PageHeader
        title="Usuarios"
        description="Quién entra al sistema y con qué rol. Cada rol abre sus paneles."
        actions={
          can('users:manage') ? (
            <Button
              icon={<UserPlus className="size-4" />}
              onClick={() => {
                setEditing('new');
              }}
            >
              Nuevo usuario
            </Button>
          ) : null
        }
      />
      <Panel flush>
        <QueryView query={users}>
          {(rows) => (
            <DataTable<User>
              label="Usuarios"
              rows={rows}
              rowKey={(row) => row.id}
              onRowClick={can('users:manage') ? setEditing : undefined}
              empty={<EmptyState icon={<Users />} title="No hay usuarios" />}
              columns={[
                {
                  key: 'name',
                  header: 'Nombre',
                  render: (row) => (
                    <span>
                      <span className="font-medium">{row.fullName}</span>
                      <span className="block text-[12.5px] text-ink-3">{row.email}</span>
                    </span>
                  ),
                },
                {
                  key: 'roles',
                  header: 'Roles',
                  render: (row) => row.roles.map((role) => ROLE_LABELS[role] ?? role).join(', '),
                },
                {
                  key: 'status',
                  header: 'Estado',
                  render: (row) =>
                    row.active ? (
                      <Chip tone="good" icon={CircleCheck}>
                        Activo
                      </Chip>
                    ) : (
                      <Chip tone="neutral" icon={CircleDashed}>
                        Desactivado
                      </Chip>
                    ),
                },
                {
                  key: 'login',
                  header: 'Último ingreso',
                  hideOnMobile: true,
                  render: (row) =>
                    row.lastLoginAt ? (
                      formatDateTime(row.lastLoginAt)
                    ) : (
                      <span className="text-ink-3">Nunca</span>
                    ),
                },
              ]}
            />
          )}
        </QueryView>
      </Panel>
      {editing ? (
        <UserDialog
          user={editing === 'new' ? null : editing}
          onClose={() => {
            setEditing(null);
          }}
        />
      ) : null}
    </>
  );
}

function UserDialog({ user, onClose }: { user: User | null; onClose: () => void }) {
  const roles = useRoles();
  const profile = useProfile();
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [password, setPassword] = useState('');
  const [selected, setSelected] = useState<string[]>(user?.roles ?? []);
  const [active, setActive] = useState(user?.active ?? true);

  const save = useAction(
    async () => {
      if (!user) {
        return api.post<User>('/v1/users', { email, fullName, password, roles: selected });
      }
      const updated = await api.patch<User>(`/v1/users/${user.id}`, {
        fullName,
        roles: selected,
        active,
      });
      if (password) await api.post(`/v1/users/${user.id}/password`, { password });
      return updated;
    },
    { success: (saved) => (user ? `${saved.fullName} actualizado` : `${saved.fullName} creado`) },
  );

  const valid =
    fullName.trim().length >= 2 &&
    selected.length > 0 &&
    (user ? password === '' || password.length >= 8 : email.includes('@') && password.length >= 8);

  return (
    <Dialog
      open
      onClose={onClose}
      title={user ? `Editar ${user.fullName}` : 'Nuevo usuario'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            loading={save.isPending}
            disabled={!valid}
            onClick={() => {
              save.mutate(undefined, { onSuccess: onClose });
            }}
          >
            {user ? 'Guardar cambios' : 'Crear usuario'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Nombre completo">
          {(props) => (
            <Input
              {...props}
              value={fullName}
              onChange={(event) => {
                setFullName(event.target.value);
              }}
            />
          )}
        </Field>
        {user ? null : (
          <Field label="Correo">
            {(props) => (
              <Input
                {...props}
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                }}
              />
            )}
          </Field>
        )}
        <Field
          label={user ? 'Nueva contraseña (opcional)' : 'Contraseña'}
          hint="Mínimo 8 caracteres."
        >
          {(props) => (
            <Input
              {...props}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
              }}
            />
          )}
        </Field>
        <fieldset>
          <legend className="mb-2 text-[13px] font-medium text-ink-2">Roles</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(roles.data ?? []).map((role) => (
              <label
                key={role.code}
                className="flex cursor-pointer items-start gap-2.5 rounded-md border border-line p-2.5 text-sm has-checked:border-brand has-checked:bg-brand-soft/50"
              >
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-[#003858]"
                  checked={selected.includes(role.code)}
                  onChange={(event) => {
                    setSelected((current) =>
                      event.target.checked
                        ? [...current, role.code]
                        : current.filter((code) => code !== role.code),
                    );
                  }}
                />
                <span>
                  <span className="font-medium">{role.name}</span>
                  <span className="block text-[12.5px] text-ink-3">{role.description}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {user && user.id !== profile.id ? (
          <label className="flex items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-[#003858]"
              checked={active}
              onChange={(event) => {
                setActive(event.target.checked);
              }}
            />
            Usuario activo (si lo desactivas, no puede entrar)
          </label>
        ) : null}
      </div>
    </Dialog>
  );
}
