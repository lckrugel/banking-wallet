import { Body, Controller, Post } from '@nestjs/common';
import { RegisterDto } from './dto/register.dto.js';
import { RegistrationService } from './registration.service.js';
import type { UserResponseDto } from '../users/dto/user-response.dto.js';

@Controller('users')
export class RegistrationController {
  constructor(private readonly registration: RegistrationService) {}

  @Post()
  register(@Body() body: RegisterDto): Promise<UserResponseDto> {
    return this.registration.register(body);
  }
}
