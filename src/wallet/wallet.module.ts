import { Module } from '@nestjs/common';
import { WalletController } from './wallet.controller.js';
import { AuthModule } from '../auth/auth.module.js';
import { WalletService } from './wallet.service.js';
import { WalletRepository } from './wallet.repository.js';
import { DatabaseModule } from '../database/database.module.js';
import { EventsModule } from '../events/events.module.js';
import { WalletConsistencyVerifier } from './wallet-consistency-verifier.js';
import { WalletHistoryService } from './wallet-history.js';

@Module({
  imports: [AuthModule, DatabaseModule, EventsModule],
  controllers: [WalletController],
  providers: [
    WalletService,
    WalletRepository,
    WalletConsistencyVerifier,
    WalletHistoryService,
  ],
  exports: [WalletService, WalletRepository, WalletConsistencyVerifier],
})
export class WalletModule {}
