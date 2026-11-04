import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { WalletModule } from '../wallet/wallet.module.js';
import { UsersModule } from '../users/users.module.js';
import { TransfersController } from './transfers.controller.js';
import { TransfersService } from './transfers.service.js';
import { IdempotencyRepository } from './idempotency.repository.js';
import { TransfersRepository } from './transfers.repository.js';

@Module({
  imports: [AuthModule, DatabaseModule, WalletModule, UsersModule],
  controllers: [TransfersController],
  providers: [TransfersService, IdempotencyRepository, TransfersRepository],
})
export class TransfersModule {}
