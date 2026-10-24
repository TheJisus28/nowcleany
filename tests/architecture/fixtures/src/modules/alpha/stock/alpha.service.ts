import { Item } from '../domain/item.js';
import { AlphaRepository } from './alpha.repository.js';

export class AlphaService {
  constructor(
    readonly repository: AlphaRepository,
    readonly item: Item,
  ) {}
}
