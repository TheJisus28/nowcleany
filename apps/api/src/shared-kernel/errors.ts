export type DomainErrorKind =
  'NOT_FOUND' | 'CONFLICT' | 'VALIDATION' | 'FORBIDDEN' | 'UNAUTHORIZED';

/**
 * Base class for expected business errors. `code` is stable (clients may branch on it);
 * `message` is the human-readable text shown to users, in Spanish.
 */
export abstract class DomainError extends Error {
  abstract readonly kind: DomainErrorKind;

  constructor(
    readonly code: string,
    message: string,
    readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends DomainError {
  readonly kind = 'NOT_FOUND';
}

export class ConflictError extends DomainError {
  readonly kind = 'CONFLICT';
}

export class ValidationError extends DomainError {
  readonly kind = 'VALIDATION';
}

export class ForbiddenError extends DomainError {
  readonly kind = 'FORBIDDEN';
}

export class UnauthorizedError extends DomainError {
  readonly kind = 'UNAUTHORIZED';
}
