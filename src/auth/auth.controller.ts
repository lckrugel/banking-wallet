import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { AuthGuard } from './auth.guard.js';
import type { AuthenticatedUser } from './auth.guard.js';
import { CurrentUser } from './auth-user.decorator.js';
import { LoginResponseDto } from './dto/login-response.dto.js';

@Controller('auth')
@ApiTags('Autenticação')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Entrar e obter um token de acesso' })
  @ApiOkResponse({ type: LoginResponseDto })
  login(@Body() body: LoginDto): Promise<LoginResponseDto> {
    return this.auth.login(body.email, body.password);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Encerrar a sessão atual' })
  @ApiOkResponse({ schema: { type: 'object', properties: { success: { type: 'boolean', enum: [true] } } } })
  async logout(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ success: true }> {
    await this.auth.logout(user.sessionId, user.id);
    return { success: true };
  }
}
