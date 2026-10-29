import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permission } from '../../../platform/security/decorators.js';
import { CreateUserDto, ResetPasswordDto, UpdateUserDto } from './dto/users.dto.js';
import type { RoleView, UserView } from './user-view.js';
import { UsersService } from './users.service.js';

@ApiTags('users')
@ApiBearerAuth()
@Controller('v1/users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Permission('users:read')
  @Get()
  list(): Promise<UserView[]> {
    return this.users.list();
  }

  @Permission('users:manage')
  @Post()
  create(@Body() body: CreateUserDto): Promise<UserView> {
    return this.users.create(body);
  }

  @Permission('users:manage')
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateUserDto): Promise<UserView> {
    return this.users.update(id, body);
  }

  @Permission('users:manage')
  @Post(':id/password')
  @HttpCode(204)
  async resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ResetPasswordDto,
  ): Promise<void> {
    await this.users.resetPassword(id, body.password);
  }
}

@ApiTags('users')
@ApiBearerAuth()
@Controller('v1/roles')
export class RolesController {
  constructor(private readonly users: UsersService) {}

  @Permission('users:read')
  @Get()
  list(): RoleView[] {
    return this.users.roles();
  }
}
