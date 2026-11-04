import { Body, Controller, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RegisterDto } from './dto/register.dto.js';
import { RegistrationService } from './registration.service.js';
import { UserResponseDto } from '../users/dto/user-response.dto.js';

@Controller('users')
@ApiTags('Usuários')
export class RegistrationController {
  constructor(private readonly registration: RegistrationService) {}

  @Post()
  @ApiOperation({ summary: 'Cadastrar usuário' })
  @ApiCreatedResponse({ type: UserResponseDto })
  register(@Body() body: RegisterDto): Promise<UserResponseDto> {
    return this.registration.register(body);
  }
}
