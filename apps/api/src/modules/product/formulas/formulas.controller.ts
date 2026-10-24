import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permission } from '../../../platform/security/decorators.js';
import type { FormulaView } from './formula-view.js';
import { FormulasService } from './formulas.service.js';

@ApiTags('products')
@ApiBearerAuth()
@Controller('v1/formulas')
export class FormulasController {
  constructor(private readonly formulas: FormulasService) {}

  @Permission('products:read')
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<FormulaView> {
    return this.formulas.get(id);
  }

  @Permission('formulas:publish')
  @Post(':id/publish')
  @HttpCode(200)
  publish(@Param('id', ParseUUIDPipe) id: string): Promise<FormulaView> {
    return this.formulas.publish(id);
  }
}
