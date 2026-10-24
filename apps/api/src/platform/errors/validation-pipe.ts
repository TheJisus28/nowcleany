import { ValidationPipe } from '@nestjs/common';
import { ValidationError } from '../../shared-kernel/index.js';
import { toFieldErrors } from './validation-messages.js';

/** Global pipe: unknown fields are rejected and every failure becomes a 422 with Spanish messages. */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    validationError: { target: false, value: false },
    exceptionFactory: (errors) =>
      new ValidationError('request.invalid', 'Los datos enviados no son válidos.', {
        errors: toFieldErrors(errors),
      }),
  });
}
