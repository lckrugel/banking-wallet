import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../users/users.module.js';
import { RegistrationController } from './registration.controller.js';
import { RegistrationService } from './registration.service.js';
import { WalletModule } from '../wallet/wallet.module.js';
import { DatabaseModule } from '../database/database.module.js';

@Module({
  imports: [AuthModule, UsersModule, WalletModule, DatabaseModule],
  controllers: [RegistrationController],
  providers: [RegistrationService],
})
export class RegistrationModule {}
