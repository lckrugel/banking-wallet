import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../users/users.module.js';
import { RegistrationController } from './registration.controller.js';
import { RegistrationService } from './registration.service.js';

@Module({
  imports: [AuthModule, UsersModule],
  controllers: [RegistrationController],
  providers: [RegistrationService],
})
export class RegistrationModule {}
