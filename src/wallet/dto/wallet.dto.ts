import { Wallet } from '../wallet.entity.js';

export class WalletResponseDto {
  walletId: string;
  balance: string;
}

export function toWalletResponseDto(wallet: Wallet): WalletResponseDto {
  return {
    walletId: wallet.id,
    balance: `${wallet.balanceCents}`,
  };
}
