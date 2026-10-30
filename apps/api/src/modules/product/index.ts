// Public API of the product module.
export {
  type Capacity,
  type ComponentNeed,
  ProductCatalog,
  type ProductSummary,
  type RequirementsResult,
} from './catalog/product-catalog.js';
export {
  PRODUCT_TYPE_LABELS,
  type ProductType,
  PURCHASABLE_TYPES,
  SELLABLE_TYPES,
} from './domain/product.js';
export { ProductModule } from './product.module.js';
