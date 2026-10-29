import { Module } from '@nestjs/common';
import { ProductCatalog } from './catalog/product-catalog.js';
import { FormulasController } from './formulas/formulas.controller.js';
import { FormulasRepository } from './formulas/formulas.repository.js';
import { FormulasService } from './formulas/formulas.service.js';
import { ProductsController } from './products/products.controller.js';
import { ProductsRepository } from './products/products.repository.js';
import { ProductsService } from './products/products.service.js';
import { CatalogLoader } from './seeds/catalog-loader.js';
import { DemoCatalogSeeder } from './seeds/demo-catalog.seeder.js';
import { ShowcaseCatalogSeeder } from './seeds/showcase-catalog.seeder.js';

@Module({
  controllers: [ProductsController, FormulasController],
  providers: [
    ProductsService,
    FormulasService,
    ProductCatalog,
    CatalogLoader,
    DemoCatalogSeeder,
    ShowcaseCatalogSeeder,
    ProductsRepository,
    FormulasRepository,
  ],
  exports: [ProductCatalog],
})
export class ProductModule {}
