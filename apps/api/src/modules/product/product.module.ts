import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../platform/db/database.module.js';
import { ProductCatalog } from './catalog/product-catalog.js';
import { FormulasController } from './formulas/formulas.controller.js';
import { FormulasRepository } from './formulas/formulas.repository.js';
import { FormulasService } from './formulas/formulas.service.js';
import { KyselyFormulasRepository } from './formulas/kysely-formulas.repository.js';
import { ProductPermissions } from './permissions.js';
import { KyselyProductsRepository } from './products/kysely-products.repository.js';
import { ProductsController } from './products/products.controller.js';
import { ProductsRepository } from './products/products.repository.js';
import { ProductsService } from './products/products.service.js';
import { CatalogLoader } from './seeds/catalog-loader.js';
import { DemoCatalogSeeder } from './seeds/demo-catalog.seeder.js';
import { ShowcaseCatalogSeeder } from './seeds/showcase-catalog.seeder.js';

@Module({
  imports: [DatabaseModule.forModule('product')],
  controllers: [ProductsController, FormulasController],
  providers: [
    ProductPermissions,
    ProductsService,
    FormulasService,
    ProductCatalog,
    CatalogLoader,
    DemoCatalogSeeder,
    ShowcaseCatalogSeeder,
    { provide: ProductsRepository, useClass: KyselyProductsRepository },
    { provide: FormulasRepository, useClass: KyselyFormulasRepository },
  ],
  exports: [ProductCatalog],
})
export class ProductModule {}
