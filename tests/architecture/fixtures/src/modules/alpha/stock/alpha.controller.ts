// BAD: controller-not-to-repository
import { AlphaRepository } from './alpha.repository.js';
import { AlphaService } from './alpha.service.js';

export class AlphaController {
  constructor(
    readonly service: AlphaService,
    readonly repository: AlphaRepository,
  ) {}
}
