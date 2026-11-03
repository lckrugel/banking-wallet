import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { AuthGuard } from './auth.guard.js';
import type { AuthenticatedUser } from './auth.guard.js';
import { CurrentUser } from './auth-user.decorator.js';
import type { LoginResponseDto } from './dto/login-response.dto.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() body: LoginDto): Promise<LoginResponseDto> {
    return this.auth.login(body.email, body.password);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  async logout(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ success: true }> {
    await this.auth.logout(user.sessionId, user.id);
    return { success: true };
  }
}
