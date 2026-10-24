import { ConflictError, ValidationError } from '../../../shared-kernel/index.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  if (email.length > 254 || !EMAIL.test(email)) {
    throw new ValidationError('identity.invalid_email', 'El correo electrónico no es válido.');
  }
  return email;
}

export function normalizeFullName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 120) {
    throw new ValidationError(
      'identity.invalid_name',
      'El nombre debe tener entre 2 y 120 caracteres.',
    );
  }
  return name;
}

export function assertPasswordPolicy(password: string): void {
  if (password.length < 8 || password.length > 128) {
    throw new ValidationError(
      'identity.weak_password',
      'La contraseña debe tener entre 8 y 128 caracteres.',
    );
  }
}

export function assertRoles(roles: readonly string[], known: ReadonlySet<string>): string[] {
  const unique = [...new Set(roles)];
  if (unique.length === 0) {
    throw new ValidationError('identity.roles_required', 'El usuario debe tener al menos un rol.');
  }
  const unknown = unique.filter((role) => !known.has(role));
  if (unknown.length > 0) {
    throw new ValidationError('identity.unknown_role', `Rol desconocido: ${unknown.join(', ')}.`, {
      roles: unknown,
    });
  }
  return unique;
}

/** An administrator cannot lock themselves out. */
export function assertSelfChangeAllowed(
  actorId: string,
  userId: string,
  change: { active?: boolean; roles?: readonly string[] },
): void {
  if (actorId !== userId) return;
  if (change.active === false) {
    throw new ConflictError(
      'identity.cannot_deactivate_self',
      'No puedes desactivar tu propio usuario.',
    );
  }
  if (change.roles && !change.roles.includes('admin')) {
    throw new ConflictError(
      'identity.cannot_drop_own_admin',
      'No puedes quitarte a ti mismo el rol de administrador.',
    );
  }
}
