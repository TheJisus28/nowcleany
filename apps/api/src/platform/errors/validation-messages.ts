import type { ValidationError as ClassValidatorError } from 'class-validator';

export interface FieldError {
  readonly field: string;
  readonly message: string;
}

/**
 * class-validator default messages are English and stable in format; they are translated here so that
 * every validation error reaching a user is in Spanish without repeating `message` on each decorator.
 */
const TRANSLATIONS: readonly [RegExp, (field: string, match: RegExpExecArray) => string][] = [
  [/should not exist$/, (f) => `El campo ${f} no está permitido.`],
  [/should not be empty$/, (f) => `${f} es obligatorio.`],
  [/should not be null or undefined$/, (f) => `${f} es obligatorio.`],
  [/must be a string$/, (f) => `${f} debe ser texto.`],
  [/must be an integer number$/, (f) => `${f} debe ser un número entero.`],
  [/must be a number conforming/, (f) => `${f} debe ser un número.`],
  [/must be a boolean value$/, (f) => `${f} debe ser verdadero o falso.`],
  [/must be a UUID$/, (f) => `${f} debe ser un identificador válido (UUID).`],
  [/must be an email$/, (f) => `${f} debe ser un correo electrónico válido.`],
  [/must be an array$/, (f) => `${f} debe ser una lista.`],
  [/must be a valid ISO 8601 date string$/, (f) => `${f} debe ser una fecha válida (AAAA-MM-DD).`],
  [/must not be less than (.+)$/, (f, m) => `${f} debe ser mayor o igual a ${m[1] ?? ''}.`],
  [/must not be greater than (.+)$/, (f, m) => `${f} debe ser menor o igual a ${m[1] ?? ''}.`],
  [
    /must be longer than or equal to (\d+) characters$/,
    (f, m) => `${f} debe tener al menos ${m[1] ?? ''} caracteres.`,
  ],
  [
    /must be shorter than or equal to (\d+) characters$/,
    (f, m) => `${f} debe tener como máximo ${m[1] ?? ''} caracteres.`,
  ],
  [
    /must contain at least (\d+) elements$/,
    (f, m) => `${f} debe tener al menos ${m[1] ?? ''} elemento(s).`,
  ],
  [
    /must contain no more than (\d+) elements$/,
    (f, m) => `${f} debe tener como máximo ${m[1] ?? ''} elementos.`,
  ],
  [/must be one of the following values: (.+)$/, (f, m) => `${f} debe ser uno de: ${m[1] ?? ''}.`],
  [/must match .+ regular expression$/, (f) => `${f} no tiene un formato válido.`],
  [/must be a positive number$/, (f) => `${f} debe ser mayor que cero.`],
];

export function translateConstraint(field: string, englishMessage: string): string {
  for (const [pattern, translate] of TRANSLATIONS) {
    const match = pattern.exec(englishMessage);
    if (match) return translate(field, match);
  }
  return `${field} no es válido.`;
}

/** Flattens nested class-validator errors into `{ field: "lines.0.quantity", message }` pairs. */
export function toFieldErrors(errors: readonly ClassValidatorError[], parent = ''): FieldError[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own = Object.values(error.constraints ?? {}).map((message) => ({
      field,
      message: translateConstraint(field, message),
    }));
    return [...own, ...toFieldErrors(error.children ?? [], field)];
  });
}
