import { Controller, Get, UseGuards } from '@nestjs/common';
import { WalletService } from './wallet.service.js';
import { CurrentUser } from '../auth/auth-user.decorator.js';
import { toWalletResponseDto } from './dto/wallet.dto.js';
import { type AuthenticatedUser, AuthGuard } from '../auth/auth.guard.js';

@UseGuards(AuthGuard)
@Controller('wallets')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  async checkWallet(@CurrentUser() user: AuthenticatedUser) {
    const wallet = await this.walletService.findUserWallet(user.id);
    return toWalletResponseDto(wallet);
  }
}
