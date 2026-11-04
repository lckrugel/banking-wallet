import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { WalletService } from './wallet.service.js';
import { CurrentUser } from '../auth/auth-user.decorator.js';
import { toWalletResponseDto } from './dto/wallet.dto.js';
import { type AuthenticatedUser, AuthGuard } from '../auth/auth.guard.js';
import { WalletHistoryService } from './wallet-history.js';

@UseGuards(AuthGuard)
@Controller('wallets')
export class WalletController {
  constructor(
    private readonly walletService: WalletService,
    private readonly historyService: WalletHistoryService,
  ) {}

  @Get('history')
  async history(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.historyService.history(user.id, limit, cursor);
  }

  @Get()
  async checkWallet(@CurrentUser() user: AuthenticatedUser) {
    const wallet = await this.walletService.findUserWallet(user.id);
    return toWalletResponseDto(wallet);
  }
}
