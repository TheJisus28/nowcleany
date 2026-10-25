import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Permission } from '../../../platform/security/decorators.js';
import { ValidationError } from '../../../shared-kernel/index.js';
import { RequirementsDto, SaveDraftFormulaDto } from '../formulas/dto/formulas.dto.js';
import type { FormulaView } from '../formulas/formula-view.js';
import {
  FormulasService,
  type RequirementsView,
  type WhereUsedView,
} from '../formulas/formulas.service.js';
import { CreateProductDto, ListProductsQuery, UpdateProductDto } from './dto/products.dto.js';
import type { ProductView } from './product-view.js';
import { type ImportResult, ProductsService } from './products.service.js';

@ApiTags('products')
@ApiBearerAuth()
@Controller('v1/products')
export class ProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly formulas: FormulasService,
  ) {}

  @Permission('products:read')
  @Get()
  list(@Query() query: ListProductsQuery): Promise<ProductView[]> {
    return this.products.list({
      ...(query.type ? { type: query.type } : {}),
      ...(query.active === undefined ? {} : { active: query.active }),
      ...(query.q ? { search: query.q } : {}),
    });
  }

  @Permission('products:write')
  @Post()
  create(@Body() body: CreateProductDto): Promise<ProductView> {
    return this.products.create(body);
  }

  /** text/csv body with columns codigo; nombre; tipo; unidad; [capacidad_bache]. */
  @Permission('products:write')
  @ApiConsumes('text/csv')
  @Post('import')
  import(@Body() csv: unknown): Promise<ImportResult> {
    if (typeof csv !== 'string') {
      throw new ValidationError('product.import_format', 'Envía el archivo como text/csv.');
    }
    return this.products.import(csv);
  }

  @Permission('products:read')
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<ProductView> {
    return this.products.get(id);
  }

  @Permission('products:write')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateProductDto,
  ): Promise<ProductView> {
    return this.products.update(id, body);
  }

  /** Deactivates: products are never deleted. */
  @Permission('products:write')
  @Delete(':id')
  @HttpCode(204)
  async deactivate(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.products.deactivate(id);
  }

  @Permission('products:read')
  @Get(':id/formulas')
  history(@Param('id', ParseUUIDPipe) id: string): Promise<FormulaView[]> {
    return this.formulas.history(id);
  }

  @Permission('products:read')
  @Get(':id/active-formula')
  activeFormula(@Param('id', ParseUUIDPipe) id: string): Promise<FormulaView> {
    return this.formulas.current(id, 'ACTIVE');
  }

  @Permission('products:read')
  @Get(':id/draft-formula')
  draftFormula(@Param('id', ParseUUIDPipe) id: string): Promise<FormulaView> {
    return this.formulas.current(id, 'DRAFT');
  }

  @Permission('formulas:draft')
  @Put(':id/draft-formula')
  saveDraft(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SaveDraftFormulaDto,
  ): Promise<FormulaView> {
    return this.formulas.saveDraft(id, body);
  }

  @Permission('formulas:draft')
  @Delete(':id/draft-formula')
  @HttpCode(204)
  async discardDraft(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.formulas.discardDraft(id);
  }

  @Permission('products:read')
  @Get(':id/where-used')
  whereUsed(@Param('id', ParseUUIDPipe) id: string): Promise<WhereUsedView[]> {
    return this.formulas.whereUsed(id);
  }

  @Permission('products:read')
  @Post(':id/requirements')
  @HttpCode(200)
  requirements(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RequirementsDto,
  ): Promise<RequirementsView> {
    return this.formulas.requirements(id, body);
  }
}
